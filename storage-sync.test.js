const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const { test } = require("node:test");

function database(initial = {}) {
    let data = structuredClone(initial);
    const calls = [];
    let deniedMethod = "";
    let networkFailure = false;
    const read = (key) => key.split("/").reduce((value, part) => value?.[part], data) ?? null;
    const write = (key, value) => {
        const parts = key.split("/");
        let node = data;
        for (const part of parts.slice(0, -1)) node = node[part] ||= {};
        if (value === null) delete node[parts.at(-1)];
        else node[parts.at(-1)] = structuredClone(value);
    };
    const etag = (key) => `"${createHash("sha256").update(JSON.stringify(read(key))).digest("hex")}"`;
    return {
        calls, read, write,
        deny: (method) => { deniedMethod = method; },
        failNetwork: () => { networkFailure = true; },
        fetch: async (url, options) => {
            await Promise.resolve();
            if (networkFailure) throw new Error("Network unavailable");
            const key = new URL(url).pathname.slice(1).replace(/\.json$/, "");
            calls.push({ key, ...options });
            let status = deniedMethod === options.method ? 403 : 200;
            if (status === 200 && options.method === "PUT") {
                if (options.headers["If-Match"] !== etag(key)) status = 412;
                else write(key, JSON.parse(options.body));
            }
            const value = structuredClone(read(key));
            const revision = etag(key);
            return {
                ok: status === 200, status,
                headers: { get: (name) => name.toLowerCase() === "etag" ? revision : null },
                json: async () => value
            };
        }
    };
}

function fixture(db, toefl = false) {
    const local = new Map();
    const context = vm.createContext({
        console: { log() {}, warn() {} },
        fetch: db.fetch, URLSearchParams, window: {},
        localStorage: {
            getItem: (key) => local.get(key) || null,
            setItem: (key, value) => local.set(key, value),
            removeItem: (key) => local.delete(key)
        }
    });
    const filename = toefl ? path.join("toefl-sample", "toefl-storage-sync.js") : "storage-sync.js";
    vm.runInContext(fs.readFileSync(path.join(__dirname, filename), "utf8"), context);
    const storage = toefl ? context.window.toeflStorage : vm.runInContext("storageSync", context);
    if (toefl) storage._getAuthToken = async () => "test-token";
    return { storage, local };
}

test("legacy cloud rejection cannot return success or replace the confirmed local cache", async () => {
    const db = database({ ielts_check: { problems_v1: { reading: [{ id: "existing" }] } } });
    const { storage, local } = fixture(db);
    await storage.getAllProblems();
    db.deny("PUT");
    await assert.rejects(storage.saveAllProblems({ reading: [{ id: "unsaved" }] }), /403/);
    assert.equal(storage.isRemoteAvailable, false);
    assert.match(storage._lastStorageError, /403/);
    assert.equal(JSON.parse(local.get("prephaven_problems_v1"))[0].id, "existing");
});

test("legacy CRUD cannot mutate shared data using an offline fallback", async () => {
    const db = database();
    const { storage } = fixture(db);
    db.deny("GET");
    await assert.rejects(storage.addProblem("reading", { id: "new" }), /403/);
    await assert.rejects(storage.deleteProblem("reading", "old"), /403/);
    await assert.rejects(storage.updateProblem("reading", "old", {}), /403/);
    assert.equal(db.calls.filter((call) => call.method === "PUT").length, 0);
});

test("concurrent legacy additions retry conflicts and retain both records and other modules", async () => {
    const db = database({ ielts_check: { problems_v1: { listening: [{ id: "audio" }] } } });
    const left = fixture(db).storage;
    const right = fixture(db).storage;
    await Promise.all([
        left.addProblem("reading", { id: "left" }),
        right.addProblem("reading", { id: "right" })
    ]);
    assert.deepEqual(db.read("ielts_check/problems_v1/reading").map((p) => p.id).sort(), ["left", "right"]);
    assert.equal(db.read("ielts_check/problems_v1/listening")[0].id, "audio");
    assert.ok(db.calls.filter((call) => call.method === "PUT").length >= 3);
});

