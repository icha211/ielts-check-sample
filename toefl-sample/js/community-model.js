export const GROUPS = [
    { id: "general", name: "English General Discussion", icon: "message-circle-filled" },
    { id: "speaking", name: "Speaking Practice", icon: "microphone" },
    { id: "writing", name: "Writing Support", icon: "pencil" },
    { id: "listening", name: "Listening Tips", icon: "headphones" },
    { id: "reading", name: "Reading Strategies", icon: "book" }
];
export const CATEGORIES = { questions: "Questions", tips: "Tips & Resources", buddies: "Study Buddies", announcements: "Announcements" };

export function validatePost({ title, body, category, groupId = "" }, developer = false) {
    const result = { title: String(title || "").trim(), body: String(body || "").trim(), category, groupId };
    if (!result.title || result.title.length > 120) throw new Error("Enter a post title of 1 to 120 characters.");
    if (!result.body || result.body.length > 4000) throw new Error("Write a post of 1 to 4,000 characters.");
    if (!Object.hasOwn(CATEGORIES, category)) throw new Error("Choose a post category.");
    if (category === "announcements" && !developer) throw new Error("Only developers can publish announcements.");
    if (groupId && !GROUPS.some((group) => group.id === groupId)) throw new Error("Choose a valid community group.");
    return result;
}

export function selectPosts(posts, { category = "all", groupId = "", sort = "latest", likes = {} } = {}) {
    const rows = Object.entries(posts).map(([id, post]) => ({ ...post, id }))
        .filter((post) => !post.deletedAt && (category === "all" || post.category === category) && (!groupId || post.groupId === groupId));
    return rows.sort((a, b) => {
        if (sort === "popular") {
            const difference = Object.keys(likes[b.id] || {}).length - Object.keys(likes[a.id] || {}).length;
            if (difference) return difference;
        }
        return sort === "oldest" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt;
    });
}

export function selectPeople(profiles, uid, { onlineOnly = false, search = "", level = "" } = {}) {
    const query = search.trim().toLocaleLowerCase();
    return Object.entries(profiles).map(([id, profile]) => ({ ...profile, id, online: Object.values(profile.presence || {}).some((value) => value === true) }))
        .filter((person) => person.id !== uid && (!onlineOnly || person.online) &&
            `${person.displayName} ${person.nationality || ""} ${person.level || ""}`.toLocaleLowerCase().includes(query))
        .sort((a, b) => Number(b.level === level && Boolean(level)) - Number(a.level === level && Boolean(level)) ||
            Number(b.online) - Number(a.online) || String(a.displayName).localeCompare(String(b.displayName)));
}

export function safeMediaURL(value) {
    if (typeof value !== "string") return "";
    try {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
}

export function relativeTime(timestamp, now = Date.now(), locale = "en") {
    if (!Number.isFinite(timestamp)) return "Just now";
    const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
    if (seconds < 60) return locale.startsWith("id") ? "Baru saja" : "Just now";
    const [unit, divisor] = seconds < 3600 ? ["minute", 60] : seconds < 86400 ? ["hour", 3600] : ["day", 86400];
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-Math.floor(seconds / divisor), unit);
}
