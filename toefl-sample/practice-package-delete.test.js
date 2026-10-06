const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "toefl-storage-sync.js"), "utf8");
const developerSource = fs.readFileSync(path.join(__dirname, "js", "developer.js"), "utf8");

function fixture() {
    const local = new Map();
    const context = vm.createContext({
        window: {},
        console,
        localStorage: {
            getItem: (key) => local.get(key) || null,
            setItem: (key, value) => local.set(key, value)
        }
    });
    vm.runInContext(source, context);
    const storage = context.window.toeflStorage;
    const data = {
        "toefl_itp/practicetest/sets_v2": {
            first: { setId: "first", module: "reading", packageNumber: 2, packageId: "package_2_practice_test" },
            second: { setId: "second", module: "structure", packageNumber: 2 },
            other: { setId: "other", module: "reading", packageNumber: 3 },
            legacy: { setId: "legacy", module: "listening" },
            _updatedAt: "old"
        },
        "toefl_itp/practicetest/package_2_practice_test": {
            packageNumber: 2, sets: { first: "pkg_10", second: "pkg_4" }, setCount: 2
        },
        "toefl_itp/practicetest/drafts_v2/first": { questions: ["first question"] },
        "toefl_itp/practicetest/drafts_v2/second": { questions: ["second question"] }
    };
    const requests = [];
    storage._get = async (key) => {
        if (key.startsWith("toefl_itp/practicetest/sets_v2/")) {
            return data["toefl_itp/practicetest/sets_v2"][key.split("/").pop()] || null;
        }
        return data[key] || null;
    };
    storage._request = async (url, options) => {
        requests.push({ url, options, updates: JSON.parse(options.body) });
        return { ok: true };
    };
    local.set(storage._practiceTestSetsLocalKey, JSON.stringify(data["toefl_itp/practicetest/sets_v2"]));
    local.set(storage._practiceTestDraftsLocalKey, JSON.stringify({ first: { questions: [1] }, other: { questions: [2] } }));
    local.set(storage._practicePackagesLocalKey, JSON.stringify({
        package_2_practice_test: data["toefl_itp/practicetest/package_2_practice_test"],
        package_3_practice_test: { packageNumber: 3 }
    }));
    return { storage, data, local, requests };
}

test("package deletion atomically archives every member and deletes only that package", async () => {
    const { storage, local, requests } = fixture();
    const deleted = await storage.deletePracticePackage(2, ["legacy"]);
    assert.deepEqual(Array.from(deleted).sort(), ["first", "legacy", "second"]);
    assert.equal(requests.length, 1);
    const { updates, options, url } = requests[0];
    assert.equal(options.method, "PATCH");
    assert.match(url, /toefl_itp\.json$/);
    for (const id of deleted) {
        assert.equal(updates[`practicetest/sets_v2/${id}`], null);
        assert.equal(updates[`practicetest/drafts_v2/${id}`], null);
        assert.equal(updates[`archive/practicetest/sets/${id}`]._archived, true);
    }
    assert.equal(updates["archive/practicetest/drafts/first"].questions[0], "first question");
    assert.equal(updates["practicetest/package_2_practice_test"], null);
    assert.ok(Object.keys(updates).every((key) => !key.includes("other") && !key.includes("mocktest")));
    assert.ok(!("practicetest/sets_v2" in updates));
    const remaining = JSON.parse(local.get(storage._practiceTestSetsLocalKey));
    assert.ok(remaining.other);
    assert.ok(!remaining.first);
    assert.ok(JSON.parse(local.get(storage._practiceTestDraftsLocalKey)).other);
    const packages = JSON.parse(local.get(storage._practicePackagesLocalKey));
    assert.ok(packages.package_3_practice_test);
    assert.ok(!packages.package_2_practice_test);
});

test("individual practice deletion keeps its package and updates its membership", async () => {
    const { storage, requests, local } = fixture();
    await storage.deleteSetRecordWithType("first", "practicetest");
    const updates = requests[0].updates;
    assert.equal(updates["practicetest/package_2_practice_test/sets/first"], null);
    assert.equal(updates["practicetest/package_2_practice_test/setCount"], 1);
    assert.ok(!("practicetest/package_2_practice_test" in updates));
    assert.ok(!("practicetest/sets_v2/second" in updates));
    assert.ok(JSON.parse(local.get(storage._practiceTestSetsLocalKey)).second);
});

test("failed atomic write leaves all local data unchanged", async () => {
    const { storage, local } = fixture();
    const before = [...local.entries()];
    storage._request = async () => ({ ok: false, status: 403 });
    await assert.rejects(storage.deletePracticePackage(2), /403/);
    assert.deepEqual([...local.entries()], before);
});

test("failed draft read aborts deletion before any write", async () => {
    const { storage, local, requests } = fixture();
    const before = [...local.entries()];
    const get = storage._get;
    storage._get = async (key) => {
        if (key.includes("drafts_v2/")) throw new Error("Draft unavailable");
        return get(key);
    };
    await assert.rejects(storage.deletePracticePackage(2), /Draft unavailable/);
    assert.equal(requests.length, 0);
    assert.deepEqual([...local.entries()], before);
});

test("stale membership cannot delete a test assigned to another package", async () => {
    const { storage, requests } = fixture();
    await assert.rejects(storage.deletePracticePackage(2, ["other"]), /another package/);
    assert.equal(requests.length, 0);
});

