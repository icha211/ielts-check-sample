const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "section 3.html"), "utf8");

function functionSource(name, nextName) {
    const start = source.search(new RegExp(`        (?:async )?function ${name}\\(`));
    const end = source.indexOf(`\n        function ${nextName}(`, start);
    assert.ok(start >= 0 && end > start, `Missing ${name}`);
    return source.slice(start, end);
}

function makeContext(search, testType) {
    const userViewClasses = new Set();
    const userView = {
        classList: {
            toggle(name, force) {
                if (force) userViewClasses.add(name);
                else userViewClasses.delete(name);
            },
            contains(name) {
                return userViewClasses.has(name);
            }
        }
    };
    const elements = new Map([
        ["user-view", userView],
        ["navigator-panel", { style: {} }],
        ["reading-part-header", { style: {} }],
        ["display-questions-1", { style: {} }],
        ["instant-question-host-1", { style: {}, hidden: true, innerHTML: "previous" }],
        ["set-date", { value: "2026-11-01" }]
    ]);
    const progressBlock = { style: {} };
    const context = vm.createContext({
        URLSearchParams,
        window: { location: { search } },
        currentTestType: testType,
        TOTAL_PASSAGES: 5,
        PRACTICE_READING_TOTAL_PASSAGES: 1,
        document: {
            body: { classList: { toggle() {} } },
            getElementById: (id) => elements.get(id) || null,
            querySelector: () => progressBlock
        },
        updateHeaderPackageLabel() {},
        updateHeaderProgress() {},
        buildInstantOrder() {},
        renderInstantQuestion() {},
        instantIndex: 0,
        instantOrder: [],
        instantChecked: {},
        instantRevealed: false
    });
    vm.runInContext(functionSource("getReadingPracticePartsCount", "isMockTestDayNumber"), context);
    vm.runInContext(functionSource("getPracticeRunMode", "isPracticeTestType"), context);
    vm.runInContext(functionSource("isInstantFeedbackMode", "getPartIdFromUid"), context);
    vm.runInContext(functionSource("applyPracticeRunMode", "getInstantCircleState"), context);
    return { context, elements, progressBlock };
}

test("header label updates without interrupting section initialization", () => {
    for (const [search, testType, date, expectedLabel] of [
        ["?setDate=2026-11-01&testType=mocktest", "mocktest", "2026-11-01", "Mock Test 01 Nov"],
        ["?setDate=2026-11-02&testType=practicetest&runMode=full", "practicetest", "2026-11-02", "Practice Test 02 Nov (Full Test Mode)"],
        ["?setDate=2026-11-02&testType=practicetest&runMode=instant", "practicetest", "2026-11-02", "Practice Test 02 Nov (Instant Feedback)"]
    ]) {
        const { context, elements } = makeContext(search, testType);
        const label = { textContent: "" };
        elements.set("header-package-label", label);
        vm.runInContext(functionSource("updateHeaderPackageLabel", "getPracticeRunMode"), context);

        assert.doesNotThrow(() => context.updateHeaderPackageLabel(date));
        assert.equal(label.textContent, expectedLabel);
    }
});

test("mock reading runs expose all five passages; practice reading remains one", () => {
    const mock = makeContext("?testType=mocktest&fullTest=true", "mocktest");
    const practice = makeContext("?testType=practicetest&runMode=full", "practicetest");

    assert.equal(mock.context.getReadingPracticePartsCount(), 5);
    assert.equal(practice.context.getReadingPracticePartsCount(), 1);
});

test("full-test mode keeps passage navigation visible while instant practice uses question dots", () => {
    for (const [search, testType] of [
        ["?testType=mocktest&fullTest=true", "mocktest"],
        ["?testType=practicetest&runMode=full", "practicetest"]
    ]) {
        const { context, elements } = makeContext(search, testType);
        context.applyPracticeRunMode();
        assert.equal(elements.get("reading-part-header").style.display, "");
        assert.equal(elements.get("user-view").classList.contains("is-reading-instant-practice"), false);
    }

    const instant = makeContext("?testType=practicetest&runMode=instant", "practicetest");
    instant.context.applyPracticeRunMode();
    assert.equal(instant.elements.get("reading-part-header").style.display, "flex");
    assert.equal(instant.elements.get("display-questions-1").style.display, "none");
    assert.equal(instant.elements.get("instant-question-host-1").hidden, false);
    assert.equal(instant.elements.get("user-view").classList.contains("is-reading-instant-practice"), true);
});

test("saved reading review uses loaded question text when a result has only a generic label", () => {
    const resolveQuestionText = functionSource("getSavedReviewQuestionText", "restoreSavedReadingReview");
    const context = vm.createContext({
        coerceText: (value) => String(value || "").replace(/\s+/g, " ").trim()
    });
    vm.runInContext(resolveQuestionText, context);

    assert.equal(
        context.getSavedReviewQuestionText(
            { questionText: "Question 4" },
            { "1_4": { rawQuestionText: "What does the pronoun refer to?" } },
            "1_4",
            4
        ),
        "What does the pronoun refer to?"
    );
    assert.equal(
        context.getSavedReviewQuestionText(
            { questionText: "Which detail is stated?" },
            { "1_4": { rawQuestionText: "A different source prompt" } },
            "1_4",
            4
        ),
        "Which detail is stated?"
    );
});

test("submitting a reading practice test opens its focused summary and preserves the selected set", async () => {
    let savedResult;
    const search = "?testType=practicetest&runMode=instant&setId=practicetest_reading_beginner_1&setDate=2026-10-28";
    const context = vm.createContext({
        URLSearchParams,
        window: {
            location: { search, href: "" },
            toeflTestHistory: { record() {} }
        },
        document: {
            querySelector: () => null,
            getElementById: (id) => id === "set-date" ? { value: "2026-10-28" } : null
        },
        localStorage: {
            setItem: (key, value) => {
                if (key === "toefl_section3_result") savedResult = JSON.parse(value);
            }
        },
        globalAnswerKey: { "1_1": "a" },
        globalQuestions: { "1_1": { questionText: "Question", options: { A: "Answer" } } },
        globalExplanations: {},
        globalEnglishExplanations: {},
        globalPassages: { 1: "Passage" },
        currentSetId: "practicetest_reading_beginner_1",
        currentTestType: "practicetest",
        timerInterval: null,
        confirm: () => true,
        clearInterval() {},
        getPracticeRunMode: () => "instant"
    });

    vm.runInContext(functionSource("submitAnswers", "startTimer"), context);
    await context.submitAnswers();

    const summaryUrl = new URL(context.window.location.href, "https://example.test/toefl-sample/");
    assert.equal(summaryUrl.pathname, "/toefl-sample/full-test-summary.html");
    assert.equal(summaryUrl.searchParams.get("testType"), "practicetest");
    assert.equal(summaryUrl.searchParams.get("section"), "reading");
    assert.equal(summaryUrl.searchParams.get("setId"), "practicetest_reading_beginner_1");
    assert.equal(summaryUrl.searchParams.get("setDate"), "2026-10-28");
    assert.equal(summaryUrl.searchParams.get("runMode"), "instant");
    assert.equal(savedResult.setDate, "2026-10-28");
    assert.equal(savedResult.runMode, "instant");
});

test("Section 3 inline scripts remain valid JavaScript", () => {
    for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
        new vm.Script(match[1]);
    }
});
