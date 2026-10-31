const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { webcrypto } = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "js", "community-model.js"), "utf8").replace(/^export /gm, "");
const model = vm.createContext({ URL, Intl });
vm.runInContext(source, model);
const post = { title: " Listening advice ", body: " Practice with real recordings. ", category: "tips", groupId: "listening" };
test("community post validation trims content and enforces exact limits and categories", () => {
    assert.equal(model.validatePost(post).title, "Listening advice");
    assert.equal(model.validatePost(post).body, "Practice with real recordings.");
    assert.doesNotThrow(() => model.validatePost({ ...post, title: "a".repeat(120), body: "b".repeat(4000) }));
    for (const change of [{ title: " " }, { body: " " }, { title: "a".repeat(121) }, { body: "b".repeat(4001) }, { category: "made-up" }, { groupId: "private" }, { category: "announcements" }]) {
        assert.throws(() => model.validatePost({ ...post, ...change }));
    }
    assert.doesNotThrow(() => model.validatePost({ ...post, category: "announcements" }, true));
});
test("community feed filters groups and categories, sorts by actual likes, and hides removed posts", () => {
    const posts = {
        a: { ...post, createdAt: 10 },
        b: { ...post, createdAt: 20, category: "questions", groupId: "general" },
        c: { ...post, createdAt: 30, deletedAt: 40 }
    };
    const ids = (options) => Array.from(model.selectPosts(posts, options), (row) => row.id);
    assert.deepEqual(ids(), ["b", "a"]);
    assert.deepEqual(ids({ groupId: "listening" }), ["a"]);
    assert.deepEqual(ids({ category: "questions" }), ["b"]);
    assert.deepEqual(ids({ sort: "oldest" }), ["a", "b"]);
    assert.deepEqual(ids({ sort: "popular", likes: { a: { learner1: true, learner2: true } } }), ["a", "b"]);
});
test("buddy matching excludes self, uses real presence, and prioritizes matching levels", () => {
    const profiles = {
        me: { displayName: "Me", level: "B1", presence: { c1: true } },
        online: { displayName: "Online learner", level: "A2", nationality: "Indonesia", presence: { c1: true } },
        same: { displayName: "Same level", level: "B1", presence: { c1: false } },
        offline: { displayName: "Offline learner" }
    };
    assert.deepEqual(Array.from(model.selectPeople(profiles, "me", { onlineOnly: true }), (p) => p.id), ["online"]);
    assert.equal(model.selectPeople(profiles, "me", { level: "B1" })[0].id, "same");
    assert.equal(model.selectPeople(profiles, "me", { search: "indonesia" })[0].id, "online");
    assert.equal(model.selectPeople({}, "me").length, 0);
});
test("media URLs reject executable schemes and relative time responds to real timestamps", () => {
    assert.equal(model.safeMediaURL("javascript:alert(1)"), "");
    assert.equal(model.safeMediaURL("data:text/html,hi"), "");
    assert.equal(model.safeMediaURL("https://example.com/photo.png"), "https://example.com/photo.png");
    assert.equal(model.relativeTime(1000, 2000), "Just now");
    assert.equal(model.relativeTime(1000, 2000, "id-ID"), "Baru saja");
    assert.equal(model.relativeTime(0, 7200000), "2 hours ago");
});

