const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "toefl-storage-sync.js"), "utf8");

function createStorage() {
    const values = new Map();
    const context = vm.createContext({
        console,
        URLSearchParams,
        window: {},
        localStorage: {
            getItem: (key) => values.get(key) || null,
            setItem: (key, value) => values.set(key, value),
            removeItem: (key) => values.delete(key)
        }
    });
    vm.runInContext(source, context);
    return { storage: context.window.toeflStorage, values };
}

test("mock reading falls back to its legacy Firebase draft when the typed node is empty", async () => {
    const { storage, values } = createStorage();
    const expected = {
        setId: "mocktest_reading_2026-11-01_test",
        module: "reading",
        passages: {
            1: { passage: "Mock passage one", questions: "1. Question one", answerKey: "1. a" },
            2: { passage: "Mock passage two", questions: "11. Question eleven", answerKey: "11. b" },
            3: { passage: "Mock passage three", questions: "21. Question twenty-one", answerKey: "21. c" },
            4: { passage: "Mock passage four", questions: "31. Question thirty-one", answerKey: "31. d" },
            5: { passage: "Mock passage five", questions: "41. Question forty-one", answerKey: "41. a" }
        }
    };
    const requestedPaths = [];
    storage._get = async (requestPath) => {
        requestedPaths.push(requestPath);
        if (requestPath === "toefl_itp/mocktest/drafts_v2/mocktest_reading_2026-11-01_test") {
            return { setId: expected.setId, module: "reading", passages: {} };
        }
        if (requestPath === "toefl_itp/drafts_v2/mocktest_reading_2026-11-01_test") return expected;
        throw new Error(`Unexpected Firebase path: ${requestPath}`);
    };

    const actual = await storage.getDraftBySetIdAndType(expected.setId, "mocktest");

    assert.equal(actual.passages[1].passage, "Mock passage one");
    assert.equal(actual.passages[5].passage, "Mock passage five");
    assert.deepEqual(requestedPaths, [
        `toefl_itp/mocktest/drafts_v2/${expected.setId}`,
        `toefl_itp/drafts_v2/${expected.setId}`
    ]);
    const typedCache = JSON.parse(values.get("toefl_developer_mocktest_drafts_v2"));
    assert.equal(typedCache[expected.setId].passages[5].passage, "Mock passage five");
});

test("practice draft reads do not fall back into mock-only legacy storage", async () => {
    const { storage } = createStorage();
    storage._get = async (requestPath) => {
        if (requestPath === "toefl_itp/practicetest/drafts_v2/practicetest_reading_test") return null;
        throw new Error(`Unexpected Firebase path: ${requestPath}`);
    };

    const actual = await storage.getDraftBySetIdAndType("practicetest_reading_test", "practicetest");
    assert.equal(Object.keys(actual).length, 0);
});

test("mock set metadata falls back to the shared legacy set path by ID", async () => {
    const { storage } = createStorage();
    storage._get = async (requestPath) => {
        if (requestPath === "toefl_itp/mocktest/sets_v2/mocktest_reading_2026-11-01_test") return null;
        if (requestPath === "toefl_itp/sets_v2/mocktest_reading_2026-11-01_test") {
            return { setId: "mocktest_reading_2026-11-01_test", module: "reading", setDate: "2026-11-01" };
        }
        throw new Error(`Unexpected Firebase path: ${requestPath}`);
    };

    const actual = await storage.getSetRecordByIdAndType("mocktest_reading_2026-11-01_test", "mocktest");
    assert.equal(actual.module, "reading");
    assert.equal(actual.setDate, "2026-11-01");
});

test("mock set lookup includes legacy mock records and excludes legacy practice records", async () => {
    const { storage } = createStorage();
    storage._get = async (requestPath) => {
        if (requestPath === "toefl_itp/mocktest/sets_v2") return null;
        if (requestPath === "toefl_itp/sets_v2") {
            return {
                "mocktest_reading_2026-11-01_test": {
                    module: "reading",
                    setDate: "2026-11-01"
                },
                "practicetest_reading_2026-11-02_test": {
                    module: "reading",
                    setDate: "2026-11-02"
                }
            };
        }
        throw new Error(`Unexpected Firebase path: ${requestPath}`);
    };

    const records = await storage.getSetRecordsByTestType("mocktest");
    assert.equal(records.length, 1);
    assert.equal(records[0].setId, "mocktest_reading_2026-11-01_test");
});

test("practice sets can share a date when focus or package differs", async () => {
    const { storage } = createStorage();
    storage.getSetRecordsByTestType = async () => [{
        setId: "practice_listening_part1",
        module: "listening",
        setDate: "2026-11-02",
        focus: "part1",
        difficulty: "intermediate",
        packageNumber: 1
    }];

    await assert.doesNotReject(storage.assertUniqueSetDate({
        setId: "practice_listening_part2",
        module: "listening",
        setDate: "2026-11-02",
        focus: "part2",
        difficulty: "intermediate",
        packageNumber: 1
    }, "practicetest"));

    await assert.doesNotReject(storage.assertUniqueSetDate({
        setId: "practice_listening_part1_package2",
        module: "listening",
        setDate: "2026-11-02",
        focus: "partA",
        difficulty: "intermediate",
        packageNumber: 2
    }, "practicetest"));

    await assert.rejects(
        storage.assertUniqueSetDate({
            setId: "practice_listening_part1_duplicate",
            module: "listening",
            setDate: "2026-11-02",
            focus: "partA",
            difficulty: "intermediate",
            packageNumber: 1
        }, "practicetest"),
        (error) => error.code === "DUPLICATE_SET_DATE"
    );
});

test("practice package date overrides persist and can be cleared without removing package data", async () => {
    const { storage, values } = createStorage();
    const writes = [];
    storage._put = async (requestPath, data) => writes.push([requestPath, data]);

    await storage.setPracticePackageDate(2, "2026-10-22");
    await storage.savePracticePackage(2, { practice_reading_2: "reading_beginner" });
    let packages = storage._packageRecordsFromMap(JSON.parse(values.get("toefl_developer_practicetest_packages_v2")));
    assert.equal(packages[0].scheduledDate, "2026-10-22");
    assert.equal(packages[0].setCount, 1);

    await storage.clearPracticePackageDate(2);
    packages = storage._packageRecordsFromMap(JSON.parse(values.get("toefl_developer_practicetest_packages_v2")));
    assert.equal(packages[0].scheduledDate, "");
    assert.equal(writes[0][0], "toefl_itp/practicetest/package_2_practice_test/scheduledDate");
    assert.equal(writes[2][0], "toefl_itp/practicetest/package_2_practice_test/scheduledDate");
    assert.equal(writes[2][1], null);
    assert.equal(writes[1][1].sets.practice_reading_2, "reading_beginner");
});

test("practice package date overrides reject invalid calendar dates", async () => {
    const { storage } = createStorage();
    storage._put = async () => {
        throw new Error("Invalid date should not be written");
    };

    await assert.rejects(storage.setPracticePackageDate(1, "2026-02-30"), /Invalid practice package date/);
});
