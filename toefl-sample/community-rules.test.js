const assert = require("node:assert/strict");
const { test } = require("node:test");
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
const namespace = "demo-toefl-messaging-default-rtdb";
function token(uid, developer = false) {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none", typ: "JWT" })}.${encode({
        iss: "https://securetoken.google.com/demo-toefl-messaging", aud: "demo-toefl-messaging",
        sub: uid, user_id: uid, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
        ...(developer ? { role: "developer", email: "quickcheck.edu@gmail.com", email_verified: true } : {}),
        firebase: { sign_in_provider: "password" }
    })}.`;
}
test("community rules enforce authenticated reads, authorship, limits, and single-user reactions", { skip: !host }, async () => {
    async function request(path, { uid, developer, method = "GET", data } = {}) {
        const url = new URL(`http://${host}/${path}.json`);
        url.searchParams.set("ns", namespace);
        if (uid) url.searchParams.set("auth", token(uid, developer));
        const response = await fetch(url, {
            method, headers: { "Content-Type": "application/json" },
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
    await deny(request("community_posts"), "signed-out users cannot read posts");
    await deny(put("community_posts/invalid", "bob", post), "cannot impersonate another author");
    await deny(put("community_posts/invalid", "alice", { ...post, title: "a".repeat(121) }), "title cap");
    await deny(put("community_posts/invalid", "alice", { ...post, body: "b".repeat(4001) }), "body cap");
    await deny(put("community_posts/invalid", "alice", { ...post, groupId: "unknown" }), "known groups only");
    await deny(put("community_posts/invalid", "alice", { ...post, category: "announcements" }), "announcements are restricted");
    await deny(put("community_posts/invalid", "alice", { ...post, createdAt: 1 }), "server timestamps required");
    await deny(put("community_posts/invalid", "alice", { ...post, unexpected: true }), "unknown fields rejected");
    await deny(put("community_posts/invalid", "alice", { ...post, mediaURL: "javascript:alert(1)" }), "unsafe media denied");
    assert.equal((await put("community_posts/rules-post", "alice", post)).status, 200);
    assert.equal((await put("community_posts/media-post", "alice", {
        ...post, mediaURL: "https://firebasestorage.googleapis.com/v0/b/demo-toefl-messaging.appspot.com/o/community%2Falice%2Fmedia-post%2Fattachment?alt=media",
        mediaPath: "community/alice/media-post/attachment", mediaType: "image"
    })).status, 200, "owned media attachment allowed");
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
    assert.equal(Object.keys((await request("community_likes/rules-post", { uid: "bob" })).data).length, 1);
    assert.equal((await put("community_likes/rules-post/alice", "alice", null)).status, 200);
    await deny(put("community_likes/missing/alice", "alice", true), "post must exist");
    const comment = { authorId: "bob", body: "Try a podcast", createdAt: stamp };
    assert.equal((await put("community_comments/rules-post/comment1", "bob", comment)).status, 200);
    await deny(put("community_comments/rules-post/comment2", "alice", comment), "cannot forge comments");
    await deny(put("community_comments/rules-post/comment2", "bob", { ...comment, body: "a".repeat(2001) }), "comment cap");
    await deny(patch("community_comments/rules-post/comment1", "alice", { body: "Changed" }), "others cannot edit comments");
    await deny(put("community_comments/rules-post/comment1", "alice", null), "others cannot delete comments");
    assert.equal((await put("community_comments/rules-post/comment1", "bob", null)).status, 200);
    assert.equal((await put("community_members/listening/alice", "alice", true)).status, 200);
    await deny(put("community_members/listening/bob", "alice", true), "cannot enroll others");
    await deny(put("community_members/unknown/alice", "alice", true), "unknown group rejected");
    assert.equal((await put("community_members/listening/alice", "alice", null)).status, 200);
    assert.equal((await put("community_posts/admin-post", "admin", { ...post, authorId: "admin", category: "announcements" }, true)).status, 200);
    await deny(patch("community_posts/rules-post", "bob", { deletedAt: stamp }), "only owner or moderator removes posts");
    assert.equal((await patch("community_posts/rules-post", "alice", { deletedAt: stamp })).status, 200);
    await deny(put("community_likes/rules-post/bob", "bob", true), "removed posts cannot receive likes");
    await deny(put("community_comments/rules-post/comment3", "bob", comment), "removed posts cannot receive comments");
    await deny(patch("community_posts/rules-post", "alice", { deletedAt: null }), "cannot resurrect removed posts");
});

test("community Storage rules allow owned media and reject other owners and executable uploads", { skip: !storageHost }, async () => {
    const runId = Date.now();
    async function upload(uid, owner, contentType) {
        const url = new URL(`http://${storageHost}/v0/b/demo-toefl-messaging.appspot.com/o`);
        url.searchParams.set("name", `community/${owner}/storage-test-${runId}-${uid}-${contentType.replace(/\W/g, "")}/attachment`);
        url.searchParams.set("uploadType", "media");
        return fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token(uid)}`, "Content-Type": contentType }, body: new Uint8Array([1, 2, 3]) });
    }
    assert.equal((await upload("alice", "alice", "image/png")).status, 200);
    assert.equal((await upload("bob", "alice", "image/jpeg")).status, 403);
    assert.equal((await upload("alice", "alice", "text/html")).status, 403);
    assert.equal((await upload("alice", "alice", "image/svg+xml")).status, 403);
    assert.equal((await upload("alice", "alice", "video/mp4")).status, 200);
});
