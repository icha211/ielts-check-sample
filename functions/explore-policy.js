const KEYWORDS = Object.freeze([
    "IELTS", "TOEFL", "TOEIC", "PTE", "Duolingo English Test", "Speaking", "Listening", "Reading", "Writing",
    "Grammar", "Vocabulary", "Pronunciation", "English Conversation", "Daily English", "Academic English",
    "Business English", "English for Beginners", "English for Intermediate", "English for Advanced",
    "English Study Tips", "Learning Strategies", "English Quiz", "English Practice", "Mock Test",
    "Exam Preparation", "English Resources", "English Books", "English Movies", "English Podcasts",
    "Study Motivation", "Learning Progress", "Study Partner", "Practice Partner", "Language Exchange",
    "English Community", "Tutor & Teacher", "Online Course", "Scholarship", "Study Abroad", "Education & Learning"
]);
const PRACTICE_OPTIONS = Object.freeze({
    goals: ["IELTS Preparation", "TOEFL ITP Preparation", "TOEFL iBT Preparation", "Duolingo English Test Preparation",
        "Daily English Conversation", "Business English", "Academic English", "English for Beginners", "Scholarship Preparation"],
    level: ["Beginner", "Intermediate", "Advanced"],
    skills: ["Speaking", "Listening", "Pronunciation", "Vocabulary", "Grammar", "Writing"],
    styles: ["Voice Call", "Video Call", "Text Conversation", "Group Discussion", "One-on-One Practice"]
});
const WEIGHTS = Object.freeze({ view: 5, save: 4, share: 3, comment: 2, like: 1 });
function keywords(value = []) {
    if (!Array.isArray(value) || value.length > 3 || new Set(value).size !== value.length || value.some(item => !KEYWORDS.includes(item))) {
        throw new TypeError("Choose up to three distinct learning keywords.");
    }
    return value;
}
function preferences(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        typeof input.viewTracking !== "boolean" || typeof input.discoverable !== "boolean") throw new TypeError("Choose valid Explore preferences.");
    const result = { viewTracking: input.viewTracking, discoverable: input.discoverable };
    for (const field of ["goals", "skills", "styles"]) {
        const values = input[field] || [];
        if (!Array.isArray(values) || values.length > PRACTICE_OPTIONS[field].length ||
            new Set(values).size !== values.length || values.some(value => !PRACTICE_OPTIONS[field].includes(value))) throw new TypeError(`Choose valid practice ${field}.`);
        result[field] = values;
    }
    if (input.level && !PRACTICE_OPTIONS.level.includes(input.level)) throw new TypeError("Choose a valid English proficiency level.");
    result.level = input.level || "";
    return result;
}
const overlap = (a = [], b = []) => {
    const union = new Set([...a, ...b]);
    return union.size ? a.filter(value => b.includes(value)).length / union.size : 0;
};
function matchingScore(a, b) {
    return Math.round(40 * overlap(a.goals, b.goals) +
        30 * Number(Boolean(a.level) && a.level === b.level) +
        20 * overlap(a.skills, b.skills) + 10 * overlap(a.styles, b.styles));
}
function learningScore(tags = [], interests = {}) {
    return tags.reduce((sum, tag) => sum + Math.max(0, Number(interests[tag]) || 0), 0);
}
function engagement(signals = {}) {
    return Object.values(signals).reduce((sum, signal) => sum +
        Object.entries(WEIGHTS).reduce((score, [kind, weight]) => score + weight *
            (kind === "comment" ? Math.max(0, Number(signal.comment) || 0) : Number(signal[kind] === true)), 0), 0);
}
function networkScore(signals = {}, network = new Set()) {
    return Object.entries(signals).filter(([uid]) => network.has(uid)).reduce((sum, [, signal]) =>
        sum + ["save", "share", "comment", "like"].reduce((score, kind) => score + WEIGHTS[kind] *
            (kind === "comment" ? Math.max(0, Number(signal.comment) || 0) : Number(signal[kind] === true)), 0), 0);
}
// One ten-item cycle implements 60/20/10/10. Empty pools borrow eligible items.
function mixFeed(pools, limit = 30) {
    const pattern = ["primary", "primary", "secondary", "primary", "partner", "primary", "secondary", "primary", "course", "primary"];
    const used = new Set(), result = [];
    const take = key => {
        while (pools[key]?.length) {
            const item = pools[key].shift(), identity = `${item.type}:${item.id}`;
            if (!used.has(identity)) { used.add(identity); return item; }
        }
        return null;
    };
    for (let index = 0; index < limit; index++) {
        let item = take(pattern[index % 10]);
        if (!item) for (const key of ["primary", "secondary", "partner", "course", "extra"]) {
            item = take(key);
            if (item) break;
        }
        if (!item) break;
        result.push(item);
    }
    return result;
}
module.exports = { KEYWORDS, PRACTICE_OPTIONS, WEIGHTS, keywords, preferences, matchingScore, learningScore, engagement, networkScore, mixFeed };
