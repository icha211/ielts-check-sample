const assert = require("node:assert/strict");
const { test } = require("node:test");
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
const namespace = "demo-toefl-messaging-default-rtdb";
test("Explore keywords enforce the taxonomy and private recommendation data rejects direct access", { skip: !host }, async () => {
    const uid = "keyword-owner", id = "keyword-post";
    const url = path => new URL(`http://${host}/${path}.json?ns=${namespace}`);
    const post = { authorId: uid, title: "IELTS", body: "Practice", category: "tips", groupId: "", visibility: "public", createdAt: 1, mediaURL: "", mediaPath: "", mediaType: "" };
    const seeded = await fetch(url(""), { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
        body: JSON.stringify({ [`community_posts/${id}`]: post, [`community_private_posts/${uid}/${id}`]: { ...post, visibility: "friends", mediaKey: "", mediaIV: "", mediaMime: "" } }) });
    assert.equal(seeded.status, 200);
    async function write(path, data, actor = uid) {
        const target = url(path);
        target.searchParams.set("auth", token(actor));
        return fetch(target, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    }
    for (const path of [`community_posts/${id}`, `community_private_posts/${uid}/${id}`]) {
        assert.equal((await write(path, { keywords: ["IELTS", "Speaking", "Practice Partner"] })).status, 200);
        for (const tags of [["IELTS", "TOEFL", "Speaking", "Listening"], ["unknown"], ["IELTS", "IELTS"], { 0: "IELTS", 2: "Speaking" }]) {
            assert.equal((await write(path, { keywords: tags })).status, 401);
        }
    }
    for (const path of [`explore_signals/${id}`, `explore_practice_profiles/${uid}`, `explore_preferences/${uid}`, `explore_user_actions/${uid}`]) {
        assert.equal((await write(path, { fake: true })).status, 401);
        assert.equal((await fetch(url(path))).status, 401);
        const stranger = url(path); stranger.searchParams.set("auth", token("keyword-stranger"));
        assert.equal((await fetch(stranger)).status, 401);
    }
});
test("social profiles protect editing and opt-in connection lists", { skip: !host }, async () => {
    async function request(path, uid, method = "GET", data, admin = false) {
        const url = new URL(`http://${host}/${path}.json`);
        url.searchParams.set("ns", namespace);
        if (uid) url.searchParams.set("auth", token(uid));
        return fetch(url, { method, headers: { "Content-Type": "application/json", ...(admin ? { Authorization: "Bearer owner" } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    }
    const profile = { bio: "Learning English", location: "Jakarta", interests: "IELTS, Music", shareConnections: false };
    assert.equal((await request("community_profiles/profile-alice", "profile-alice", "PUT", profile)).status, 200);
    assert.equal((await request("community_profiles/profile-alice", null)).status, 200);
    assert.equal((await request("community_profiles/profile-alice", "profile-bob", "PATCH", { bio: "Hacked" })).status, 401);
    assert.equal((await request("community_profiles/profile-alice", "profile-alice", "PATCH", { email: "private" })).status, 401);
    assert.equal((await request("community_profiles/profile-alice", "profile-alice", "PATCH", { bio: "a".repeat(501) })).status, 401);
    assert.equal((await request("community_connections/profile-alice/profile-bob", "profile-alice", "PUT", true)).status, 401);
    const contact = { status: "connected", requesterId: "profile-alice", updatedAt: { ".sv": "timestamp" } };
    assert.equal((await request("", null, "PATCH", {
        "message_contacts/profile-alice/profile-bob": contact,
        "message_contacts/profile-bob/profile-alice": contact
    }, true)).status, 200);
    assert.equal((await request("community_connections/profile-alice/profile-bob", "profile-alice", "PUT", true)).status, 200);
    assert.equal((await request("community_connections/profile-alice", "profile-bob")).status, 401);
    assert.equal((await request("community_connections/profile-alice", "profile-alice")).status, 200);
    assert.equal((await request("community_profiles/profile-alice", "profile-alice", "PATCH", { shareConnections: true })).status, 200);
    assert.equal((await request("community_connections/profile-alice", "profile-bob")).status, 200);
    assert.equal((await request("community_connections/profile-alice", null)).status, 401);
    assert.equal((await request("community_connections/profile-alice/stranger", "profile-bob", "PUT", true)).status, 401);
    assert.equal((await request("", "profile-bob", "PATCH", {
        "message_contacts/profile-alice/profile-bob": null,
        "message_contacts/profile-bob/profile-alice": null,
        "community_connections/profile-alice/profile-bob": null,
        "community_connections/profile-bob/profile-alice": null
    })).status, 200);
    assert.equal((await request("community_connections/profile-alice/profile-bob", "profile-alice", "PUT", true)).status, 401);
});
test("friends-only posts and activity reject strangers, pending and removed connections", { skip: !host }, async () => {
    async function request(path, uid, method = "GET", data, admin = false) {
        const url = new URL(`http://${host}/${path}.json`);
        url.searchParams.set("ns", namespace);
        if (uid) url.searchParams.set("auth", token(uid));
        const response = await fetch(url, {
            method, headers: { "Content-Type": "application/json", ...(admin ? { Authorization: "Bearer owner" } : {}) },
            body: data === undefined ? undefined : JSON.stringify(data)
        });
        return response.status;
    }
    const path = "community_private_posts/privacy-author/privacy-post";
    const stamp = { ".sv": "timestamp" };
    const post = { authorId: "privacy-author", title: "Private post", body: "Friends only", category: "tips", groupId: "", visibility: "friends", createdAt: stamp, mediaURL: "", mediaPath: "", mediaType: "", mediaKey: "", mediaIV: "", mediaMime: "" };
    assert.equal(await request(path, null, "DELETE", undefined, true), 200);
    assert.equal(await request(path, "privacy-author", "PUT", post), 401, "clients cannot create private posts directly");
    assert.equal(await request("", null, "PATCH", { [path]: post }, true), 200, "server can publish private posts");
    assert.equal(await request(path, "privacy-author"), 200);
    for (const uid of [null, "privacy-stranger", "privacy-friend"]) assert.equal(await request(path, uid), 401);
    const contact = (status) => ({ status, updatedAt: stamp, requesterId: "privacy-author" });
    const connections = {
        "message_contacts/privacy-author/privacy-friend": contact("connected"),
        "message_contacts/privacy-friend/privacy-author": contact("connected")
    };
    assert.equal(await request("", null, "PATCH", connections, true), 200);
    assert.equal(await request("community_private_posts/privacy-author", "privacy-friend"), 200);
    assert.equal(await request("community_private_posts", "privacy-friend"), 401);
    assert.equal(await request(path, "privacy-stranger", "PATCH", { body: "Hacked" }), 401);
    assert.equal(await request(path, "privacy-author", "PATCH", { visibility: "public" }), 401);
    assert.equal(await request(path, "privacy-author", "PATCH", { body: "Updated", updatedAt: stamp }), 200);
    assert.equal(await request(path, "privacy-author", "PATCH", { imageFormat: "portrait", imageFit: "cover", imageX: 25, imageY: 75 }), 200);
    assert.equal(await request(path, "privacy-author", "PATCH", { imageX: 101 }), 401);
    assert.equal(await request(path, "privacy-friend", "PATCH", { imageFit: "contain" }), 401);
    const likes = "community_private_likes/privacy-author/privacy-post";
    const comments = "community_private_comments/privacy-author/privacy-post";
    assert.equal(await request(`${likes}/privacy-friend`, "privacy-friend", "PUT", true), 200);
    assert.equal(await request(`${likes}/privacy-friend`, "privacy-friend", "PUT", stamp), 200);
    assert.equal(await request(`${likes}/privacy-friend`, "privacy-friend", "PUT", 1), 401);
    assert.equal(await request(`${likes}/privacy-friend`, "privacy-stranger", "PUT", stamp), 401);
    assert.equal(await request(`${likes}/privacy-stranger`, "privacy-stranger", "PUT", true), 401);
    assert.equal(await request(`${comments}/reply`, "privacy-friend", "PUT", { authorId: "privacy-friend", body: "Hi", createdAt: stamp }), 401, "clients cannot create private comments directly");
    assert.equal(await request("", null, "PATCH", {
        [`${comments}/reply`]: { authorId: "privacy-friend", body: "Hi", createdAt: stamp }
    }, true), 200, "server can publish private comments");
    assert.equal(await request(comments, "privacy-stranger"), 401);
    assert.equal(await request(likes, null), 401);
    assert.equal(await request("", null, "PATCH", {
        "message_contacts/privacy-author/privacy-friend": contact("outgoing"),
        "message_contacts/privacy-friend/privacy-author": contact("incoming")
    }, true), 200);
    assert.equal(await request(path, "privacy-friend"), 401);
    assert.equal(await request(comments, "privacy-friend"), 401);
    assert.equal(await request(`${likes}/privacy-friend`, "privacy-friend", "PUT", true), 401);
});
function token(uid, developer = false, verified = true) {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none", typ: "JWT" })}.${encode({
        iss: "https://securetoken.google.com/demo-toefl-messaging", aud: "demo-toefl-messaging",
        sub: uid, user_id: uid, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
        email_verified: verified,
        ...(developer ? { role: "developer", email: "quickcheck.edu@gmail.com" } : {}),
        firebase: { sign_in_provider: "password" }
    })}.`;
}
test("community rules enforce authenticated reads, authorship, limits, and single-user reactions", { skip: !host }, async () => {
    async function request(path, { uid, developer, method = "GET", data, admin = false } = {}) {
        const url = new URL(`http://${host}/${path}.json`);
        url.searchParams.set("ns", namespace);
        if (uid) url.searchParams.set("auth", token(uid, developer));
        const response = await fetch(url, {
            method, headers: { "Content-Type": "application/json", ...(admin ? { Authorization: "Bearer owner" } : {}) },
            body: data === undefined ? undefined : JSON.stringify(data)
        });

        return { status: response.status, data: await response.json() };
    }
    for (const id of ["rules-post", "media-post", "admin-post"]) {
        const url = new URL(`http://${host}/community_posts/${id}.json`);
        url.searchParams.set("ns", namespace);
        assert.equal((await fetch(url, { method: "DELETE", headers: { Authorization: "Bearer owner" } })).status, 200);
    }
    const stamp = { ".sv": "timestamp" };
    const post = { authorId: "alice", title: "A listening question", body: "How do you practice?", category: "questions", groupId: "", createdAt: stamp, mediaURL: "", mediaPath: "", mediaType: "" };
    const put = (path, uid, data, developer = false) => request(path, { uid, developer, method: "PUT", data });
    const patch = (path, uid, data) => request(path, { uid, method: "PATCH", data });
    const deny = async (promise, message) => assert.equal((await promise).status, 401, message);
    assert.equal((await request("", { method: "PATCH", admin: true, data: {
        "community_posts/rules-post": post,
        "community_posts/media-post": {
            ...post, mediaURL: "https://firebasestorage.googleapis.com/v0/b/demo-toefl-messaging.appspot.com/o/community%2Falice%2Fmedia-post%2Fattachment?alt=media",
            mediaPath: "community/alice/media-post/attachment", mediaType: "image"
        },
        "community_posts/admin-post": { ...post, authorId: "admin", category: "announcements" },
        "community_comments/rules-post/comment1": { authorId: "bob", body: "Try a podcast", createdAt: stamp }
    } })).status, 200);
    assert.equal((await request("community_posts")).status, 401, "public posts require sign-in");
    await deny(put("community_posts/invalid", "bob", post), "clients cannot impersonate or create posts directly");
    await deny(put("community_posts/invalid", "alice", { ...post, title: "a".repeat(121) }), "clients cannot bypass server validation");
    await deny(put("community_posts/stolen-media", "alice", {
        ...post, mediaURL: "https://firebasestorage.googleapis.com/photo", mediaPath: "community/bob/stolen-media/attachment", mediaType: "image"
    }), "media path must belong to the author and post");
    assert.equal((await request("community_posts", { uid: "bob" })).status, 200);
    await deny(patch("community_posts/rules-post", "bob", { body: "Hacked" }), "others cannot edit posts");
    await deny(patch("community_posts/rules-post", "alice", { authorId: "bob" }), "ownership immutable");
    await deny(patch("community_posts/rules-post", "alice", { createdAt: 1 }), "creation time immutable");
    await deny(patch("community_posts/rules-post", "alice", { mediaType: "video" }), "media immutable");
    assert.equal((await patch("community_posts/rules-post", "alice", { body: "Updated question", updatedAt: stamp })).status, 200);
    await deny(put("community_likes/rules-post/bob", "alice", true), "cannot like for others");
    await deny(put("community_likes/rules-post/alice", "alice", 12), "cannot invent like counts");
    assert.equal((await put("community_likes/rules-post/alice", "alice", true)).status, 200);
    assert.equal((await put("community_likes/rules-post/alice", "alice", true)).status, 200);
    assert.equal((await put("community_likes/rules-post/alice", "alice", stamp)).status, 200);
    await deny(put("community_likes/rules-post/alice", "alice", Date.now() + 60000), "cannot forge future reaction timestamps");
    assert.equal(Object.keys((await request("community_likes/rules-post", { uid: "bob" })).data).length, 1);
    assert.equal((await put("community_likes/rules-post/alice", "alice", null)).status, 200);
    await deny(put("community_likes/missing/alice", "alice", true), "post must exist");
    const comment = { authorId: "bob", body: "Try a podcast", createdAt: stamp };
    await deny(put("community_comments/rules-post/comment2", "bob", comment), "clients cannot create comments directly");
    await deny(put("community_comments/rules-post/comment2", "alice", comment), "cannot forge comments");
    await deny(put("community_comments/rules-post/comment2", "bob", { ...comment, body: "a".repeat(2001) }), "comment cap");
    await deny(patch("community_comments/rules-post/comment1", "alice", { body: "Changed" }), "others cannot edit comments");
    await deny(put("community_comments/rules-post/comment1", "alice", null), "others cannot delete comments");
    assert.equal((await put("community_comments/rules-post/comment1", "bob", null)).status, 200);
    assert.equal((await put("community_members/listening/alice", "alice", true)).status, 200);
    await deny(put("community_members/listening/bob", "alice", true), "cannot enroll others");
    await deny(put("community_members/unknown/alice", "alice", true), "unknown group rejected");
    assert.equal((await put("community_members/listening/alice", "alice", null)).status, 200);
    await deny(patch("community_posts/rules-post", "bob", { deletedAt: stamp }), "only owner or moderator removes posts");
    assert.equal((await patch("community_posts/rules-post", "alice", { deletedAt: stamp })).status, 200);
    await deny(put("community_likes/rules-post/bob", "bob", true), "removed posts cannot receive likes");
    await deny(put("community_comments/rules-post/comment3", "bob", comment), "removed posts cannot receive comments");
    await deny(patch("community_posts/rules-post", "alice", { deletedAt: null }), "cannot resurrect removed posts");
});