test("stale legacy replacement and same-problem edits cannot overwrite a newer save", async () => {
    const db = database({ ielts_check: { problems_v1: { reading: [{ id: "one", text: "old" }] } } });
    const left = fixture(db).storage;
    const right = fixture(db).storage;
    await Promise.all([left.getAllProblems(), right.getAllProblems()]);
    await left.updateProblem("reading", "one", { text: "new" });
    await assert.rejects(right.updateProblem("reading", "one", { text: "stale" }), /Another editor/);
    await assert.rejects(right.saveProblemsByModule("reading", [{ id: "one", text: "stale" }]), /Another editor/);
    assert.equal(db.read("ielts_check/problems_v1/reading")[0].text, "new");
    await assert.rejects(right.updateProblem("reading", "missing", {}), /no longer exists/);
});

test("legacy concurrent delete and addition retain the new record", async () => {
    const db = database({ ielts_check: { problems_v1: { reading: [{ id: "old" }] } } });
    await Promise.all([
        fixture(db).storage.deleteProblem("reading", "old"),
        fixture(db).storage.addProblem("reading", { id: "new" })
    ]);
    assert.deepEqual(db.read("ielts_check/problems_v1/reading"), [{ id: "new" }]);
});

test("legacy same-record concurrent updates without a cached baseline do not silently overwrite", async () => {
    const db = database({ ielts_check: { problems_v1: { reading: [{ id: "one", text: "old" }] } } });
    const results = await Promise.allSettled([
        fixture(db).storage.updateProblem("reading", "one", { text: "left" }),
        fixture(db).storage.updateProblem("reading", "one", { text: "right" })
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.match(results.find((result) => result.status === "rejected").reason.message, /Another editor/);
});

test("legacy conflict retries are bounded and never claim success after exhaustion", async () => {
    const { storage } = fixture(database());
    let attempts = 0;
    storage._rtdbPut = async () => {
        attempts++;
        const error = new Error("Concurrent update");
        error.code = "STORAGE_CONFLICT";
        throw error;
    };
    await assert.rejects(storage.addProblem("reading", { id: "one" }), /Concurrent update/);
    assert.equal(attempts, 5);
});

test("TOEFL rejected typed and legacy draft saves return false and keep editable local drafts", async () => {
    for (const typed of [true, false]) {
        const db = database();
        db.deny("PUT");
        const { storage, local } = fixture(db, true);
        const draft = { parts: { 1: { questions: "Unsaved question" } } };
        const saved = typed
            ? await storage.saveDraftBySetIdAndType("set_one", "listening", draft, "mocktest")
            : await storage.saveDraftBySetId("set_one", "listening", draft);
        assert.equal(saved, false);
        assert.equal(storage.isRemoteAvailable, false);
        assert.match(storage.getLastStorageError(), /403/);
        const key = typed ? storage._mockTestDraftsLocalKey : storage._draftsV2LocalKey;
        assert.equal(JSON.parse(local.get(key)).set_one.parts[1].questions, "Unsaved question");
    }
});

test("TOEFL two editors cannot overwrite the same draft without reloading", async () => {
    const db = database({ toefl_itp: { mocktest: { drafts_v2: { set_one: { parts: { 1: { questions: "old" } } } } } } });
    const left = fixture(db, true).storage;
    const right = fixture(db, true).storage;
    await Promise.all([
        left.getDraftBySetIdAndType("set_one"),
        right.getDraftBySetIdAndType("set_one")
    ]);
    assert.equal(await left.saveDraftBySetIdAndType("set_one", "listening", { parts: { 1: { questions: "new" } } }), true);
    assert.equal(await right.saveDraftBySetIdAndType("set_one", "listening", { parts: { 1: { questions: "stale" } } }), false);
    assert.match(right.getLastStorageError(), /Another editor/);
    assert.equal(db.read("toefl_itp/mocktest/drafts_v2/set_one/parts/1/questions"), "new");
});

test("TOEFL collection imports preserve unrelated records in Firebase and local cache", async () => {
    const db = database({ toefl_itp: { mocktest: { sets_v2: { existing: { setId: "existing", module: "reading" } } } } });
    const { storage, local } = fixture(db, true);
    local.set(storage._mockTestSetsLocalKey, JSON.stringify({ existing: { setId: "existing" } }));
    await Promise.all([
        storage.saveSetRecordsWithType([{ setId: "left", module: "reading" }]),
        fixture(db, true).storage.saveSetRecordsWithType([{ setId: "right", module: "listening" }])
    ]);
    assert.deepEqual(Object.keys(db.read("toefl_itp/mocktest/sets_v2")).sort(), ["existing", "left", "right"]);
    assert.ok(JSON.parse(local.get(storage._mockTestSetsLocalKey)).existing);
    assert.ok(db.calls.filter((call) => call.method === "PUT").every((call) => call.key !== "toefl_itp/mocktest/sets_v2"));
});

test("TOEFL stale metadata from a catalog snapshot is rejected at the individual record", async () => {
    const db = database({ toefl_itp: { mocktest: { sets_v2: { one: { setId: "one", module: "reading", label: "old" } } } } });
    const { storage } = fixture(db, true);
    await storage._get("toefl_itp/mocktest/sets_v2");
    db.write("toefl_itp/mocktest/sets_v2/one", { setId: "one", module: "reading", label: "new" });
    for (let attempt = 0; attempt < 2; attempt++) {
        await assert.rejects(storage.saveSetRecordsWithType([{ setId: "one", module: "reading", label: "stale" }]), /Another editor/);
    }
    assert.equal(db.read("toefl_itp/mocktest/sets_v2/one/label"), "new");
});

test("TOEFL failed metadata writes reject and preserve the pending local edit", async () => {
    const db = database();
    db.deny("PUT");
    const { storage, local } = fixture(db, true);
    await assert.rejects(storage.saveSetRecordsWithType([{ setId: "one", module: "reading" }]), /403/);
    assert.equal(storage.isRemoteAvailable, false);
    assert.equal(JSON.parse(local.get(storage._mockTestSetsLocalKey)).one.setId, "one");
});

test("TOEFL archive reads must succeed before active data or local cache is removed", async () => {
    const db = database();
    db.deny("GET");
    const { storage, local } = fixture(db, true);
    local.set(storage._mockTestSetsLocalKey, JSON.stringify({ one: { setId: "one" } }));
    await assert.rejects(storage.deleteSetRecordWithType("one"), /403/);
    assert.ok(JSON.parse(local.get(storage._mockTestSetsLocalKey)).one);
    assert.equal(db.calls.filter((call) => call.method === "PUT").length, 0);
});

test("TOEFL archive deletion does not replace other active sets or drafts", async () => {
    const db = database({ toefl_itp: { mocktest: {
        sets_v2: { one: { setId: "one", module: "listening" }, two: { setId: "two", module: "reading" } },
        drafts_v2: { one: { parts: { 1: { questions: "keep in archive" } } }, two: { passages: { 1: { passage: "keep active" } } } }
    } } });
    const { storage } = fixture(db, true);
    await storage.deleteSetRecordWithType("one");
    assert.equal(db.read("toefl_itp/mocktest/sets_v2/one"), null);
    assert.equal(db.read("toefl_itp/mocktest/sets_v2/two/setId"), "two");
    assert.equal(db.read("toefl_itp/mocktest/drafts_v2/two/passages/1/passage"), "keep active");
    assert.equal(db.read("toefl_itp/archive/mocktest/drafts/one/parts/1/questions"), "keep in archive");
    assert.ok(db.calls.filter((call) => call.method === "PUT").every((call) =>
        !["toefl_itp/mocktest/sets_v2", "toefl_itp/mocktest/drafts_v2"].includes(call.key)));
});

test("TOEFL network failure returns a local-only draft result", async () => {
    const db = database();
    db.failNetwork();
    const { storage, local } = fixture(db, true);
    assert.equal(await storage.saveDraftBySetIdAndType("one", "reading", { passages: { 1: { passage: "offline" } } }), false);
    assert.match(storage.getLastStorageError(), /Network unavailable/);
    assert.equal(JSON.parse(local.get(storage._mockTestDraftsLocalKey)).one.passages[1].passage, "offline");
});

test("TOEFL refuses unsafe writes when Firebase does not supply an ETag", async () => {
    const { storage } = fixture(database(), true);
    let writes = 0;
    storage._request = async (url, options) => {
        if (options.method === "PUT") writes++;
        return { ok: true, headers: { get: () => null }, json: async () => null };
    };
    assert.equal(await storage.saveDraftBySetIdAndType("one", "reading", {}), false);
    assert.equal(writes, 0);
    assert.match(storage.getLastStorageError(), /revision/);
});

function loadPageFunction(context, source, name) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, `Missing ${name}`);
    const end = source.indexOf("\n        }", start) + "\n        }".length;
    vm.runInContext(source.slice(start, end), context);
}

