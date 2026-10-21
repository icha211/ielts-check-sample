const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const studyPlan = fs.readFileSync(path.join(__dirname, "study-plan.html"), "utf8");
const dailyPractice = fs.readFileSync(path.join(__dirname, "daily-practice.html"), "utf8");
const listeningTest = fs.readFileSync(path.join(__dirname, "section 1.html"), "utf8");
const structureTest = fs.readFileSync(path.join(__dirname, "section 2.html"), "utf8");
const readingTest = fs.readFileSync(path.join(__dirname, "section 3.html"), "utf8");
const developer = fs.readFileSync(path.join(__dirname, "js", "developer.js"), "utf8");

function loadDynamicTestType() {
    const match = studyPlan.match(/function getDynamicTestType\(selectedDate\) \{[\s\S]*?\n            \}/);
    assert.ok(match, "Missing getDynamicTestType");
    return vm.runInNewContext(`${match[0]}; getDynamicTestType`);
}

function loadScheduledTestType(records) {
    const dynamicType = studyPlan.match(/function getDynamicTestType\(selectedDate\) \{[\s\S]*?\n\s+\}/);
    const scheduledType = studyPlan.match(/function getScheduledTestType\(dateValue\) \{[\s\S]*?\n\s+\}/);
    assert.ok(dynamicType && scheduledType, "Missing scheduled test type lookup");
    const context = vm.createContext({
        Date,
        getRecordsSource: () => records,
        getSetTestType: (record) => record.testType
    });
    vm.runInContext(`${dynamicType[0]}; ${scheduledType[0]}; result = getScheduledTestType`, context);
    return context.result;
}

function loadPracticeRecommendations(results) {
    const start = studyPlan.indexOf("            function getPracticeRecommendations() {");
    const end = studyPlan.indexOf("\n            function getLocalSetRecords()", start);
    assert.ok(start >= 0 && end > start, "Missing getPracticeRecommendations");
    const context = vm.createContext({
        localStorage: { getItem: (key) => JSON.stringify(results[key] || null) },
        console: { warn() {} }
    });
    vm.runInContext(`${studyPlan.slice(start, end)}; result = getPracticeRecommendations()`, context);
    return JSON.parse(JSON.stringify(context.result));
}

test("mock and practice dates stay aligned across month boundaries", () => {
    const getDynamicTestType = loadDynamicTestType();
    const testTypeFor = (date) => getDynamicTestType(new Date(`${date}T00:00:00`));

    assert.equal(testTypeFor("2026-10-01"), "mocktest");
    assert.equal(testTypeFor("2026-10-02"), "practicetest");
    assert.equal(testTypeFor("2026-10-10"), "practicetest");
    assert.equal(testTypeFor("2026-11-01"), "mocktest");
    assert.equal(testTypeFor("2026-11-02"), "practicetest");
    assert.equal(testTypeFor("2026-11-05"), "mocktest");
    assert.equal(testTypeFor("2026-12-01"), "mocktest");
    assert.equal(testTypeFor("2027-01-05"), "mocktest");
});

