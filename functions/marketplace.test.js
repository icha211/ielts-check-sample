const { test } = require("node:test");
const assert = require("node:assert/strict");
const { enrollmentStats, publicTeacher } = require("./marketplace");

test("enrollment totals count accepted requests once and ignore stale/retried events", () => {
    let stats = enrollmentStats(null, "a", { status: "pending" }, 1);
    assert.equal(stats.students, 0);
    stats = enrollmentStats(stats, "a", { status: "accepted" }, 2);
    stats = enrollmentStats(stats, "a", { status: "accepted" }, 2);
    stats = enrollmentStats(stats, "a", { status: "pending" }, 1);
    assert.equal(stats.students, 1);
    stats = enrollmentStats(stats, "b", { status: "accepted" }, 3);
    assert.equal(stats.students, 2);
    stats = enrollmentStats(stats, "b", null, 4);
    assert.equal(stats.students, 1);
    stats = enrollmentStats(stats, "b", { status: "accepted" }, 3);
    assert.equal(stats.students, 1);
    stats = enrollmentStats(stats, "c", { status: "pending" }, 5);
    stats = enrollmentStats(stats, "c", { status: "accepted" }, 5);
    assert.equal(stats.students, 2);
});

test("teacher identity publishes only profile name and safe photo, never private user fields", () => {
    assert.deepEqual(publicTeacher({ first_name: "Teacher", last_name: "Name", photoURL: "https://example.com/a.png", email: "private", subscription: "private" }),
        { displayName: "Teacher Name", photoURL: "https://example.com/a.png" });
    assert.deepEqual(publicTeacher({ displayName: "Teacher", photoURL: "javascript:alert(1)" }), { displayName: "Teacher", photoURL: "" });
});
