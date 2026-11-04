const { getDatabase } = require("firebase-admin/database");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { KEYWORDS, PRACTICE_OPTIONS, preferences, matchingScore, learningScore, engagement, networkScore, mixFeed } = require("./explore-policy");
const { validateId, isValidPostLocation, nextRateWindow } = require("./community-policy");
const options = { region: "asia-southeast1", maxInstances: 5 };
const db = () => getDatabase();
function user(request) {
    if (!request.auth?.uid || request.auth.token.firebase?.sign_in_provider === "anonymous") throw new HttpsError("unauthenticated", "Sign in with a registered account.");
    if (request.auth.token.email_verified !== true) throw new HttpsError("permission-denied", "Verify your email to use Explore.");
    return request.auth.uid;
}
async function limited(uid, action, maximum) {
    let exhausted = false;
    const result = await db().ref(`community_security/rateLimits/${uid}/${action}`).transaction(current => {
        const next = nextRateWindow(current, Date.now(), { maximum, windowMs: 60 * 60 * 1000 });
        exhausted = !next;
        return next || undefined;
    }, undefined, false);
    if (!result.committed || exhausted) throw new HttpsError("resource-exhausted", "Explore request limit reached. Try again later.");
}
function valid(callback) {
    try { return callback(); }
    catch (error) { throw new HttpsError("invalid-argument", error.message); }
}
async function accessible(uid, postId, location) {
    valid(() => validateId(postId));
    if (!isValidPostLocation(location, postId)) throw new HttpsError("invalid-argument", "Invalid post location.");
    const post = (await db().ref(location).get()).val();
    if (!post || post.deletedAt) throw new HttpsError("not-found", "This post is no longer available.");
    const [block, reverse, forwardContact, reverseContact] = await Promise.all([
        db().ref(`community_blocks/${uid}/${post.authorId}`).get(), db().ref(`community_blocks/${post.authorId}/${uid}`).get(),
        db().ref(`message_contacts/${uid}/${post.authorId}/status`).get(), db().ref(`message_contacts/${post.authorId}/${uid}/status`).get()
    ]);
    if (block.val() || reverse.val()) throw new HttpsError("permission-denied", "This account is blocked.");
    if (location.startsWith("community_private_posts/") && (location.split("/")[1] !== post.authorId ||
        (uid !== post.authorId && (forwardContact.val() !== "connected" || reverseContact.val() !== "connected")))) {
        throw new HttpsError("permission-denied", "Only connected friends can access this post.");
    }
    return post;
}
exports.getExploreSetup = onCall(options, async request => {
    const uid = user(request);
    await limited(uid, "exploreSetup", 60);
    const [saved, role] = await Promise.all([
        db().ref(`explore_preferences/${uid}`).get(), db().ref(`tutor_roles/${uid}`).get()
    ]);
    return {
        preferences: preferences({ viewTracking: false, discoverable: false, ...saved.val() }),
        practiceOptions: PRACTICE_OPTIONS, role: role.val() === "teacher" ? "teacher" : "student"
    };
});
exports.saveExplorePreferences = onCall(options, async request => {
    const uid = user(request), data = valid(() => preferences(request.data));
    await limited(uid, "explorePreferences", 30);
    await db().ref().update({
        [`explore_preferences/${uid}`]: data,
        [`explore_practice_profiles/${uid}`]: data.discoverable ? { goals: data.goals, level: data.level, skills: data.skills, styles: data.styles } : null
    });
    return { preferences: data };
});
exports.recordExploreInteraction = onCall(options, async request => {
    const uid = user(request), { postId, postLocation, kind, enabled } = request.data || {};
    if (!["save", "share", "view"].includes(kind) || typeof enabled !== "boolean" || (kind !== "save" && !enabled)) throw new HttpsError("invalid-argument", "Choose a valid Explore interaction.");
    const post = await accessible(uid, postId, postLocation);
    if (kind === "view") {
        if (!(Number.isFinite(request.data.visibleMs) && request.data.visibleMs > 10000 && request.data.visibleMs <= 86400000) &&
            !(request.data.completed === true && post.mediaType === "video")) {
            throw new HttpsError("invalid-argument", "View events require visible viewing time or completed video playback.");
        }
        const consent = (await db().ref(`explore_preferences/${uid}/viewTracking`).get()).val();
        if (consent !== true) throw new HttpsError("failed-precondition", "Viewing personalization is disabled.");
    }
    await limited(uid, "exploreInteraction", 240);
    // Public ranking never receives friends-only content or signals.
    const key = postLocation.startsWith("community_private_posts/") ? `private:${post.authorId}:${postId}` : postId;
    await db().ref().update({
        [`explore_user_actions/${uid}/${key}/${kind}`]: enabled,
        ...(!postLocation.startsWith("community_private_posts/") ? { [`explore_signals/${postId}/${uid}/${kind}`]: enabled } : {})
    });
    return { recorded: true };
});
exports.getExploreFeed = onCall(options, async request => {
    const uid = user(request), mode = request.data?.mode || "global";
    if (!["global", "following"].includes(mode)) throw new HttpsError("invalid-argument", "Choose Following or Global.");
    await limited(uid, "exploreFeed", 60);
    const [postsSnap, contactsSnap, blocksSnap, prefsSnap, partnersSnap, directorySnap, coursesSnap] = await Promise.all([
        db().ref("community_posts").orderByChild("createdAt").limitToLast(100).get(),
        db().ref(`message_contacts/${uid}`).limitToLast(100).get(),
        db().ref(`community_blocks/${uid}`).get(), db().ref(`explore_preferences/${uid}`).get(),
        db().ref("explore_practice_profiles").limitToLast(100).get(),
        db().ref("partnerDirectory").limitToLast(100).get(),
        db().ref("tutor_courses").orderByChild("published").equalTo(true).limitToLast(100).get()
    ]);
    const prefs = preferences({ viewTracking: false, discoverable: false, ...prefsSnap.val() });
    const blocks = blocksSnap.val() || {}, directory = directorySnap.val() || {};
    const network = new Set(Object.entries(contactsSnap.val() || {}).filter(([, contact]) => contact.status === "connected").map(([id]) => id));
    await Promise.all([...network].map(async id => {
        if ((await db().ref(`message_contacts/${id}/${uid}/status`).get()).val() !== "connected") network.delete(id);
    }));
    const authors = new Set([...Object.values(postsSnap.val() || {}).map(post => post.authorId), ...Object.keys(directory),
        ...Object.values(coursesSnap.val() || {}).map(course => course.teacherId), ...network]);
    const reverseBlocks = new Set();
    await Promise.all([...authors].filter(id => id && id !== uid).map(async id => {
        if ((await db().ref(`community_blocks/${id}/${uid}`).get()).val()) reverseBlocks.add(id);
    }));
    const allowed = id => !blocks[id] && !reverseBlocks.has(id);
    const publicPosts = Object.entries(postsSnap.val() || {}).filter(([, post]) => !post.deletedAt && allowed(post.authorId));
    const signals = {};
    await Promise.all(publicPosts.map(async ([id]) => {
        const [saved, likes, comments] = await Promise.all([
            db().ref(`explore_signals/${id}`).limitToLast(200).get(),
            db().ref(`community_likes/${id}`).limitToLast(200).get(),
            db().ref(`community_comments/${id}`).orderByChild("createdAt").limitToLast(200).get()
        ]);
        signals[id] = saved.val() || {};
        for (const liker of Object.keys(likes.val() || {})) (signals[id][liker] ||= {}).like = true;
        for (const comment of Object.values(comments.val() || {})) {
            if (!comment.authorId) continue;
            const signal = signals[id][comment.authorId] ||= {};
            signal.comment = (signal.comment || 0) + 1;
        }
    }));
    const interests = {};
    for (const [id, post] of publicPosts) {
        const actions = signals[id][uid] || {};
        for (const tag of post.keywords || []) {
            interests[tag] = (interests[tag] || 0) + (actions.save ? 4 : 0) + (actions.share ? 3 : 0) +
                2 * Math.max(0, Number(actions.comment) || 0) + (actions.like ? 1 : 0) + (prefs.viewTracking && actions.view ? 5 : 0);
        }
    }
    const ranked = publicPosts.map(([id, post]) => ({
        id, type: "post", authorId: post.authorId, createdAt: post.createdAt,
        score: engagement(signals[id]) + learningScore(post.keywords, interests), network: networkScore(signals[id], network)
    })).sort((a, b) => b.score - a.score || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    const privateRows = [];
    if (mode === "following") await Promise.all([uid, ...network].filter(allowed).map(async id => {
        const posts = (await db().ref(`community_private_posts/${id}`).orderByChild("createdAt").limitToLast(30).get()).val() || {};
        for (const [postId, post] of Object.entries(posts)) if (!post.deletedAt) privateRows.push({ id: postId, type: "post", authorId: id, createdAt: post.createdAt, score: learningScore(post.keywords, interests) });
    }));
    const secondary = mode === "following" ? ranked.filter(post => !network.has(post.authorId) && post.authorId !== uid) : ranked.filter(post => post.network > 0).sort((a, b) => b.network - a.network || b.score - a.score);
    const reserved = new Set(mode === "global" ? secondary.slice(0, 6).map(post => post.id) : []);
    const primary = mode === "following" ? [...ranked.filter(post => network.has(post.authorId)), ...privateRows.filter(post => network.has(post.authorId))].sort((a, b) => b.createdAt - a.createdAt) : ranked.filter(post => !reserved.has(post.id));
    const extra = mode === "following" ? [...ranked, ...privateRows].filter(post => post.authorId === uid).sort((a, b) => b.createdAt - a.createdAt) : [];
    const partners = Object.entries(partnersSnap.val() || {}).filter(([id]) => id !== uid && allowed(id) && directory[id])
        .map(([id, profile]) => ({ type: "partner", id, profile: directory[id], practice: profile, matchingScore: matchingScore(prefs, profile) }))
        .sort((a, b) => b.matchingScore - a.matchingScore || a.id.localeCompare(b.id));
    const courses = Object.entries(coursesSnap.val() || {}).filter(([, course]) => !course.archived && course.teacherId !== uid && allowed(course.teacherId))
        .map(([id, course]) => ({ type: "course", id, course, score: learningScore(
            [course.category === "general" ? "Daily English" : course.category === "business" ? "Business English" :
                KEYWORDS.find(tag => tag.toLowerCase() === course.category)].filter(Boolean), interests) }))
        .sort((a, b) => b.score - a.score || b.course.createdAt - a.course.createdAt);
    const items = mixFeed({ primary, secondary, partner: partners, course: courses, extra });
    const privateIds = new Set(privateRows.map(post => post.id)), actions = {};
    await Promise.all(items.filter(item => item.type === "post").map(async item => {
        const key = privateIds.has(item.id) ? `private:${item.authorId}:${item.id}` : item.id;
        actions[key] = (await db().ref(`explore_user_actions/${uid}/${key}`).get()).val() || {};
    }));
    return { items, preferences: prefs,
        actions, keywords: KEYWORDS, practiceOptions: PRACTICE_OPTIONS,
        candidateLimit: 100, relationship: "accepted-connections" };
});
