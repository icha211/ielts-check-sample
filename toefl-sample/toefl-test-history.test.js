const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "toefl-test-history.js"), "utf8")
    .replace(/\bimport\(/g, "loadModule(");
const prefix = "toefl_test_history_v1_";
const flush = () => new Promise((resolve) => setImmediate(resolve));

function backend() {
    return { records: new Map(), writes: [], listeners: new Set(), write: null };
}

function fixture({ uid = "learner-a", search = "?testType=mocktest&fullTest=true", local = new Map(), cloud = backend(), deferAuth = false } = {}) {
    const listeners = new Map();
    const messages = [];
    const timers = new Map();
    let timerId = 0;
    let authCallback;
    const window = {
        location: { search },
        addEventListener(name, callback) {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name).add(callback);
        },
        removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
        dispatchEvent(event) { listeners.get(event.type)?.forEach((callback) => callback(event)); }
    };
    const storage = {
        getItem: (key) => local.get(key) || null,
        setItem: (key, value) => local.set(key, value),
        removeItem: (key) => local.delete(key)
    };
    const snapshot = (historyPath) => ({
        val: () => Object.fromEntries([...cloud.records.entries()]
            .filter(([key]) => key.startsWith(`${historyPath}/`))
            .map(([key, value]) => [key.slice(historyPath.length + 1), value]))
    });
    const databaseSdk = {
        ref: (_, value) => value,
        onValue(historyPath, callback, onError) {
            const listener = { historyPath, callback, onError };
            cloud.listeners.add(listener);
            queueMicrotask(() => {
                if (cloud.listeners.has(listener)) callback(snapshot(historyPath));
            });
            return () => cloud.listeners.delete(listener);
        },
        async set(recordPath, value) {
            const saved = JSON.parse(JSON.stringify(value));
            cloud.writes.push({ path: recordPath, value: saved });
            if (cloud.write) await cloud.write(recordPath, saved);
            cloud.records.set(recordPath, saved);
            cloud.listeners.forEach((listener) => listener.callback(snapshot(listener.historyPath)));
        }
    };
    const context = vm.createContext({
        window, localStorage: storage, URLSearchParams,
        setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
        clearTimeout(id) { timers.delete(id); },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        console: {
            error: (...args) => messages.push(args),
            warn: (...args) => messages.push(args)
        },
        loadModule: async (specifier) => {
            if (specifier.includes("firebase-config")) return { auth: {}, db: {} };
            if (specifier.includes("firebase-auth")) return {
                onAuthStateChanged(_, callback) {
                    authCallback = callback;
                    if (!deferAuth) queueMicrotask(() => callback(uid ? { uid } : null));
                }
            };
            return databaseSdk;
        }
    });
    vm.runInContext(source, context);
    return {
        api: window.toeflTestHistory, window, local, cloud, messages,
        async ready() { await flush(); await flush(); },
        auth(nextUid) { authCallback(nextUid ? { uid: nextUid } : null); },
        expireTimers() { [...timers.values()].forEach((callback) => callback()); timers.clear(); },
        snapshot
    };
}

function result(sectionKey, overrides = {}) {
    return {
        sectionKey, testType: "mocktest", setId: `mock-${sectionKey}`,
        setDate: "2026-10-28", rawScore: 1, totalQuestions: sectionKey === "structure" ? 40 : 50,
        scaledScore: 31, questions: [{ number: 1, questionText: "Saved question", userAnswer: "a" }],
        ...overrides
    };
}

test("three full-mock sections form one completed test, not three attempts", async () => {
    const cloud = backend();
    const local = new Map();
    const listening = fixture({ cloud, local });
    await listening.ready();
    const first = await listening.api.record(result("listening"));
    assert.equal(listening.api.readHistoryEntries()[0].status, "in-progress");
    const search = `?testType=mocktest&fullTest=true&mockSessionId=${first.mockSessionId}`;
    for (const section of ["structure", "reading"]) {
        const page = fixture({ cloud, local, search });
        await page.ready();
        await page.api.record(result(section));
        if (section === "reading") {
            const entries = page.api.readHistoryEntries();
            assert.equal(entries.length, 1);
            assert.equal(entries[0].status, "completed");
            assert.equal(entries[0].rawScore, 3);
            assert.equal(entries[0].totalQuestions, 140);
            assert.equal(entries[0].scaledScore, 310);
            assert.equal(page.api.readAttempts().length, 3);
        }
    }
    assert.equal(cloud.records.size, 3);
});

