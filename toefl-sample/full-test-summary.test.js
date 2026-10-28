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

test("recommended practice opens the study plan with the selected section and focus", () => {
    const context = vm.createContext({ URLSearchParams });
    vm.runInContext(functionSource("practiceUrl", "renderPriorities"), context);

    const listeningUrl = new URL(
        context.practiceUrl(
            { cfg: { key: "listening" } },
            { id: "2", label: "Part B: Long Conversations" }
        ),
        "https://example.test/toefl-sample/"
    );
    assert.equal(listeningUrl.pathname, "/toefl-sample/study-plan.html");
    assert.equal(listeningUrl.searchParams.get("recommendSection"), "listening");
    assert.equal(listeningUrl.searchParams.get("recommendFocus"), "partb");
    assert.equal(listeningUrl.searchParams.get("recommendLabel"), "Part B: Long Conversations");

    const readingUrl = new URL(
        context.practiceUrl(
            { cfg: { key: "reading" } },
            { id: "1", label: "Passage 1" }
        ),
        "https://example.test/toefl-sample/"
    );
    assert.equal(readingUrl.pathname, "/toefl-sample/study-plan.html");
    assert.equal(readingUrl.searchParams.get("recommendSection"), "reading");
    assert.equal(readingUrl.searchParams.get("recommendFocus"), null);
});

test("full-test summary inline JavaScript remains valid", () => {
    for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
        new vm.Script(match[1]);
    }
});

test("full mock summaries reject stale section results from another session", () => {
    let saved = {
        mockSessionId: "previous-session", totalQuestions: 50, rawScore: 1,
        scaledScore: 31, questions: [{ number: 1, passageId: 1, isCorrect: true }]
    };
    const context = vm.createContext({
        params: new URLSearchParams("mockSessionId=current-session"),
        readResult: () => saved,
        groupLabel: () => "Passage 1",
        pct: (correct, total) => Math.round(correct / total * 100)
    });
    vm.runInContext(functionSource("buildSection", "totalNote"), context);
    const config = { storage: "toefl_section3_result", group: "passageId" };
    assert.equal(context.buildSection(config), null);
    saved = { ...saved, mockSessionId: "current-session" };
    assert.equal(context.buildSection(config).correct, 1);
});
