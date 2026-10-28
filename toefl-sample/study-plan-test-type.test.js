const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const studyPlan = fs.readFileSync(path.join(__dirname, "study-plan.html"), "utf8");
const practiceRecommendations = fs.readFileSync(path.join(__dirname, "toefl-practice-recommendations.js"), "utf8");
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

function loadScheduledTestType(records, packages = [], requestedRecommendation = null) {
    const dynamicType = studyPlan.match(/function getDynamicTestType\(selectedDate\) \{[\s\S]*?\n\s+\}/);
    const packageOverride = studyPlan.match(/function getPracticePackageOverrideForDate\(dateValue, packages\) \{[\s\S]*?\n            \}/);
    const scheduledType = studyPlan.match(/function getScheduledTestType\(dateValue\) \{[\s\S]*?\n            \}/);
    assert.ok(dynamicType && packageOverride && scheduledType, "Missing scheduled test type lookup");
    const context = vm.createContext({
        Date,
        cachedPracticePackages: packages,
        requestedRecommendation,
        getRecordsSource: () => records,
        getSetTestType: (record) => record.testType
    });
    vm.runInContext(`${dynamicType[0]}; ${packageOverride[0]}; ${scheduledType[0]}; result = getScheduledTestType`, context);
    return context.result;
}

function loadPracticeRecommendations(results) {
    const start = studyPlan.indexOf("            function getPracticeRecommendations() {");
    const end = studyPlan.indexOf("\n            function getLocalSetRecords()", start);
    assert.ok(start >= 0 && end > start, "Missing getPracticeRecommendations");
    const context = vm.createContext({
        localStorage: { getItem: (key) => JSON.stringify(results[key] || null) },
        console: { warn() {} },
        window: {}
    });
    vm.runInContext(`${practiceRecommendations}; ${studyPlan.slice(start, end)}; result = getPracticeRecommendations()`, context);
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

test("study-plan UI consistently uses Plus Jakarta Sans", () => {
    assert.match(studyPlan, /family=Plus\+Jakarta\+Sans/);
    assert.match(studyPlan, /body\s*\{[\s\S]*?font-family:\s*"Plus Jakarta Sans",\s*sans-serif/);
    assert.doesNotMatch(studyPlan, /font-family:\s*"(?:Outfit|Space Grotesk|Inter)"/);
    assert.match(studyPlan, /button,\s*input,\s*select,\s*textarea\s*\{\s*font-family:\s*inherit;/);
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
    const scheduledWithPackageOverride = loadScheduledTestType([], [
        { packageNumber: 1, scheduledDate: "2026-11-05" }
    ]);
    assert.equal(scheduledWithPackageOverride("2026-11-05"), "practicetest");
    const linkedRecommendation = loadScheduledTestType([], [], { sectionId: "listening" });
    assert.equal(linkedRecommendation("2026-11-01"), "practicetest");
});

test("per-user package assignment advances after use and reuses a package when all have been used", () => {
    const packageOverride = studyPlan.match(/function getPracticePackageOverrideForDate\(dateValue, packages\) \{[\s\S]*?\n            \}/);
    const packageSelector = studyPlan.match(/function selectPracticePackageForDate\(dateValue, packages, records, consumedPackageNumbers\) \{[\s\S]*?\n            \}/);
    assert.ok(packageOverride && packageSelector, "Missing practice package assignment helpers");
    const context = vm.createContext({
        getSetTestType: (record) => record.testType
    });
    vm.runInContext(`${packageOverride[0]}; ${packageSelector[0]}; result = selectPracticePackageForDate`, context);
    const selectPackage = context.result;
    const packages = [
        { packageNumber: 1, setCount: 3 },
        { packageNumber: 2, setCount: 3 },
        { packageNumber: 3, setCount: 3, scheduledDate: "2026-10-24" }
    ];
    const records = [
        { packageNumber: 1, testType: "practicetest" },
        { packageNumber: 2, testType: "practicetest" },
        { packageNumber: 3, testType: "practicetest" }
    ];

    assert.equal(selectPackage("2026-10-22", packages, records, []).packageNumber, 1);
    assert.equal(selectPackage("2026-10-23", packages, records, []).packageNumber, 1);
    assert.equal(selectPackage("2026-10-22", packages, records, [1]).packageNumber, 2);
    assert.equal(selectPackage("2026-10-24", packages, records, [1]).packageNumber, 3);
    assert.equal(selectPackage("2026-10-22", packages, records, [1, 2, 3]).packageNumber, 1);
});

test("practice package sets are selected by the assigned package and option, not their saved calendar date", () => {
    const start = studyPlan.indexOf("function normalizePracticeFocus(value) {");
    const end = studyPlan.indexOf("\n            function getSetTestType(record)", start);
    assert.ok(start >= 0 && end > start, "Missing practice set lookup");
    const records = [
        { module: "listening", setDate: "2026-10-22", setId: "package1_part1", testType: "practicetest", packageNumber: 1, focus: "part1" },
        { module: "listening", setDate: "2026-10-23", setId: "package2_part2", testType: "practicetest", packageNumber: 2, focus: "part2" }
    ];
    const context = vm.createContext({
        getRecordsSource: () => records,
        getSetTestType: (record) => record.testType,
        Date
    });
    vm.runInContext(`${studyPlan.slice(start, end)}; result = getAvailablePracticeSet`, context);

    assert.equal(context.result("2026-10-22", "listening", { focus: "part1" }, 1).setId, "package1_part1");
    assert.equal(context.result("2026-10-22", "listening", { focus: "part2" }, 1), null);
    assert.equal(context.result("2026-10-22", "listening", { focus: "part2" }, 2).setId, "package2_part2");
});

test("study plan labels the assigned package and records it before launching a practice test", () => {
    assert.match(studyPlan, /Package \$\{practicePackage\.packageNumber\}/);
    assert.match(studyPlan, /activeModalState\.practicePackageNumber = Number\(practiceOption\.packageNumber \|\| currentPracticePackage\?\.packageNumber \|\| 0\)/);
    assert.match(studyPlan, /selectedPackageLabel = activeModalState\.practicePackageNumber/);
    const markIndex = studyPlan.indexOf("await practicePackageProgressApi.markPracticePackageUsed(activeModalState.practicePackageNumber)");
    const launchIndex = studyPlan.indexOf("window.location.href = `${file}?${params.toString()}`", markIndex);
    assert.ok(markIndex >= 0 && launchIndex > markIndex, "Package progress must be saved before navigating to the test");
});

test("study plan keeps package tests available when they have no calendar date", () => {
    const helper = studyPlan.match(/function isStudyPlanSetRecord\(record\) \{[\s\S]*?\n            \}/);
    assert.ok(helper, "Missing package set cache filter");
    const context = vm.createContext({
        getSetTestType: (record) => record.testType
    });
    vm.runInContext(`${helper[0]}; result = isStudyPlanSetRecord`, context);
    assert.equal(context.result({ module: "listening", testType: "practicetest", setDate: "" }), true);
    assert.equal(context.result({ module: "reading", testType: "practicetest", setDate: "2026-11-03" }), true);
    assert.equal(context.result({ module: "reading", testType: "mocktest", setDate: "" }), false);
});

test("developer package cards offer a date override and a return to automatic assignment", () => {
    assert.match(developer, /data-save-package-date/);
    assert.match(developer, /data-clear-package-date/);
    assert.match(developer, /setPracticePackageDate\(packageNumber, scheduledDate\)/);
    assert.match(developer, /clearPracticePackageDate\(packageNumber\)/);
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
        assert.match(loader, /currentTestType === "practicetest" \|\| !requestedRecord\?\.setId/);
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

test("Section 2 resolves a date-less practice test by its assigned package", async () => {
    assert.match(
        studyPlan,
        /if \(testType === "practicetest" && activeModalState\.practicePackageNumber\) \{\s*params\.set\("package", String\(activeModalState\.practicePackageNumber\)\);/
    );
    const helpersStart = structureTest.indexOf("        function normalizePracticeFocus(value) {");
    const helpersEnd = structureTest.indexOf("        // Mock tests follow the day cadence;", helpersStart);
    const lookupStart = structureTest.indexOf("        async function resolveSetRecordByDate(");
    const lookupEnd = structureTest.indexOf("\n        async function resolveSetRecordById(", lookupStart);
    assert.ok(helpersStart >= 0 && helpersEnd > helpersStart, "Missing practice set helpers");
    assert.ok(lookupStart >= 0 && lookupEnd > lookupStart, "Missing practice set lookup");

    const records = [
        { setId: "practicetest_structure_partb-intermediate_package1", module: "structure", packageNumber: 1, focus: "partb", difficulty: "intermediate", setDate: "" },
        { setId: "practicetest_structure_parta-intermediate_package2", module: "structure", packageNumber: 2, focus: "parta", difficulty: "intermediate", setDate: "" },
        { setId: "practicetest_structure_partb-intermediate_package2", module: "structure", packageNumber: 2, focus: "partb", difficulty: "intermediate", setDate: "" }
    ];
    const storage = { getSetRecordsByTestType: async () => records };
    const context = vm.createContext({
        URLSearchParams,
        Date,
        MODULE_ID: "structure",
        currentTestType: "practicetest",
        forcedPracticeFocusPart: 2,
        document: { getElementById: () => ({ value: "intermediate" }) },
        window: {
            location: { search: "?testType=practicetest&focus=partb&difficulty=intermediate&package=2" },
            toeflStorage: storage
        },
        toeflStorage: storage,
        getStoredSetMap: () => ({}),
        console: { warn() {} }
    });

    vm.runInContext(
        `${structureTest.slice(helpersStart, helpersEnd)}; ${structureTest.slice(lookupStart, lookupEnd)}; result = resolveSetRecordByDate`,
        context
    );
    const record = await context.result("2026-10-28");
    assert.equal(record.setId, "practicetest_structure_partb-intermediate_package2");
});

test("Section 2 keeps practice and mock set fallbacks isolated", () => {
    const start = structureTest.indexOf("        function getStoredSetMap(");
    const end = structureTest.indexOf("\n        function updateEditorUrl(", start);
    assert.ok(start >= 0 && end > start, "Missing local set map helpers");

    const local = {
        toefl_developer_sets_v1: JSON.stringify({
            practicetest_structure_partb: { setId: "practicetest_structure_partb", module: "structure" },
            mocktest_structure: { setId: "mocktest_structure", module: "structure" }
        }),
        toefl_developer_sets_v2: "{}",
        toefl_developer_mocktest_sets_v2: "{}",
        toefl_developer_practicetest_sets_v2: "{}"
    };
    const writes = {};
    const context = vm.createContext({
        currentTestType: "practicetest",
        PRACTICE_SETS_KEY: "toefl_developer_practicetest_sets_v2",
        MOCK_SETS_KEY: "toefl_developer_mocktest_sets_v2",
        SETS_KEY: "toefl_developer_sets_v1",
        SETS_KEY_V2: "toefl_developer_sets_v2",
        safeParse(raw, fallback) {
            try { return JSON.parse(raw) || fallback; } catch { return fallback; }
        },
        localStorage: {
            getItem(key) { return local[key] || null; },
            setItem(key, value) { writes[key] = value; }
        }
    });
    vm.runInContext(
        `${structureTest.slice(start, end)}; result = { map: getStoredSetMap(), persist: persistStoredSetMap }`,
        context
    );

    assert.deepEqual(Object.keys(context.result.map), ["practicetest_structure_partb"]);
    context.result.persist({ test: { setId: "practicetest_structure_partb" } });
    assert.ok(writes.toefl_developer_practicetest_sets_v2);
    assert.equal(writes.toefl_developer_sets_v2, undefined);
});

test("modified page scripts remain valid JavaScript", () => {
    for (const html of [studyPlan, dailyPractice, listeningTest, structureTest, readingTest]) {
        for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
            new vm.Script(match[1]);
        }
    }
});
