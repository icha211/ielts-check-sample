const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const studyPlan = fs.readFileSync(path.join(__dirname, "study-plan.html"), "utf8");
const dailyPractice = fs.readFileSync(path.join(__dirname, "daily-practice.html"), "utf8");

function loadDynamicTestType() {
    const match = studyPlan.match(/function getDynamicTestType\(selectedDate\) \{[\s\S]*?\n            \}/);
    assert.ok(match, "Missing getDynamicTestType");
    return vm.runInNewContext(`const planStartDate = new Date("2026-11-01"); ${match[0]}; getDynamicTestType`);
}

test("mock and practice dates stay aligned across month boundaries", () => {
    const getDynamicTestType = loadDynamicTestType();
    const testTypeFor = (date) => getDynamicTestType(new Date(`${date}T00:00:00`));

    assert.equal(testTypeFor("2026-10-10"), "mocktest");
    assert.equal(testTypeFor("2026-11-01"), "mocktest");
    assert.equal(testTypeFor("2026-11-02"), "practicetest");
    assert.equal(testTypeFor("2026-12-01"), "mocktest");
    assert.equal(testTypeFor("2027-01-05"), "mocktest");
});

test("date-based package lookup excludes records of the other test type", () => {
    const start = studyPlan.indexOf("            function getAvailableSetsByDate(dateValue) {");
    const end = studyPlan.indexOf("\n            function getSetTestType(record)", start);
    assert.ok(start >= 0 && end > start, "Missing date-based package lookup");
    const lookup = studyPlan.slice(start, end);
    const getDynamicTestType = loadDynamicTestType();
    const records = [
        { module: "reading", setDate: "2026-12-01", setId: "mocktest_reading_2026-12-01", updatedAt: "2026-12-01T09:00:00Z" },
        { module: "reading", setDate: "2026-12-01", setId: "practicetest_reading_2026-12-01", updatedAt: "2026-12-01T10:00:00Z" }
    ];
    const context = vm.createContext({
        Date,
        getDynamicTestType,
        getRecordsSource: () => records,
        getSetTestType: (record) => record.setId.startsWith("practicetest_") ? "practicetest" : "mocktest"
    });

    vm.runInContext(`${lookup}; result = getAvailableSetsByDate("2026-12-01")`, context);
    assert.equal(context.result.reading.setId, "mocktest_reading_2026-12-01");
});

test("daily reading launch carries the selected package test type", () => {
    const start = dailyPractice.indexOf("        function launchSection(sectionId) {");
    const end = dailyPractice.indexOf("\n        function updateProgress()", start);
    assert.ok(start >= 0 && end > start, "Missing daily-practice launch handler");
    const launch = dailyPractice.slice(start, end);

    for (const [setId, expectedType] of [
        ["mocktest_reading_2026-12-01", "mocktest"],
        ["practicetest_reading_2026-12-02", "practicetest"]
    ]) {
        const context = vm.createContext({
            URLSearchParams,
            availableSetsBySection: { reading: { setId, focus: "reading" } },
            currentDay: { year: 2026, month: 11, dayNumber: 1 },
            getCurrentDaySetDate: () => "2026-12-01",
            localStorage: { setItem() {} },
            window: { location: { href: "" } },
            alert() {}
        });
        vm.runInContext(`${launch}; launchSection("reading")`, context);
        const params = new URLSearchParams(context.window.location.href.split("?")[1]);
        assert.equal(params.get("testType"), expectedType);
        assert.equal(params.get("setId"), setId);
        if (expectedType === "practicetest") assert.equal(params.get("runMode"), "full");
    }
});

test("modified page scripts remain valid JavaScript", () => {
    for (const html of [studyPlan, dailyPractice]) {
        for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
            new vm.Script(match[1]);
        }
    }
});