test("the real submit handlers carry one session through Listening, Structure, Reading and the summary", async () => {
    const cloud = backend();
    const local = new Map();
    let search = "?testType=mocktest&fullTest=true&setId=mock-listening&setDate=2026-10-28";
    let sessionId;
    for (const [index, sectionKey] of ["listening", "structure", "reading"].entries()) {
        const page = fixture({ cloud, local, search });
        await page.ready();
        const html = fs.readFileSync(path.join(__dirname, `section ${index + 1}.html`), "utf8");
        const start = html.indexOf("        async function submitAnswers(");
        const end = html.indexOf("\n        function startTimer(", start);
        const context = vm.createContext({
            window: page.window, URLSearchParams, console,
            localStorage: {
                getItem: (key) => local.get(key) || null,
                setItem: (key, value) => local.set(key, value)
            },
            document: {
                getElementById: (id) => id === "set-date" ? { value: "2026-10-28" } : null,
                querySelector: (selector) => selector.startsWith("input[") ? { value: "a" } : null
            },
            globalAnswerKey: { "1_1": "a" },
            globalQuestions: { "1_1": { questionText: "Question", options: { A: "Answer" } } },
            globalExplanations: {}, globalEnglishExplanations: {}, globalPassages: {},
            currentSetId: `mock-${sectionKey}`, currentTestType: "mocktest", currentPackageDate: "2026-10-28",
            timerInterval: null, clearInterval() {}, confirm: () => true,
            isPracticeTestType: () => false, isInstantFeedbackMode: () => false,
            getPracticeRunMode: () => "full", getSection2PracticeRunMode: () => "full",
            getPracticeVariant: () => ({ focus: "" }),
            getNextSectionSetId: async (_, key) => `mock-${key}`,
            parseIndexedLineMap: () => ({}), getSection2ExplanationSource: () => "",
            safeParse: (value, fallback) => value ? JSON.parse(value) : fallback,
            DRAFT_KEY: "unused-draft", PARTS: [{ id: 1, name: "Part A" }],
            getTranscriptForSmartQuestions: () => "", mapTranscriptByQuestion: () => ({}),
            resolveExplanationAudioRecord: () => null, resolveGroupTranscriptSegments: () => [],
            selectGroupTranscriptSegments: (segments) => segments
        });
        assert.ok(start >= 0 && end > start);
        vm.runInContext(html.slice(start, end), context);
        await context.submitAnswers();
        const destination = new URL(page.window.location.href, "https://example.test/");
        sessionId ||= destination.searchParams.get("mockSessionId");
        assert.ok(sessionId);
        assert.equal(destination.searchParams.get("mockSessionId"), sessionId);
        assert.equal(JSON.parse(local.get(`toefl_section${index + 1}_result`)).mockSessionId, sessionId);
        search = destination.search;
        if (sectionKey === "reading") {
            assert.equal(destination.pathname, "/full-test-summary.html");
            assert.equal(page.api.readHistoryEntries().length, 1);
            assert.equal(page.api.readHistoryEntries()[0].status, "completed");
        }
    }
});

test("repeated submission of the same section is idempotent", async () => {
    const page = fixture();
    await page.ready();
    const [first, repeated] = await Promise.all([
        page.api.record(result("listening")), page.api.record(result("listening"))
    ]);
    assert.equal(first.id, repeated.id);
    assert.equal(page.cloud.writes.length, 1);
    assert.equal(page.api.readAttempts().length, 1);
    assert.equal(page.api.readHistoryEntries().length, 1);
});

