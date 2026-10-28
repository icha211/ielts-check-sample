const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "full-test-summary.html"), "utf8");

function functionSource(name, nextName) {
    const start = source.indexOf(`            function ${name}(`);
    const end = source.indexOf(`\n            function ${nextName}(`, start);
    assert.ok(start >= 0 && end > start, `Missing ${name}`);
    return source.slice(start, end);
}

function renderDetail(isPracticeSectionResult, groups) {
    const context = vm.createContext({
        isPracticeSectionResult,
        esc: (value) => String(value),
        renderChips: () => "chips",
        reviewUrl: () => "review"
    });
    vm.runInContext(functionSource("groupsForDetail", "renderDetail"), context);
    vm.runInContext(functionSource("renderDetail", "render"), context);
    return context.renderDetail({
        cfg: { key: "listening", num: 1, name: "Listening Comprehension", icon: "listening.png" },
        result: { questions: [], testType: "practicetest" },
        total: 4,
        correct: 1,
        accuracy: 25,
        groups
    });
}

test("practice result tabs only include parts with answered questions", () => {
    const html = renderDetail(true, [
        { label: "Part A", questions: [{ userAnswer: "B" }] },
        { label: "Part B", questions: [{ userAnswer: "" }] },
        { label: "Part C", questions: [{ userAnswer: " " }] }
    ]);

    assert.match(html, /Part A/);
    assert.doesNotMatch(html, /Part B|Part C/);
    assert.match(html, /data-group="0"/);
});

test("non-practice result tabs keep all result parts", () => {
    const html = renderDetail(false, [
        { label: "Part A", questions: [{ userAnswer: "B" }] },
        { label: "Part B", questions: [{ userAnswer: "" }] }
    ]);

    assert.match(html, /Part A/);
    assert.match(html, /Part B/);
});

test("full-test summary inline JavaScript remains valid", () => {
    for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
        new vm.Script(match[1]);
    }
});