test("listening save rejects resolved false and partial cloud saves before reporting success", async () => {
    const editor = fs.readFileSync(path.join(__dirname, "toefl-sample", "section 1.html"), "utf8");
    for (const draftSaved of [false, true]) {
        const local = new Map();
        const context = vm.createContext({
            console: { warn() {}, log() {} },
            document: { getElementById: () => null },
            localStorage: {
                getItem: (key) => local.get(key) || null,
                setItem: (key, value) => local.set(key, value)
            },
            DRAFT_KEY: "listening-draft", PARTS: [], forcedPracticePartId: null,
            MODULE_ID: "listening", currentSetId: "one", currentTestType: "mocktest",
            safeParse: (raw, fallback) => raw ? JSON.parse(raw) : fallback,
            parseAllListeningBulkExplanations: () => ({}),
            extractCloudflareSetId: (value) => value,
            normalizeDateKey: (value) => value,
            saveCompleteListeningDataToFirebase: async () => false,
            window: { toeflStorage: { saveDraftBySetIdAndType: async () => draftSaved } },
            toeflStorage: { saveDraftBySetIdAndType: async () => draftSaved }
        });
        loadPageFunction(context, editor, "saveSectionDraft");
        await assert.rejects(context.saveSectionDraft(), draftSaved ? /not fully saved/ : /Cloud draft save failed/);
        assert.ok(local.get("listening-draft"));
    }
});

