export function validateCommunityProfile({ bio, location, interests, shareConnections }) {
    const result = { bio: String(bio || "").trim(), location: String(location || "").trim(), interests: String(interests || "").trim(), shareConnections: shareConnections === true };
    if (result.bio.length > 500 || result.location.length > 100 || result.interests.length > 240) throw new Error("Profile details exceed the allowed length.");
    const tags = result.interests.split(",").map((tag) => tag.trim()).filter(Boolean);
    if (tags.length > 8 || tags.some((tag) => tag.length > 30)) throw new Error("Use up to 8 interests, each no longer than 30 characters.");
    result.interests = [...new Set(tags)].join(", ");
    return result;
}
export function profileSummary(posts, uid, connections = {}, ownConnections = {}) {
    const recent = Object.entries(posts).filter(([, post]) => post.authorId === uid && !post.deletedAt).map(([id, post]) => ({ ...post, id })).sort((a, b) => b.createdAt - a.createdAt);
    const peers = Object.keys(connections).filter((id) => connections[id] === true);
    const mutual = peers.filter((id) => ownConnections[id]?.status === "connected");
    const achievements = [];
    if (recent.length) achievements.push({ icon: "pencil", title: "First contribution", description: "Shared a post with the community." });
    if (recent.some((post) => post.category === "questions")) achievements.push({ icon: "help-circle", title: "Curious learner", description: "Asked the community a question." });
    if (peers.length) achievements.push({ icon: "users", title: "Learning together", description: "Made an approved connection." });
    if (recent.length >= 10) achievements.push({ icon: "award", title: "Regular contributor", description: "At least 10 posts in the recent feed." });
    return { recent, peers, mutual, achievements };
}