test("retakes with a fresh session stay separate even for the same set and date", async () => {
    const cloud = backend();
    for (const session of ["first-test", "second-test"]) {
        const page = fixture({ cloud, search: `?testType=mocktest&fullTest=true&mockSessionId=${session}` });
        await page.ready();
        await page.api.record(result("listening"));
    }
    const history = fixture({ cloud });
    await history.ready();
    assert.equal(history.api.readHistoryEntries().length, 2);
});

test("practice submissions and standalone mock sections are not grouped into full mocks", async () => {
    for (const testType of ["mocktest", "practicetest"]) {
        const cloud = backend();
        for (let index = 0; index < 2; index += 1) {
            const page = fixture({ cloud, search: `?testType=${testType}` });
            await page.ready();
            await page.api.record(result("reading", { testType }));
        }
        const history = fixture({ cloud });
        await history.ready();
        assert.equal(history.api.readHistoryEntries().length, 2);
        assert.ok(history.api.readHistoryEntries().every((entry) => entry.entryKind === "section"));
    }
});

test("older section records are preserved without guessing sessions or re-uploading guest history", async () => {
    const old = ["listening", "listening", "structure", "reading"].map((section, index) => ({
        ...result(section), id: `old-${index}`, recordedAt: `2026-10-28T13:1${index}:00Z`
    }));
    const local = new Map([[`${prefix}this-browser`, JSON.stringify(old)]]);
    const cloud = backend();
    old.forEach((attempt) => cloud.records.set(`user_test_history/learner-a/${attempt.id}`, attempt));
    const history = fixture({ local, cloud });
    await history.ready();
    assert.equal(history.api.readHistoryEntries().length, 4);
    assert.ok(history.api.readHistoryEntries().every((entry) => entry.entryKind === "section"));
    assert.equal(cloud.writes.length, 0);
    assert.equal(JSON.parse(local.get(`${prefix}this-browser`)).length, 4);
});

test("authentication resolves before selecting the attempt owner and guests never flash during loading", async () => {
    const guest = { ...result("reading"), id: "guest-result" };
    const local = new Map([[`${prefix}this-browser`, JSON.stringify([guest])]]);
    const page = fixture({ deferAuth: true, local });
    assert.equal(page.api.readAttempts().length, 0);
    const saved = page.api.record(result("listening"));
    await page.ready();
    assert.equal(page.cloud.writes.length, 0);
    page.auth("learner-a");
    await saved;
    assert.ok(page.cloud.writes.every((write) => write.path.startsWith("user_test_history/learner-a/")));
    assert.equal(JSON.parse(local.get(`${prefix}this-browser`)).length, 1);
    assert.ok(!page.api.readAttempts().some((attempt) => attempt.id === "guest-result"));
});

test("signed-out attempts remain local after a different account signs in", async () => {
    const page = fixture({ uid: null });
    await page.ready();
    await page.api.record(result("listening"));
    assert.equal(page.api.readAttempts().length, 1);
    page.auth("learner-b");
    await page.ready();
    assert.equal(page.api.readAttempts().length, 0);
    assert.equal(page.cloud.writes.length, 0);
    assert.equal(JSON.parse(page.local.get(`${prefix}this-browser`)).length, 1);
});

test("account switches ignore stale listeners and write acknowledgements", async () => {
    const page = fixture();
    await page.ready();
    const staleListener = [...page.cloud.listeners][0];
    let release;
    page.cloud.write = () => new Promise((resolve) => { release = resolve; });
    const pending = page.api.record(result("listening"));
    await flush();
    page.auth("learner-b");
    await page.ready();
    staleListener.callback({ val: () => ({ foreign: { ...result("reading"), id: "foreign" } }) });
    release();
    await pending;
    assert.equal(page.api.readAttempts().length, 0);
    assert.ok(!page.local.has(`${prefix}learner-b`) || JSON.parse(page.local.get(`${prefix}learner-b`)).length === 0);
    assert.ok(page.cloud.writes.every((write) => write.path.startsWith("user_test_history/learner-a/")));
});

