const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    VERIFICATION_REQUEST_COOLDOWN_MS,
    nextVerificationRequest,
    nextVerificationDecision
} = require("./marketplace-verification-policy");

test("tutor review requests are idempotent while pending and limited after rejection", () => {
    const now = 100000;
    assert.deepEqual(nextVerificationRequest(null, now), {
        changed: true, outcome: "pending", record: { status: "pending", requestedAt: now }
    });
    const pending = { status: "pending", requestedAt: now };
    assert.equal(nextVerificationRequest(pending, now + 1).outcome, "pending");
    const rejected = { status: "rejected", requestedAt: now };
    assert.equal(nextVerificationRequest(rejected, now + VERIFICATION_REQUEST_COOLDOWN_MS - 1).outcome, "rate-limited");
    assert.deepEqual(nextVerificationRequest(rejected, now + VERIFICATION_REQUEST_COOLDOWN_MS), {
        changed: true, outcome: "pending", record: { status: "pending", requestedAt: now + VERIFICATION_REQUEST_COOLDOWN_MS }
    });
    assert.equal(nextVerificationRequest({ status: "verified" }, now).outcome, "verified");
});

test("moderator decisions require a pending request and retain an audit trail", () => {
    const pending = { status: "pending", requestedAt: 100 };
    assert.deepEqual(nextVerificationDecision(pending, "verified", "moderator", 200, "Reviewed profile"), {
        ...pending, status: "verified", reviewedBy: "moderator", reviewedAt: 200, reviewerNote: "Reviewed profile"
    });
    assert.equal(nextVerificationDecision({ status: "rejected" }, "verified", "moderator", 200, ""), null);
});