function serviceFixture() {
    const writes = [];
    const listeners = new Map();
    let authCallback;
    const context = vm.createContext({
        auth: { currentUser: { uid: "alice", app: {} } }, db: {},
        console, crypto: webcrypto, Blob, btoa, atob, Uint8Array,
        compressImageToLimit: async (file) => ({ blob: file }),
        validatePost: model.validatePost, GROUPS: vm.runInContext("GROUPS", model),
        onAuthStateChanged(_, callback) { authCallback = callback; return () => {}; },
        ref: (_, key) => ({ key }),
        query: (target) => target, orderByChild: () => {}, limitToLast: () => {},
        onValue(target, callback) { listeners.set(target.key, callback); return () => listeners.delete(target.key); },
        push: () => ({ key: "post1" }),
        serverTimestamp: () => ({ ".sv": "timestamp" }),
        set: async (target, value) => writes.push({ key: target.key, value }),
        update: async (target, value) => writes.push({ key: target.key, value }),
        getStorage: () => ({}), storageRef: (_, key) => ({ key }),
        uploadBytes: async () => {}, getDownloadURL: async () => "https://firebasestorage.googleapis.com/photo",
        deleteObject: async () => {}
    });
    const code = fs.readFileSync(path.join(__dirname, "js", "community.js"), "utf8").replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
    vm.runInContext(code, context);
    return {
        context, writes, listeners,
        auth: (user) => authCallback(user),
        emit: (key, value) => listeners.get(key)?.({ val: () => value })
    };
}
test("community service persists real author, membership, likes and comments", async () => {
    const { context: service, writes } = serviceFixture();
    await service.savePost(post, null, false);
    assert.equal(writes[0].value.authorId, "alice");
    assert.equal(writes[0].value.mediaURL, "");
    await service.setGroupMembership("reading", true);
    assert.equal(writes[1].key, "community_members/reading/alice");
    await service.setPostLike("post1", true);
    assert.equal(writes[2].key, "community_likes/post1/alice");
    assert.deepEqual(JSON.parse(JSON.stringify(writes[2].value)), { ".sv": "timestamp" });
    await service.addComment("post1", " Nice tip ");
    assert.equal(writes[3].value.body, "Nice tip");
    await assert.rejects(service.addComment("post1", "a".repeat(2001)));
    await assert.rejects(service.setGroupMembership("private", true));
    await assert.rejects(service.savePost(post, { type: "image/png", size: 40 * 1024 * 1024 + 1 }, false));
    await assert.rejects(service.savePost(post, { type: "text/html", size: 1 }, false));
});
test("large pictures are compressed below 2 MB before public upload or private encryption", async () => {
    for (const visibility of ["public", "friends"]) {
        const { context: service, writes } = serviceFixture();
        const original = new Blob([new Uint8Array(3 * 1024 * 1024)], { type: "image/png" });
        const compressed = new Blob(["compressed jpeg"], { type: "image/jpeg" });
        let uploaded;
        let calls = 0;
        service.compressImageToLimit = async (file, limit) => {
            calls++;
            assert.equal(file, original);
            assert.equal(limit, 2 * 1024 * 1024);
            return { blob: compressed, type: "image/jpeg", compressed: true };
        };
        service.uploadBytes = async (_, blob, metadata) => { uploaded = { blob, metadata }; };
        await service.savePost({ ...post, visibility }, original, false);
        assert.equal(calls, 1);
        assert.ok(uploaded.blob.size <= 2 * 1024 * 1024);
        if (visibility === "friends") {
            assert.equal(uploaded.metadata.contentType, "application/octet-stream");
            assert.equal(writes[0].value.mediaMime, "image/jpeg");
            service.fetch = async () => ({ ok: true, arrayBuffer: () => uploaded.blob.arrayBuffer() });
            const decrypted = await service.loadPrivateMedia(writes[0].value);
            assert.equal(decrypted.type, "image/jpeg");
            assert.equal(await decrypted.text(), await compressed.text());
        } else {
            assert.equal(uploaded.blob, compressed);
            assert.equal(uploaded.metadata.contentType, "image/jpeg");
        }
    }
});
test("shared image compressor preserves the exact 2 MB boundary and retries encoding to meet it", async () => {
    const limit = 2 * 1024 * 1024;
    let decodes = 0;
    let encodes = 0;
    let closed = false;
    const canvas = {
        width: 0, height: 0,
        getContext: () => ({ fillRect() {}, drawImage() {} }),
        toBlob(callback, type) {
            encodes++;
            callback(new Blob([new Uint8Array(encodes === 1 ? limit + 1 : limit)], { type }));
        }
    };
    const context = vm.createContext({
        Blob,
        createImageBitmap: async () => { decodes++; return { width: 3000, height: 2000, close() { closed = true; } }; },
        document: { createElement: () => canvas }
    });
    const compressor = fs.readFileSync(path.join(__dirname, "js", "image-compress.js"), "utf8").replace(/^export /gm, "");
    vm.runInContext(compressor, context);
    const exact = new Blob([new Uint8Array(limit)], { type: "image/png" });
    assert.equal((await context.compressImageToLimit(exact, limit)).blob, exact);
    assert.equal(decodes, 0, "an image exactly at the limit is never decoded or re-encoded");
    const result = await context.compressImageToLimit(new Blob([new Uint8Array(limit + 1)], { type: "image/png" }), limit);
    assert.equal(result.blob.size, limit);
    assert.equal(result.type, "image/jpeg");
    assert.equal(result.width, 2048);
    assert.equal(encodes, 2, "an oversized encoded result must be retried");
    assert.ok(closed);
});
test("small images stay unchanged, videos are not compressed, and failed compression never uploads", async () => {
    const { context: service, writes } = serviceFixture();
    const photo = new Blob(["small photo"], { type: "image/webp" });
    let uploaded;
    service.uploadBytes = async (_, blob) => { uploaded = blob; };
    await service.savePost(post, photo, false);
    assert.equal(uploaded, photo);
    service.compressImageToLimit = async () => { throw new Error("decode failed"); };
    const video = new Blob(["video"], { type: "video/mp4" });
    await service.savePost(post, video, false);
    assert.equal(uploaded, video);
    const before = writes.length;
    uploaded = null;
    await assert.rejects(service.savePost(post, photo, false), /could not be compressed/);
    assert.equal(uploaded, null);
    assert.equal(writes.length, before);
    await assert.rejects(service.savePost(post, { type: "video/mp4", size: 20 * 1024 * 1024 + 1 }, false), /Videos must/);
});
test("community subscriptions reset all private state on account changes and dispose listeners", () => {
    const fixture = serviceFixture();
    const states = [];
    const stop = fixture.context.subscribeCommunity((state) => states.push(state), () => {});
    fixture.auth({ uid: "alice" });
    for (const key of ["users/alice", "partnerDirectory", "community_posts", "community_members"]) fixture.emit(key, { example: true });
    assert.equal(states.at(-1).loading, false);
    fixture.auth({ uid: "bob" });
    assert.equal(states.at(-1).uid, "bob");
    assert.equal(Object.keys(states.at(-1).posts).length, 0);
    assert.equal(fixture.listeners.has("users/alice"), false);
    fixture.auth(null);
    assert.equal(states.at(-1).uid, null);
    assert.equal(fixture.listeners.size, 1, "signed-out visitors retain only the public feed subscription");
    stop();
    assert.equal(fixture.listeners.size, 0);
});
test("audiences are validated and private feeds only subscribe to connected friends", () => {
    assert.equal(model.validatePost(post).visibility, "public");
    assert.equal(model.validatePost({ ...post, visibility: "friends" }).visibility, "friends");
    assert.throws(() => model.validatePost({ ...post, visibility: "anyone" }));
    const fixture = serviceFixture();
    const states = [];
    fixture.context.subscribeCommunity((state) => states.push(state), assert.fail);
    fixture.auth({ uid: "alice" });
    fixture.emit("message_contacts/alice", { bob: { status: "connected" }, charlie: { status: "outgoing" } });
    assert(fixture.listeners.has("community_private_posts/alice"));
    assert(fixture.listeners.has("community_private_posts/bob"));
    assert(!fixture.listeners.has("community_private_posts/charlie"));
    fixture.emit("community_private_posts/bob", { secret: { ...post, visibility: "friends" } });
    assert(states.at(-1).posts.secret);
    fixture.emit("message_contacts/alice", {});
    assert(!states.at(-1).posts.secret);
    assert(!fixture.listeners.has("community_private_posts/bob"));
});
test("private attachments are encrypted and decrypted; private actions use protected paths", async () => {
    const { context: service, writes } = serviceFixture();
    let encrypted;
    service.uploadBytes = async (_, data, metadata) => {
        assert.equal(metadata.contentType, "application/octet-stream");
        encrypted = await data.arrayBuffer();
    };
    const file = new Blob(["private image bytes"], { type: "image/png" });
    await service.savePost({ ...post, visibility: "friends" }, file, false);
    const saved = writes[0].value;
    assert.equal(saved.visibility, "friends");
    assert.equal(saved.mediaPath, "community-private/alice/post1/attachment");
    assert.equal(saved.mediaKey.length, 44);
    assert.notEqual(Buffer.from(encrypted).toString(), "private image bytes");
    service.fetch = async () => ({ ok: true, arrayBuffer: async () => encrypted });
    assert.equal(await (await service.loadPrivateMedia(saved)).text(), "private image bytes");
    await assert.rejects(service.loadPrivateMedia({ ...saved, mediaKey: btoa("x".repeat(32)) }));
    await service.setPostLike("post1", true);
    assert.equal(writes[1].key, "community_private_likes/alice/post1/alice");
    assert.deepEqual(JSON.parse(JSON.stringify(writes[1].value)), { ".sv": "timestamp" });
    await service.savePost({ ...post, visibility: "friends" }, null, false, "post1");
    assert.equal(writes[2].key, "community_private_posts/alice/post1");
    await assert.rejects(service.savePost(post, null, false, "post1"), /Audience cannot/);
});