test("failed writes retain full pending details and retry only for the owning UID", async () => {
    const cloud = backend();
    cloud.write = async () => { throw new Error("permission-denied"); };
    const page = fixture({ cloud });
    const statuses = [];
    page.api.subscribeSync((status) => statuses.push(status.state));
    await page.ready();
    const saved = await page.api.record(result("listening"));
    const cache = JSON.parse(page.local.get(`${prefix}learner-a`));
    assert.equal(cache[0].id, saved.id);
    assert.ok(cache[0].result);
    assert.ok(!cache[0].syncedAt);
    assert.equal(statuses.at(-1), "error");
    cloud.write = null;
    const other = fixture({ uid: "learner-b", cloud, local: page.local });
    await other.ready();
    assert.equal(other.api.readAttempts().length, 0);
    assert.equal(cloud.records.size, 0);
    const reopened = fixture({ cloud, local: page.local });
    await reopened.ready();
    assert.ok(cloud.records.has(`user_test_history/learner-a/${saved.id}`));
});

test("pending offline writes do not block finishing a section indefinitely", async () => {
    const page = fixture();
    await page.ready();
    let release;
    page.cloud.write = () => new Promise((resolve) => { release = resolve; });
    const statuses = [];
    page.api.subscribeSync((status) => statuses.push(status.state));
    const pending = page.api.record(result("listening"));
    await flush();
    page.expireTimers();
    const saved = await pending;
    assert.ok(saved.mockSessionId);
    assert.equal(statuses.at(-1), "error");
    const cached = JSON.parse(page.local.get(`${prefix}learner-a`))[0];
    assert.ok(cached.result);
    assert.ok(!cached.syncedAt);
    release();
    await page.ready();
    assert.equal(statuses.at(-1), "synced");
});

test("legacy local summaries cannot overwrite richer remote answers", async () => {
    const old = { ...result("reading"), id: "old-result", recordedAt: "2026-10-28T13:16:00Z" };
    const cloud = backend();
    cloud.records.set("user_test_history/learner-a/old-result", { ...old, result: result("reading") });
    const local = new Map([[`${prefix}learner-a`, JSON.stringify([old])]]);
    const page = fixture({ cloud, local });
    await page.ready();
    assert.ok(page.api.readAttempts()[0].result);
    assert.equal(cloud.writes.length, 0);
    page.api.restoreResults("old-result");
    assert.equal(JSON.parse(local.get("toefl_section3_result")).setId, "mock-reading");
});

test("realtime remote updates appear and View Result restores only selected saved answers", async () => {
    const page = fixture();
    await page.ready();
    page.local.set("toefl_section2_result", JSON.stringify(result("structure", { setId: "unrelated" })));
    const remote = { ...result("reading"), id: "remote-reading", recordedAt: "2026-10-28T13:20:00Z", result: result("reading") };
    page.cloud.records.set("user_test_history/learner-a/remote-reading", remote);
    const listener = [...page.cloud.listeners][0];
    listener.callback(page.snapshot(listener.historyPath));
    assert.equal(page.api.readAttempts().length, 1);
    page.api.restoreResults("remote-reading");
    assert.equal(page.local.get("toefl_section2_result"), undefined);
    assert.equal(JSON.parse(page.local.get("toefl_section3_result")).setId, "mock-reading");
    assert.throws(() => page.api.restoreResults("not-owned"), /unavailable/);
});

test("summary-only legacy results cannot open unrelated latest answers", async () => {
    const page = fixture();
    await page.ready();
    const old = { ...result("listening"), id: "old-summary", recordedAt: "2026-10-28T13:16:00Z" };
    page.cloud.records.set("user_test_history/learner-a/old-summary", old);
    const listener = [...page.cloud.listeners][0];
    listener.callback(page.snapshot(listener.historyPath));
    assert.throws(() => page.api.restoreResults("old-summary"), /unavailable/);
});

