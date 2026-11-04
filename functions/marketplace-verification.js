const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { nextVerificationRequest, nextVerificationDecision } = require("./marketplace-verification-policy");

const DEVELOPER_EMAIL = "quickcheck.edu@gmail.com";
const FUNCTION_REGION = "asia-southeast1";
const db = () => getDatabase();

function signedIn(request) {
    const auth = request.auth;
    if (!auth?.uid || auth.token.firebase?.sign_in_provider === "anonymous") {
        throw new HttpsError("unauthenticated", "Sign in with a registered account.");
    }
    if (auth.token.email_verified !== true) throw new HttpsError("permission-denied", "Verify your email before requesting tutor review.");
    return auth;
}

function moderator(auth) {
    if (auth.token.role !== "developer" || auth.token.email !== DEVELOPER_EMAIL || auth.token.email_verified !== true) {
        throw new HttpsError("permission-denied", "Verified moderator access is required.");
    }
}

exports.requestTutorVerification = onCall({ region: FUNCTION_REGION, maxInstances: 5 }, async request => {
    const auth = signedIn(request);
    if ((await db().ref(`tutor_roles/${auth.uid}`).get()).val() !== "teacher") {
        throw new HttpsError("failed-precondition", "Register as a teacher before requesting profile review.");
    }
    const record = db().ref(`tutor_verification/${auth.uid}`);
    let outcome;
    const result = await record.transaction(current => {
        const next = nextVerificationRequest(current, Date.now());
        outcome = next.outcome;
        return next.changed ? next.record : undefined;
    }, undefined, false);
    if (result.committed) return { status: "pending" };

    const current = result.snapshot.val();
    if (current?.status === "pending" || current?.status === "verified") return { status: current.status };
    if (outcome === "rate-limited") throw new HttpsError("resource-exhausted", "Please wait 24 hours before requesting another review.");
    throw new HttpsError("aborted", "Your review request could not be saved. Try again.");
});

exports.getTutorVerificationStatus = onCall({ region: FUNCTION_REGION, maxInstances: 10 }, async request => {
    const auth = signedIn(request);
    const value = (await db().ref(`tutor_verification/${auth.uid}`).get()).val();
    if (!value) return { status: "not_requested" };
    return {
        status: value.status,
        requestedAt: Number.isFinite(value.requestedAt) ? value.requestedAt : null,
        reviewedAt: Number.isFinite(value.reviewedAt) ? value.reviewedAt : null,
        reviewerNote: auth.token.role === "developer" && auth.token.email === DEVELOPER_EMAIL
            ? String(value.reviewerNote || "").slice(0, 500)
            : String(value.status === "rejected" ? value.reviewerNote || "" : "").slice(0, 500)
    };
});

exports.listTutorVerificationRequests = onCall({ region: FUNCTION_REGION, maxInstances: 5 }, async request => {
    const auth = signedIn(request);
    moderator(auth);
    const pending = (await db().ref("tutor_verification")
        .orderByChild("status").equalTo("pending").limitToFirst(50).get()).val() || {};
    return {
        requests: await Promise.all(Object.entries(pending).map(async ([uid, value]) => {
            const [identity, profile, account] = await Promise.all([
                db().ref(`tutor_public_teachers/${uid}`).get(),
                db().ref(`tutor_profiles/${uid}`).get(),
                getAuth().getUser(uid)
            ]);
            return {
                uid,
                displayName: String(identity.val()?.displayName || account.displayName || "Teacher").slice(0, 100),
                email: String(account.email || "").slice(0, 320),
                qualification: String(profile.val()?.qualification || "").slice(0, 120),
                experience: Number.isInteger(profile.val()?.experience) ? profile.val().experience : null,
                about: String(profile.val()?.about || "").slice(0, 1000),
                requestedAt: Number.isFinite(value.requestedAt) ? value.requestedAt : null
            };
        }))
    };
});

exports.reviewTutorVerification = onCall({ region: FUNCTION_REGION, maxInstances: 5 }, async request => {
    const auth = signedIn(request);
    moderator(auth);
    const uid = request.data?.uid;
    const status = request.data?.status;
    const reviewerNote = request.data?.reviewerNote;
    if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
        throw new HttpsError("invalid-argument", "Choose a valid tutor account.");
    }
    if (!["verified", "rejected"].includes(status)) {
        throw new HttpsError("invalid-argument", "Choose approve or reject.");
    }
    if (typeof reviewerNote !== "string" || reviewerNote.length > 500) {
        throw new HttpsError("invalid-argument", "Add a moderator note up to 500 characters.");
    }
    const target = db().ref(`tutor_verification/${uid}`);
    // Let Firebase retry an empty local cache with the current server record.
    const result = await target.transaction(current =>
        current === null ? null : nextVerificationDecision(current, status, auth.uid, Date.now(), reviewerNote.trim()) || undefined,
    undefined, false);
    if (!result.committed || !result.snapshot.exists()) throw new HttpsError("failed-precondition", "This tutor request is no longer pending.");
    return { status };
});