test("empty package can be deleted without touching any test", async () => {
    const { storage, requests } = fixture();
    const deleted = await storage.deletePracticePackage(4);
    assert.equal(deleted.length, 0);
    assert.equal(requests[0].updates["practicetest/package_4_practice_test"], null);
    assert.ok(!Object.keys(requests[0].updates).some((key) => key.startsWith("archive/")));
});

test("package row renders a standalone delete button with the correct test id", () => {
    const start = developerSource.indexOf("function renderPackageOptionRow(");
    const end = developerSource.indexOf("function renderPracticePackageDetail(", start);
    const context = vm.createContext({
        escapeHtml: (value) => String(value || ""),
        formatCompactSetDate: () => "today",
        buildEditorUrl: () => "editor.html?package=2"
    });
    vm.runInContext(developerSource.slice(start, end), context);
    const row = context.renderPackageOptionRow(
        { label: "Reading", icon: "blue-book.png" },
        { setId: "first", module: "reading", setDate: "2026-10-06" }, 2
    );
    assert.match(row, /data-delete-practice-set="first"/);
    assert.ok(row.indexOf("</a>") < row.indexOf("<button"));
    assert.ok(!row.includes("onclick="));
    const empty = context.renderPackageOptionRow({ label: "Reading", module: "reading" }, null, 2);
    assert.ok(empty.includes("Create"));
    assert.ok(!empty.includes("<button"));
});

test("deleting an intermediate package does not render phantom packages or renumber survivors", () => {
    const start = developerSource.indexOf("function renderPracticePackageDetail(");
    const end = developerSource.indexOf("function renderMonthDetail(", start);
    const element = { addEventListener() {} };
    const host = {
        innerHTML: "",
        querySelector: () => element,
        querySelectorAll: () => [],
        classList: { add() {} }
    };
    const context = vm.createContext({
        PRACTICE_MODULE_OPTIONS: [{ id: "pkg_1", label: "Listening", module: "listening" }],
        getPracticeOptionSlots: () => new Map(),
        practicePackages: [{ packageNumber: 1 }, { packageNumber: 3 }],
        renderPackageOptionRow: () => "row",
        renderPackageSyncChip: () => "",
        getPackageView: () => "grid"
    });
    vm.runInContext(developerSource.slice(start, end), context);
    context.renderPracticePackageDetail(host);
    assert.match(host.innerHTML, /data-package="1"/);
    assert.match(host.innerHTML, /data-package="3"/);
    assert.ok(!host.innerHTML.includes('data-package="2"'));
    assert.match(host.innerHTML, /data-remove-package="3"/);
    context.getPackageView = () => "list";
    context.renderPracticePackageDetail(host);
    assert.match(host.innerHTML, /package-grid list-view/);
    assert.match(host.innerHTML, /data-remove-package="1"/);
    context.practicePackages = [];
    context.renderPracticePackageDetail(host);
    assert.ok(!host.innerHTML.includes('data-package="1"'));
    assert.ok(host.innerHTML.includes("No practice packages."));
});

test("card actions use practice test routing and package confirmation without navigating", async () => {
    const handlers = {};
    const makeButton = (name, dataset) => ({
        dataset,
        addEventListener: (event, handler) => { handlers[name] = handler; }
    });
    const packageButton = makeButton("package", { removePackage: "2" });
    const testButton = makeButton("test", { deletePracticeSet: "first", module: "reading" });
    const calls = [];
    const host = {
        querySelector: () => ({ addEventListener() {} }),
        querySelectorAll: (selector) => selector === "[data-remove-package]" ? [packageButton]
            : selector === "[data-delete-practice-set]" ? [testButton] : [],
        classList: { add() {} }
    };
    const context = vm.createContext({
        PRACTICE_MODULE_OPTIONS: [{ id: "pkg_10", module: "reading" }],
        getPracticeOptionSlots: () => new Map([[2, { setId: "first" }]]),
        getPracticePackageNumber: Number,
        practicePackages: [{ packageNumber: 2 }],
        sectionSets: [{ setId: "first", packageNumber: 2 }, { setId: "hidden", packageNumber: 2 }, { setId: "other", packageNumber: 3 }],
        practicePackageMutationInProgress: false,
        practicePackageSyncPromise: null,
        renderPackageOptionRow: () => "",
        renderPackageSyncChip: () => "",
        getPackageView: () => "grid",
        isDeveloperSignedIn: () => true,
        confirm: () => false,
        deleteSet: (...args) => calls.push(args),
        toeflStorage: {
            deletePracticePackage: async (number, ids) => { calls.push([number, Array.from(ids)]); return ids; },
            getPracticePackages: async () => []
        },
        purgeLocalSetCaches: (id) => calls.push(["purge", id]),
        renderAll: async () => calls.push(["render"]),
        toast: (text) => calls.push(["toast", text]),
        updateSyncStatus: () => {}
    });
    const start = developerSource.indexOf("function renderPracticePackageDetail(");
    const end = developerSource.indexOf("function renderMonthDetail(", start);
    vm.runInContext(developerSource.slice(start, end), context);
    context.renderPracticePackageDetail(host);
    handlers.test();
    assert.deepEqual(calls.shift(), ["first", "reading", "practicetest"]);
    await handlers.package();
    assert.equal(calls.length, 0);
    context.confirm = () => true;
    await handlers.package();
    assert.deepEqual(calls[0], [2, ["first", "hidden"]]);
    assert.ok(calls.some(([action]) => action === "render"));
    assert.ok(!calls.some(([action, id]) => action === "purge" && id === "other"));
    assert.equal(context.practicePackageMutationInProgress, false);
});