function renderHistory(entries) {
    const nodes = new Map();
    const document = {
        getElementById(id) {
            if (!nodes.has(id)) nodes.set(id, {
                innerHTML: "", textContent: "", value: "", dataset: {},
                addEventListener() {}
            });
            return nodes.get(id);
        },
        querySelectorAll: () => [],
        addEventListener() {}
    };
    const html = fs.readFileSync(path.join(__dirname, "history.html"), "utf8");
    const script = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
        .find((match) => !/\bsrc\s*=/.test(match[1]))[2];
    vm.runInNewContext(script, {
        document, URLSearchParams, console,
        window: {
            toeflTestHistory: {
                readHistoryEntries: () => entries,
                subscribe() {},
                subscribeSync() {}
            }
        }
    });
    return nodes;
}

test("history labels legacy rows as section results and numbers a full mock only once", () => {
    const legacy = ["listening", "listening", "structure", "reading"].map((section, index) => ({
        ...result(section), id: `old-${index}`, entryKind: "section", recordedAt: "2026-10-28T13:18:00Z"
    }));
    const full = {
        ...result(""), id: "full-session", mockSessionId: "full-session", schemaVersion: 2,
        entryKind: "full-mock", status: "completed", scaledScore: 310,
        sectionTitle: "Listening, Structure & Reading", recordedAt: "2026-10-28T14:00:00Z",
        sectionAttempts: ["listening", "structure", "reading"].map((section) => ({ ...result(section), result: result(section) }))
    };
    const nodes = renderHistory([full, ...legacy]);
    const cards = nodes.get("attemptList").innerHTML;
    assert.match(cards, /Mock Test - 01/);
    assert.doesNotMatch(cards, /Mock Test - 05/);
    assert.equal((cards.match(/Earlier Section Result/g) || []).length, 4);
    assert.equal(nodes.get("mockCount").textContent, "1 test, 4 sections");
    assert.match(nodes.get("pagination").innerHTML, /1 mock test, 4 section results/);
    assert.match(cards, /mockSessionId=full-session/);
    assert.match(cards, /setId=mock-listening[^"]*fullTest=true/);
    assert.equal((cards.match(/Details unavailable/g) || []).length, 4);
    assert.match(cards, /TOEFL Score/);
});

test("a full mock with only one submitted section is not displayed as completed", () => {
    const entry = {
        ...result(""), id: "partial", mockSessionId: "partial", entryKind: "full-mock",
        status: "in-progress", sectionAttempts: [{ ...result("listening"), result: result("listening") }]
    };
    const cards = renderHistory([entry]).get("attemptList").innerHTML;
    assert.match(cards, /In progress/);
    assert.doesNotMatch(cards, />Completed</);
    assert.doesNotMatch(cards, /TOEFL Score/);
});

test("dashboard counts completed sessions rather than section records and ignores shared result caches", () => {
    const nodes = new Map();
    const sections = ["listening", "structure", "reading"].map((key) => result(key));
    const entries = [{
        entryKind: "full-mock", status: "completed", testType: "mocktest", sectionAttempts: sections
    }, {
        entryKind: "section", status: "completed", testType: "mocktest"
    }, {
        entryKind: "full-mock", status: "in-progress", testType: "mocktest"
    }];
    const document = {
        querySelector(selector) {
            if (!nodes.has(selector)) nodes.set(selector, { textContent: "", style: {}, setAttribute() {} });
            return nodes.get(selector);
        },
        querySelectorAll: () => [],
        addEventListener() {}
    };
    const history = {
        readAttempts: () => sections,
        readHistoryEntries: () => entries,
        subscribe() {}
    };
    const code = fs.readFileSync(path.join(__dirname, "toefl-dashboard-overview.js"), "utf8");
    vm.runInNewContext(code, {
        document, console,
        window: { toeflTestHistory: history, addEventListener() {} },
        localStorage: { getItem() { throw new Error("Unscoped result cache must not be used"); } }
    });
    assert.equal(nodes.get('[data-dashboard-stat="mock-count"]').textContent, "1");
    assert.equal(nodes.get("#scoreText").textContent, "310");
});