test("practice days render recommendation cards and section-specific practice choices", () => {
    assert.match(studyPlan, /mock-panel\.practice-day \.simulation-banner\s*\{\s*display:\s*none;/);
    assert.match(studyPlan, /id="practiceRecommendations"/);
    assert.match(studyPlan, /sectionGrid\.classList\.toggle\("practice-grid", !isMockTest\)/);
    assert.match(studyPlan, /openPracticeModal\(secId, \{/);
    assert.match(studyPlan, /data-practice-difficulty="\$\{option\.difficulty\}"/);
});

test("practice recommendations rank real saved section accuracy without fake fallback scores", () => {
    const recommendations = loadPracticeRecommendations({
        toefl_section1_result: {
            questions: [
                { partId: 1, isCorrect: false },
                { partId: 1, isCorrect: false },
                { partId: 2, isCorrect: true }
            ]
        },
        toefl_section2_result: {
            questions: [
                { partId: 1, isCorrect: true },
                { partId: 2, isCorrect: false }
            ]
        }
    });

    assert.equal(recommendations.length, 2);
    assert.deepEqual(
        recommendations.map(({ sectionId, focus, accuracy }) => ({ sectionId, focus, accuracy })),
        [
            { sectionId: "listening", focus: "Part A: Short Conversation", accuracy: 0 },
            { sectionId: "structure", focus: "Written Expression", accuracy: 0 }
        ]
    );
});

test("practice modal defaults to 20 minutes and reveals a custom Lucide slider", () => {
    assert.match(studyPlan, /timerMinutes:\s*20/);
    assert.match(studyPlan, /activeModalState\.timerMinutes = 20/);
    assert.match(studyPlan, /data-timer-minutes="20"/);
    assert.match(studyPlan, /data-timer-custom/);
    assert.match(studyPlan, /id="customTimeSlider" type="range" min="5" max="60"/);
    assert.match(studyPlan, /data-lucide="clock"/);
    assert.match(studyPlan, /activeModalState\.timerMinutes = minutes/);
    assert.match(studyPlan, /prefers-reduced-motion:reduce/);
});

test("listening and structure practice timers honor selected time limits", () => {
    for (const page of [listeningTest, structureTest]) {
        assert.match(page, /params\.get\("time"\) \|\| params\.get\("timer"\)/);
        assert.match(page, /requestedMinutes > 0/);
        assert.match(page, /\["unlimited", "none", "0"\]\.includes\(requestedTime\)/);
    }
});

test("date-based package lookup filters by the scheduled test type", () => {
    const start = studyPlan.indexOf("function getAvailableSetsByDate(dateValue, expectedType = getScheduledTestType(dateValue)) {");
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

    vm.runInContext(`${lookup}; result = getAvailableSetsByDate("2026-12-01", "mocktest")`, context);
    assert.equal(context.result.reading.setId, "mocktest_reading_2026-12-01");
});

test("saved developer practice schedules override the mock-day cadence", () => {
    const getScheduledTestType = loadScheduledTestType([
        { module: "listening", setDate: "2026-11-01", setId: "practicetest_listening_part2_1", testType: "practicetest" },
        { module: "reading", setDate: "2026-11-02", setId: "practicetest_reading_beginner_1", testType: "practicetest" }
    ]);

    assert.equal(getScheduledTestType("2026-11-01"), "practicetest");
    assert.equal(getScheduledTestType("2026-11-02"), "practicetest");
});

test("practice launch resolves the saved focus variant instead of another section set", () => {
    const start = studyPlan.indexOf("function normalizePracticeFocus(value) {");
    const end = studyPlan.indexOf("\n            function getSetTestType(record)", start);
    assert.ok(start >= 0 && end > start, "Missing practice variant lookup");
    const records = [
        { module: "listening", setDate: "2026-11-02", setId: "practice_part1", focus: "part1", testType: "practicetest", updatedAt: "2026-11-02T09:00:00Z" },
        { module: "listening", setDate: "2026-11-02", setId: "practice_part2", focus: "part2", testType: "practicetest", updatedAt: "2026-11-02T10:00:00Z" }
    ];
    const context = vm.createContext({
        Date,
        getRecordsSource: () => records,
        getSetTestType: (record) => record.testType
    });
    vm.runInContext(`${studyPlan.slice(start, end)}; result = getAvailablePracticeSet("2026-11-02", "listening", { focus: "partb" })`, context);
    assert.equal(context.result.setId, "practice_part2");
});

test("practice test dates can be assigned outside the mock cadence", () => {
    for (const page of [listeningTest, structureTest, readingTest]) {
        const helper = page.match(/function isDateAllowedForTestType\(dateString, testType\) \{[\s\S]*?\n        \}/);
        assert.ok(helper, "Missing date ownership validation");
        const isDateAllowed = vm.runInNewContext(`function isMockTestDayNumber(day) { return ((day - 1) % 4) === 0; }; ${helper[0]}; isDateAllowedForTestType`);
        assert.equal(isDateAllowed("2026-11-01", "practicetest"), true);
        assert.equal(isDateAllowed("2026-11-01", "mocktest"), true);
    }

    const dayAvailability = developer.match(/function isDayOpenForTestType\(day, testType\) \{[\s\S]*?\n\}/);
    assert.ok(dayAvailability, "Missing developer calendar day availability");
    const isDayOpen = vm.runInNewContext(`function isMockTestDayNumber(day) { return ((day - 1) % 4) === 0; }; ${dayAvailability[0]}; isDayOpenForTestType`);
    assert.equal(isDayOpen(1, "practicetest"), true);
});

test("section launchers keep explicit generated practice set IDs for the requested date", () => {
    for (const page of [listeningTest, structureTest, readingTest]) {
        const start = page.indexOf("async function loadSectionMeta()");
        const end = page.indexOf("\n        async function saveSectionMeta()", start);
        assert.ok(start >= 0 && end > start, "Missing section metadata loader");
        const loader = page.slice(start, end);
        assert.match(loader, /requestedRecord = await resolveSetRecordById\(currentSetId\)/);
        assert.match(loader, /!requestedRecord\?\.setId \|\| !requested(?:Date|NormalizedDate)/);
    }

    assert.doesNotMatch(listeningTest, /currentMatchesRequested/);
});

test("closing the listening onboarding overlay releases the question scroll lock", () => {
    const closeModal = listeningTest.match(/function closeInstructionModal\(\) \{[\s\S]*?\n        \}/);
    assert.ok(closeModal, "Missing listening instruction modal cleanup");
    const lockStates = [];
    const context = vm.createContext({
        document: { getElementById: () => null },
        setOnboardingScrollLock: (isLocked) => lockStates.push(isLocked)
    });

    vm.runInContext(`${closeModal[0]}; closeInstructionModal()`, context);
    assert.deepEqual(lockStates, [false]);
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
    for (const html of [studyPlan, dailyPractice, listeningTest, structureTest, readingTest]) {
        for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
            new vm.Script(match[1]);
        }
    }
});
