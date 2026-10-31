const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

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
        console, validatePost: model.validatePost, GROUPS: vm.runInContext("GROUPS", model),
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
    await service.addComment("post1", " Nice tip ");
    assert.equal(writes[3].value.body, "Nice tip");
    await assert.rejects(service.addComment("post1", "a".repeat(2001)));
    await assert.rejects(service.setGroupMembership("private", true));
    await assert.rejects(service.savePost(post, { type: "image/png", size: 20 * 1024 * 1024 + 1 }, false));
    await assert.rejects(service.savePost(post, { type: "text/html", size: 1 }, false));
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
    assert.equal(fixture.listeners.size, 0);
    stop();
});
