const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "section 3.html"), "utf8");

function functionSource(name, nextName) {
    const start = source.indexOf(`        function ${name}(`);
    const end = source.indexOf(`\n        function ${nextName}(`, start);
    assert.ok(start >= 0 && end > start, `Missing ${name}`);
    return source.slice(start, end);
}

function makeContext(search, testType) {
    const elements = new Map([
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
    }

    const instant = makeContext("?testType=practicetest&runMode=instant", "practicetest");
    instant.context.applyPracticeRunMode();
    assert.equal(instant.elements.get("reading-part-header").style.display, "flex");
    assert.equal(instant.elements.get("display-questions-1").style.display, "none");
    assert.equal(instant.elements.get("instant-question-host-1").hidden, false);
});

test("Section 3 inline scripts remain valid JavaScript", () => {
    for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
        new vm.Script(match[1]);
    }
});
