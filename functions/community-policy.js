const COMMUNITY_LIMITS = Object.freeze({
    post: { maximum: 5, windowMs: 60 * 60 * 1000 },
    comment: { maximum: 20, windowMs: 60 * 60 * 1000 },
    report: { maximum: 10, windowMs: 24 * 60 * 60 * 1000 }
});

function nextRateWindow(current, now, limit) {
    const active = current && Number.isFinite(current.startedAt) &&
        Number.isInteger(current.count) && current.count >= 0 &&
        now - current.startedAt < limit.windowMs;
    const window = active ? current : { startedAt: now, count: 0 };
    if (window.count >= limit.maximum) return null;
    return { startedAt: window.startedAt, count: window.count + 1 };
}

function validateId(value, label = "post ID") {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
        throw new TypeError(`Invalid ${label}.`);
    }
    return value;
}

function isValidPostLocation(location, postId) {
    if (location === `community_posts/${postId}`) return true;
    return typeof location === "string" &&
        /^community_private_posts\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}$/.test(location) &&
        location.endsWith(`/${postId}`);
}

function validateCommunityPost(input, uid, postId, isModerator = false) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Post data is required.");
    const title = String(input.title || "").trim();
    const body = String(input.body || "").trim();
    if (!title || title.length > 120 || !body || body.length > 4000) throw new TypeError("Post title or body is invalid.");
    if (!["questions", "tips", "buddies", "announcements"].includes(input.category)) throw new TypeError("Invalid post category.");
    if (input.category === "announcements" && !isModerator) throw new TypeError("Announcements require moderator access.");
    if (!["", "general", "speaking", "writing", "listening", "reading"].includes(input.groupId || "")) throw new TypeError("Invalid community group.");
    if (!["public", "friends"].includes(input.visibility || "public")) throw new TypeError("Invalid post visibility.");
    if (!["auto", "portrait", "square", "landscape"].includes(input.imageFormat || "auto") ||
        !["contain", "cover"].includes(input.imageFit || "contain") ||
        ![input.imageX ?? 50, input.imageY ?? 50].every(value => Number.isFinite(value) && value >= 0 && value <= 100)) {
        throw new TypeError("Invalid image framing.");
    }
    const mediaURL = String(input.mediaURL || "");
    const mediaPath = String(input.mediaPath || "");
    const mediaType = String(input.mediaType || "");
    const privatePost = (input.visibility || "public") === "friends";
    if (mediaURL.length > 2048 || !["", "image"].includes(mediaType)) throw new TypeError("Invalid media.");
    if (mediaType) {
        const prefix = privatePost ? `community-private/${uid}/` : `community/${uid}/`;
        if (!mediaURL.startsWith("https://firebasestorage.googleapis.com/") ||
            mediaPath !== `${prefix}${postId}/attachment`) {
            throw new TypeError("Media must belong to this account and post.");
        }
    } else if (mediaURL || mediaPath) {
        throw new TypeError("Media fields are incomplete.");
    }
    if (privatePost && mediaType && (
        !/^[A-Za-z0-9+/]{43}=$/.test(String(input.mediaKey || "")) ||
        !/^[A-Za-z0-9+/]{16}$/.test(String(input.mediaIV || "")) ||
        !["image/png", "image/jpeg", "image/webp"].includes(input.mediaMime)
    )) throw new TypeError("Private media must be encrypted.");
    return {
        authorId: uid, title, body, category: input.category,
        groupId: input.groupId || "", visibility: input.visibility || "public",
        imageFormat: input.imageFormat || "auto", imageFit: input.imageFit || "contain",
        imageX: input.imageX ?? 50, imageY: input.imageY ?? 50,
        mediaURL, mediaPath, mediaType,
        mediaKey: privatePost ? String(input.mediaKey || "") : "",
        mediaIV: privatePost ? String(input.mediaIV || "") : "",
        ...(privatePost ? { mediaMime: String(input.mediaMime || "") } : {})
    };
}

function validateReportReason(reason) {
    if (!["spam", "harassment", "inappropriate", "scam", "other"].includes(reason)) {
        throw new TypeError("Choose a valid report reason.");
    }
    return reason;
}

module.exports = { COMMUNITY_LIMITS, nextRateWindow, validateId, isValidPostLocation, validateCommunityPost, validateReportReason };
