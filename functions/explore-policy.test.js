const { test } = require("node:test");
const assert = require("node:assert/strict");
const policy = require("./explore-policy");
test("Explore supports the PDF's exact 40 keywords and a maximum of three distinct tags", () => {
    assert.equal(policy.KEYWORDS.length, 40);
    assert.equal(new Set(policy.KEYWORDS).size, 40);
    assert.deepEqual(policy.keywords(["IELTS", "Speaking", "Practice Partner"]), ["IELTS", "Speaking", "Practice Partner"]);
    for (const tags of [["invalid"], ["IELTS", "IELTS"], policy.KEYWORDS.slice(0, 4), "IELTS"]) assert.throws(() => policy.keywords(tags));
});
test("engagement and social-network interactions use exact PDF weights", () => {
    const signals = { a: { view: true, save: true, share: true, comment: 3, like: true }, b: { save: true, comment: 1 } };
    assert.equal(policy.engagement(signals), 25);
    assert.equal(policy.networkScore(signals, new Set(["a"])), 14);
    assert.equal(policy.networkScore(signals, new Set(["b"])), 6);
    assert.equal(policy.learningScore(["IELTS", "Speaking"], { IELTS: 5, Speaking: 4 }), 9);
});
test("partner matching uses 40/30/20/10 without inventing matches for missing fields", () => {
    const a = { goals: ["IELTS Preparation"], level: "Intermediate", skills: ["Speaking"], styles: ["Voice Call"] };
    assert.equal(policy.matchingScore(a, a), 100);
    assert.equal(policy.matchingScore({}, {}), 0);
    assert.equal(policy.matchingScore(a, { ...a, goals: ["TOEFL ITP Preparation"] }), 60);
    assert.equal(policy.matchingScore(a, { ...a, level: "Advanced" }), 70);
    assert.equal(policy.matchingScore(a, { ...a, skills: ["Writing"] }), 80);
    assert.equal(policy.matchingScore(a, { ...a, styles: ["Text Conversation"] }), 90);
    assert.equal(policy.matchingScore(a, { ...a, goals: ["IELTS Preparation", "Business English"] }), 80);
});
test("mixed feeds meet exact 60/20/10/10 quotas when eligible pools are sufficient", () => {
    const pools = Object.fromEntries(["primary", "secondary", "partner", "course"].map(type =>
        [type, Array.from({ length: 30 }, (_, index) => ({ id: `${type}-${index}`, type }))]));
    const items = policy.mixFeed(pools, 30);
    assert.deepEqual(Object.fromEntries(Object.keys(pools).map(type => [type, items.filter(item => item.type === type).length])),
        { primary: 18, secondary: 6, partner: 3, course: 3 });
});
test("shortages borrow one item at a time without losing or duplicating candidates", () => {
    const a = { type: "post", id: "a" }, b = { type: "post", id: "b" }, c = { type: "partner", id: "c" };
    assert.deepEqual(policy.mixFeed({ primary: [], secondary: [a], partner: [c], course: [b] }), [a, c, b]);
    const items = policy.mixFeed({ primary: [a, b], secondary: [a, b], partner: [], course: [] });
    assert.equal(items.length, 2);
    assert.equal(new Set(items.map(item => `${item.type}:${item.id}`)).size, 2);
});
test("practice preferences validate consent and supported options", () => {
    const input = { viewTracking: false, discoverable: false, goals: [], skills: [], styles: [], level: "" };
    assert.deepEqual(policy.preferences(input), input);
    for (const change of [{ viewTracking: "yes" }, { discoverable: 1 }, { goals: ["Scholarship"] }, { level: "A2" }, { skills: ["Speaking", "Speaking"] }]) assert.throws(() => policy.preferences({ ...input, ...change }));
});