test("review explanation queue propagates false rather than claiming a successful save", async () => {
    const review = fs.readFileSync(path.join(__dirname, "toefl-sample", "section 1-answered.html"), "utf8");
    const context = vm.createContext({
        console: { warn() {} }, reviewSetId: "one",
        reviewResultData: { questions: [{ number: 1 }] },
        inferPartIdFromQuestion: () => 1, getReviewTestType: () => "mocktest",
        reviewExplanationWriteQueue: Promise.resolve(),
        window: { toeflStorage: {
            getDraftBySetIdAndType: async () => ({ parts: { 1: {} } }),
            saveDraftBySetIdAndType: async () => false
        } }
    });
    loadPageFunction(context, review, "queueExplanationFirebaseWrite");
    assert.equal(await context.queueExplanationFirebaseWrite(1, { explanation: "Edited" }), false);
});

test("all three section metadata saves preserve local edits and propagate cloud failures", async () => {
    for (const section of [1, 2, 3]) {
        const source = fs.readFileSync(path.join(__dirname, "toefl-sample", `section ${section}.html`), "utf8");
        let savedLocally = false;
        const context = vm.createContext({
            console: { warn() {} },
            document: { getElementById: () => ({ value: "2026-11-03" }) },
            currentTestType: "mocktest", MODULE_ID: "reading", MODULE_LABEL: "Reading",
            forcedPracticePartId: null,
            normalizeDateKey: (value) => value,
            ensureCurrentSetId: async () => "one",
            createCloudAudioFolderForCurrentSet: async () => "https://audio.example/one/",
            getRequestedPracticePackage: () => 0,
            getPracticeVariant: () => ({ focus: "" }),
            updateHeaderPackageLabel: () => {},
            upsertLocalRecord: () => { savedLocally = true; },
            window: { toeflStorage: { upsertSetRecordWithType() {} } },
            toeflStorage: { upsertSetRecordWithType: async () => { throw new Error("Firebase denied write"); } }
        });
        loadPageFunction(context, source, "saveSectionMeta");
        await assert.rejects(context.saveSectionMeta(), /Firebase denied write/);
        assert.equal(savedLocally, true);
    }
});
