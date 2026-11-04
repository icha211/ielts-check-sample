const VERIFICATION_REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function nextVerificationRequest(current, now) {
    if (current?.status === "verified") return { changed: false, outcome: "verified", record: current };
    if (current?.status === "pending") return { changed: false, outcome: "pending", record: current };
    if (Number.isFinite(current?.requestedAt) && now - current.requestedAt < VERIFICATION_REQUEST_COOLDOWN_MS) {
        return { changed: false, outcome: "rate-limited", record: current };
    }
    return { changed: true, outcome: "pending", record: { status: "pending", requestedAt: now } };
}

function nextVerificationDecision(current, status, reviewerId, now, reviewerNote) {
    if (current?.status !== "pending") return null;
    return {
        ...current,
        status,
        reviewedBy: reviewerId,
        reviewedAt: now,
        reviewerNote
    };
}

module.exports = { VERIFICATION_REQUEST_COOLDOWN_MS, nextVerificationRequest, nextVerificationDecision };