test("community blocks, reports and server rate limits are protected", { skip: !host }, async () => {
    async function request(path, uid, method = "GET", data, developer = false, verified = true, admin = false) {
        const url = new URL(`http://${host}/${path}.json`);
        url.searchParams.set("ns", namespace);
        if (uid) url.searchParams.set("auth", token(uid, developer, verified));
        const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json", ...(admin ? { Authorization: "Bearer owner" } : {}) },
            body: data === undefined ? undefined : JSON.stringify(data)
        });
        return { status: response.status, data: await response.json() };
    }
    await request("community_blocks/alice/bob", null, "DELETE", undefined, false, true, true);
    await request("community_reports/safety-test", null, "DELETE", undefined, false, true, true);
    await request("community_security/rateLimits/alice/post", null, "DELETE", undefined, false, true, true);
    assert.equal((await request("community_blocks/alice/bob", "alice", "PUT", true, false, false)).status, 401, "unverified accounts cannot block");
    assert.equal((await request("community_blocks/alice/bob", "alice", "PUT", true)).status, 200);
    assert.equal((await request("community_blocks/alice", "alice")).status, 200);
    assert.equal((await request("community_blocks/alice", "bob")).status, 401, "block lists are owner-only");
    assert.equal((await request("community_reports/safety-test", "alice", "PUT", { reason: "spam" })).status, 401, "clients cannot write reports");
    assert.equal((await request("", null, "PATCH", {
        "community_reports/safety-test": { status: "open", reporterId: "alice" },
        "community_security/rateLimits/alice/post": { count: 1 }
    }, false, true, true)).status, 200, "server may create private moderation data");
    assert.equal((await request("community_reports", "alice")).status, 401, "reports are moderator-only");
    assert.equal((await request("community_reports", "moderator", "GET", undefined, true)).status, 200);
    assert.equal((await request("community_reports", "moderator", "GET", undefined, true, false)).status, 401, "unverified moderators cannot read reports");
    assert.equal((await request("community_security", "alice")).status, 401, "rate-limit state is private");
    assert.equal((await request("community_security/rateLimits/alice/post", "alice", "PUT", { count: 100 })).status, 401, "clients cannot modify rate limits");
});

