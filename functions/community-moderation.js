const { createHash } = require("node:crypto");
const { getDatabase, ServerValue } = require("firebase-admin/database");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { COMMUNITY_LIMITS, nextRateWindow, validateId, isValidPostLocation, validateCommunityPost, validateReportReason } = require("./community-policy");

const DEVELOPER_EMAIL = "quickcheck.edu@gmail.com";
const FUNCTION_REGION = "asia-southeast1";
const db = () => getDatabase();

function signedIn(request) {
    const auth = request.auth;
    if (!auth?.uid || auth.token.firebase?.sign_in_provider === "anonymous") {
        throw new HttpsError("unauthenticated", "Sign in with a registered account.");
    }
    if (auth.token.email_verified !== true) throw new HttpsError("permission-denied", "Verify your email before participating.");
    return auth;
}

function moderator(auth) {
    if (auth.token.role !== "developer" || auth.token.email !== DEVELOPER_EMAIL || auth.token.email_verified !== true) {
        throw new HttpsError("permission-denied", "Verified moderator access is required.");
    }
}

function validateInput(callback) {
    try { return callback(); }
    catch (error) { throw new HttpsError("invalid-argument", error.message); }
}

async function consumeLimit(uid, action) {
    const limit = COMMUNITY_LIMITS[action];
    const result = await db().ref(`community_security/rateLimits/${uid}/${action}`)
        .transaction(current => nextRateWindow(current, Date.now(), limit), undefined, false);
    if (!result.committed) throw new HttpsError("resource-exhausted", `Community ${action} limit reached. Try again later.`);
}

async function isBlocked(uid, otherUid) {
    if (uid === otherUid) return false;
    const [snapshot, reverse] = await Promise.all([
        db().ref(`community_blocks/${uid}/${otherUid}`).get(),
        db().ref(`community_blocks/${otherUid}/${uid}`).get()
    ]);
    return snapshot.val() === true || reverse.val() === true;
}

async function assertCanAccessPost(uid, location, post) {
    if (await isBlocked(uid, post.authorId)) throw new HttpsError("permission-denied", "This account cannot interact with this post.");
    if (location.startsWith("community_private_posts/")) {
        const owner = location.split("/")[1];
        if (owner !== post.authorId) throw new HttpsError("permission-denied", "This post has an invalid owner.");
        const [forward, reverse] = await Promise.all([
            db().ref(`message_contacts/${owner}/${uid}/status`).get(),
            db().ref(`message_contacts/${uid}/${owner}/status`).get()
        ]);
        if (owner !== uid && (forward.val() !== "connected" || reverse.val() !== "connected")) {
            throw new HttpsError("permission-denied", "Only connected friends can access this post.");
        }
    }
}

exports.publishCommunityPost = onCall({ region: FUNCTION_REGION, maxInstances: 10 }, async request => {
    const auth = signedIn(request);
    const postId = validateInput(() => validateId(request.data?.postId));
    let post;
    try {
        post = validateCommunityPost(request.data?.post, auth.uid, postId,
            auth.token.role === "developer" && auth.token.email === DEVELOPER_EMAIL && auth.token.email_verified === true);
    } catch (error) {
        throw new HttpsError("invalid-argument", error.message);
    }
    if (post.visibility === "friends" && post.mediaType && !post.mediaKey) throw new HttpsError("invalid-argument", "Friends-only attachments must be encrypted.");
    const location = post.visibility === "friends"
        ? `community_private_posts/${auth.uid}/${postId}`
        : `community_posts/${postId}`;
    await consumeLimit(auth.uid, "post");
    const result = await db().ref(location).transaction(current => current === null ? {
        ...post, createdAt: ServerValue.TIMESTAMP
    } : undefined, undefined, false);
    if (!result.committed) throw new HttpsError("already-exists", "This post ID is already in use.");
    return { id: postId };
});

exports.createCommunityComment = onCall({ region: FUNCTION_REGION, maxInstances: 10 }, async request => {
    const auth = signedIn(request);
    const postId = validateInput(() => validateId(request.data?.postId));
    const location = request.data?.postLocation;
    if (!isValidPostLocation(location, postId)) throw new HttpsError("invalid-argument", "Invalid post location.");
    const body = String(request.data?.body || "").trim();
    if (!body || body.length > 2000) throw new HttpsError("invalid-argument", "Write a comment of 1 to 2,000 characters.");
    const postSnapshot = await db().ref(location).get();
    const post = postSnapshot.val();
    if (!post || post.deletedAt) throw new HttpsError("not-found", "This post is no longer available.");
    await assertCanAccessPost(auth.uid, location, post);
    await consumeLimit(auth.uid, "comment");
    const commentsPath = location.startsWith("community_private_posts/")
        ? location.replace("community_private_posts/", "community_private_comments/")
        : `community_comments/${postId}`;
    const target = db().ref(commentsPath).push();
    await target.set({ authorId: auth.uid, body, createdAt: ServerValue.TIMESTAMP });
    return { id: target.key };
});

