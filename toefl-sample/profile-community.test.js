const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const model = vm.createContext({});
vm.runInContext(fs.readFileSync(`${__dirname}\\js\\profile-model.js`, "utf8").replace(/^export /gm, ""), model);
test("community profile validates public fields and bounded interests", () => {
    const value = model.validateCommunityProfile({ bio: " My bio ", location: " Jakarta ", interests: "IELTS, Music, IELTS", shareConnections: true });
    assert.equal(value.bio, "My bio");
    assert.equal(value.location, "Jakarta");
    assert.equal(value.interests, "IELTS, Music");
    assert.equal(value.shareConnections, true);
    assert.equal(model.validateCommunityProfile({}).shareConnections, false);
    for (const input of [{ bio: "a".repeat(501) }, { location: "a".repeat(101) }, { interests: "a".repeat(31) }, { interests: Array.from({ length: 9 }, (_, i) => `tag${i}`).join(",") }]) assert.throws(() => model.validateCommunityProfile(input));
});
test("profile counts, activity and achievements use visible real posts and approved connections", () => {
    const summary = model.profileSummary({
        a: { authorId: "alice", createdAt: 10, category: "questions" },
        b: { authorId: "alice", createdAt: 20, category: "tips", visibility: "friends" },
        c: { authorId: "bob", createdAt: 30 },
        d: { authorId: "alice", createdAt: 40, deletedAt: 50 }
    }, "alice", { bob: true, charlie: true, invalid: false }, { bob: { status: "connected" }, charlie: { status: "incoming" } });
    assert.deepEqual(Array.from(summary.recent, (p) => p.id), ["b", "a"]);
    assert.deepEqual(Array.from(summary.peers), ["bob", "charlie"]);
    assert.deepEqual(Array.from(summary.mutual), ["bob"]);
    assert.equal(summary.achievements.length, 3);
    assert.equal(model.profileSummary({}, "alice").achievements.length, 0);
});
