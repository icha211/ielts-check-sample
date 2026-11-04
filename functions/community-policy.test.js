const { test } = require("node:test");
const assert = require("node:assert/strict");
const { COMMUNITY_LIMITS, nextRateWindow, validateId, isValidPostLocation, validateCommunityPost, validateReportReason } = require("./community-policy");

test("community limits count within a rolling window and reset after expiry", () => {
    for (const action of ["post", "comment", "report"]) {
        const limit = COMMUNITY_LIMITS[action];
        assert.equal(nextRateWindow({ startedAt: 1000, count: limit.maximum }, 2000, limit), null, `${action} limit is enforced`);
    }
    let value = nextRateWindow(null, 1000, COMMUNITY_LIMITS.post);
    assert.deepEqual(value, { startedAt: 1000, count: 1 });
    value = nextRateWindow(value, 2000, COMMUNITY_LIMITS.post);
    assert.deepEqual(value, { startedAt: 1000, count: 2 });
    value = { startedAt: 1000, count: COMMUNITY_LIMITS.post.maximum };
    assert.equal(nextRateWindow(value, 3000, COMMUNITY_LIMITS.post), null);
    assert.deepEqual(nextRateWindow(value, 1000 + COMMUNITY_LIMITS.post.windowMs, COMMUNITY_LIMITS.post),
        { startedAt: 1000 + COMMUNITY_LIMITS.post.windowMs, count: 1 });
});

test("community content is normalized and media remains owner scoped", () => {
    const post = validateCommunityPost({
        title: "  Study tip ", body: " Practice daily ", category: "tips",
        mediaURL: "", mediaPath: "", mediaType: ""
    }, "student-1", "post-1");
    assert.equal(post.title, "Study tip");
    assert.equal(post.body, "Practice daily");
    assert.equal(post.authorId, "student-1");
    assert.throws(() => validateCommunityPost({ ...post, body: "x".repeat(4001) }, "student-1", "post-1"), /invalid/);
    assert.throws(() => validateCommunityPost({ ...post, category: "announcements" }, "student-1", "post-1"), /moderator/);
    assert.throws(() => validateCommunityPost({
        ...post, mediaURL: "https://firebasestorage.googleapis.com/x",
        mediaPath: "community/other/post/attachment", mediaType: "image"
    }, "student-1", "post-1"), /belong/);
    assert.throws(() => validateCommunityPost({
        ...post, mediaURL: "https://firebasestorage.googleapis.com/x",
        mediaPath: "community/student-1/other/attachment", mediaType: "video"
    }, "student-1", "post-1"), /belong/i);
    const privateVideo = validateCommunityPost({
        ...post, visibility: "friends",
        mediaURL: "https://firebasestorage.googleapis.com/x",
        mediaPath: "community-private/student-1/post-1/attachment",
        mediaType: "video", mediaKey: `${"A".repeat(43)}=`, mediaIV: "A".repeat(16), mediaMime: "video/webm"
    }, "student-1", "post-1");
    assert.equal(privateVideo.mediaMime, "video/webm");
    assert.throws(() => validateCommunityPost({
        ...privateVideo, mediaMime: "image/png"
    }, "student-1", "post-1"), /encrypted/i);
    assert.throws(() => validateCommunityPost({
        ...privateVideo, mediaKey: "", mediaIV: ""
    }, "student-1", "post-1"), /encrypted/i);
});

test("community identifiers and report reasons reject untrusted values", () => {
    assert.equal(validateId("safe-id"), "safe-id");
    for (const id of ["", "../other", "x/y", "x.".repeat(80)]) assert.throws(() => validateId(id));
    assert.equal(isValidPostLocation("community_posts/post-1", "post-1"), true);
    assert.equal(isValidPostLocation("community_private_posts/student-1/post-1", "post-1"), true);
    for (const location of [
        "community_private_posts/student-1/other/post-1",
        "community_private_posts/student-1/other",
        "community_posts/other"
    ]) assert.equal(isValidPostLocation(location, "post-1"), false);
    assert.equal(validateReportReason("spam"), "spam");
    assert.throws(() => validateReportReason("free-form abuse content"));
});