exports.createCommunityReport = onCall({ region: FUNCTION_REGION, maxInstances: 10 }, async request => {
    const auth = signedIn(request);
    const targetType = request.data?.targetType;
    if (!["post", "comment"].includes(targetType)) throw new HttpsError("invalid-argument", "Invalid report target.");
    const postId = validateInput(() => validateId(request.data?.postId));
    const targetId = targetType === "post" ? postId : validateInput(() => validateId(request.data?.targetId, "comment ID"));
    const reason = validateInput(() => validateReportReason(request.data?.reason));
    const postLocation = request.data?.postLocation;
    if (!isValidPostLocation(postLocation, postId)) throw new HttpsError("invalid-argument", "Invalid post location.");
    const postSnapshot = await db().ref(postLocation).get();
    const post = postSnapshot.val();
    if (!post || post.deletedAt) throw new HttpsError("not-found", "This post is no longer available.");
    await assertCanAccessPost(auth.uid, postLocation, post);
    let targetAuthorId = post.authorId;
    let targetText = post.body;
    if (targetType === "comment") {
        const commentsPath = postLocation.startsWith("community_private_posts/")
            ? postLocation.replace("community_private_posts/", "community_private_comments/")
            : `community_comments/${postId}`;
        const comment = (await db().ref(`${commentsPath}/${targetId}`).get()).val();
        if (!comment) throw new HttpsError("not-found", "This comment is no longer available.");
        targetAuthorId = comment.authorId;
        targetText = comment.body;
    }
    if (targetAuthorId === auth.uid) throw new HttpsError("invalid-argument", "You cannot report your own content.");
    if (await isBlocked(auth.uid, targetAuthorId)) throw new HttpsError("permission-denied", "This account is blocked.");
    await consumeLimit(auth.uid, "report");
    const reportKey = `${auth.uid}:${targetType}:${postId}:${targetId}`;
    const reportId = `${Date.now().toString(36).padStart(10, "0")}_${createHash("sha256").update(reportKey).digest("hex")}`;
    const reportRef = db().ref(`community_reports/${reportId}`);
    if ((await reportRef.get()).exists()) throw new HttpsError("already-exists", "You have already reported this content.");
    const report = {
        reporterId: auth.uid, targetAuthorId, targetType, targetId, postId,
        postLocation, reason, excerpt: String(targetText || "").slice(0, 240),
        status: "open", createdAt: ServerValue.TIMESTAMP
    };
    const result = await reportRef.transaction(
        current => current === null ? report : undefined, undefined, false);
    if (!result.committed) throw new HttpsError("already-exists", "You have already reported this content.");
    return { id: reportId };
});

exports.moderateCommunityReport = onCall({ region: FUNCTION_REGION, maxInstances: 5 }, async request => {
    const auth = signedIn(request);
    moderator(auth);
    const reportId = validateInput(() => validateId(request.data?.reportId, "report ID"));
    const action = request.data?.action;
    if (!["dismiss", "remove"].includes(action)) throw new HttpsError("invalid-argument", "Choose dismiss or remove.");
    const reportRef = db().ref(`community_reports/${reportId}`);
    const snapshot = await reportRef.get();
    const report = snapshot.val();
    if (!report || report.status !== "open") throw new HttpsError("not-found", "This report is already resolved.");
    if (!["post", "comment"].includes(report.targetType) ||
        !isValidPostLocation(report.postLocation, report.postId) ||
        (report.targetType === "comment" && !/^[A-Za-z0-9_-]{1,128}$/.test(report.targetId || ""))) {
        throw new HttpsError("failed-precondition", "This report contains invalid content references.");
    }
    const targetRef = db().ref(report.targetType === "post"
        ? report.postLocation
        : `${report.postLocation.startsWith("community_private_posts/")
            ? report.postLocation.replace("community_private_posts/", "community_private_comments/")
            : `community_comments/${report.postId}`}/${report.targetId}`);
    if (action === "remove") {
        if (report.targetType === "post") await targetRef.update({ deletedAt: ServerValue.TIMESTAMP });
        else await targetRef.remove();
    }
    // Let Firebase retry an empty local cache with the current server record.
    const result = await reportRef.transaction(current => current === null ? null : current.status === "open" ? {
        ...current, status: action === "remove" ? "removed" : "dismissed",
        reviewedBy: auth.uid, reviewedAt: ServerValue.TIMESTAMP
    } : undefined, undefined, false);
    if (!result.committed || !result.snapshot.exists()) throw new HttpsError("aborted", "This report was resolved by another moderator.");
    return { status: result.snapshot.val().status };
});

exports.__private = { consumeLimit, isBlocked, isValidPostLocation };