test("community Storage rules allow owned media and reject other owners and executable uploads", { skip: !storageHost }, async () => {
    const runId = Date.now();
    async function upload(uid, owner, contentType, collection = "community") {
        const url = new URL(`http://${storageHost}/v0/b/demo-toefl-messaging.appspot.com/o`);
        url.searchParams.set("name", `${collection}/${owner}/storage-test-${runId}-${uid}-${contentType.replace(/\W/g, "")}/attachment`);
        url.searchParams.set("uploadType", "media");
        return fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token(uid)}`, "Content-Type": contentType }, body: new Uint8Array([1, 2, 3]) });
    }
    async function uploadSize(uid, collection, contentType, size) {
        const url = new URL(`http://${storageHost}/v0/b/demo-toefl-messaging.appspot.com/o`);
        url.searchParams.set("name", `${collection}/${uid}/storage-size-test-${runId}-${contentType.replace(/\W/g, "")}-${size}/attachment`);
        url.searchParams.set("uploadType", "media");
        return fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${token(uid)}`, "Content-Type": contentType },
            body: new Uint8Array(size)
        });
    }
    async function uploadUnverified() {
        const url = new URL(`http://${storageHost}/v0/b/demo-toefl-messaging.appspot.com/o`);
        url.searchParams.set("name", `community/alice/storage-unverified-test-${runId}/attachment`);
        url.searchParams.set("uploadType", "media");
        return fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${token("alice", false, false)}`, "Content-Type": "image/png" },
            body: new Uint8Array([1, 2, 3])
        });
    }
    assert.equal((await upload("alice", "alice", "image/png")).status, 200);
    assert.equal((await upload("bob", "alice", "image/jpeg")).status, 403);
    assert.equal((await upload("alice", "alice", "text/html")).status, 403);
    assert.equal((await upload("alice", "alice", "image/svg+xml")).status, 403);
    assert.equal((await upload("alice", "alice", "video/mp4")).status, 200);
    assert.equal((await upload("alice", "alice", "video/webm")).status, 200);
    assert.equal((await upload("alice", "alice", "application/octet-stream", "community-private")).status, 200);
    assert.equal((await upload("bob", "alice", "application/octet-stream", "community-private")).status, 403);
    assert.equal((await upload("alice", "alice", "image/png", "community-private")).status, 403, "private attachments must be ciphertext, not directly displayed images");
    assert.equal((await uploadSize("alice", "community", "image/png", 2 * 1024 * 1024 + 1)).status, 403, "public media is capped at the compressed image limit");
    assert.equal((await uploadSize("alice", "community", "video/mp4", 20 * 1024 * 1024 + 1)).status, 403, "public videos are capped at 20 MB");
    assert.equal((await uploadSize("alice", "community-private", "application/octet-stream", 20 * 1024 * 1024 + 17)).status, 403, "private ciphertext is capped at the video limit plus AES-GCM tag overhead");
    assert.equal((await uploadUnverified()).status, 403, "unverified accounts cannot upload community media");
});
