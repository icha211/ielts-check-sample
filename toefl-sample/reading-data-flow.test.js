const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const editor = fs.readFileSync(path.join(__dirname, "section 3.html"), "utf8");
const review = fs.readFileSync(path.join(__dirname, "section 3-answered.html"), "utf8");
const explanations = fs.readFileSync(path.join(__dirname, "js", "reading-explanations.js"), "utf8");

function loadFunction(context, source, name) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, `Missing ${name}`);
    const end = source.indexOf("\n        }", start) + "\n        }".length;
    vm.runInContext(source.slice(start, end), context);
}

function fixture(search = "?testType=practicetest&package=2&new=1") {
    const local = new Map();
    const elements = new Map();
    [
        "input-title-1", "input-passage-1", "input-magic-questions-1",
        "input-answer-key-1", "input-bulk-explanation-id-all",
        "input-bulk-explanation-en-all", "set-date"
    ].forEach((id) => elements.set(id, { value: "", dataset: {} }));
    const window = { location: { search } };
    const context = vm.createContext({
        window, console, URLSearchParams,
        document: { getElementById: (id) => elements.get(id) || null },
        localStorage: {
            getItem: (key) => local.get(key) || null,
            setItem: (key, value) => local.set(key, value)
        },
        TOTAL_PASSAGES: 5, forcedReadingPartsCount: 1,
        DRAFT_KEY: "latest-draft", MODULE_ID: "reading",
        currentTestType: "practicetest", currentSetId: "",
        activeSectionDraft: {},
        isDeveloperMode: () => true,
        resolveSetRecordByDate: async () => ({ setId: "old-test" }),
        getPracticeVariant: () => ({ difficulty: "beginner", slug: "beginner" })
    });
    vm.runInContext(explanations, context);
    context.readingExplanations = window.readingExplanations;
    for (const name of [
        "safeParse", "isExplicitNewPackageRequest", "clearSectionDraftInputs",
        "getBulkPassageRange", "getBulkPassageSection", "mergeBulkPassageSection",
        "scopePracticeExplanationInputs", "ensureCurrentSetId",
        "saveSectionDraft", "loadSectionDraft", "parseAllBulkExplanations"
    ]) loadFunction(context, editor, name);
    return { context, window, local, elements };
}

test("both Section 3 pages have valid inline JavaScript", () => {
    for (const html of [editor, review]) {
        for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
            new vm.Script(match[1]);
        }
    }
});

test("bulk parser supports passage headings, question-only practice input, and numeric legacy input", () => {
    const { context } = fixture();
    const parse = context.readingExplanations.parseAll;
    assert.equal(parse("**Question 1**\n- **Reason:** Current explanation")["1_1"], "- **Reason:** Current explanation");
    const parsed = parse("Passage 1\nQuestion 1\nFirst\n\n**Passage 2**\n**Question 11**\nSecond");
    assert.equal(parsed["1_1"], "First");
    assert.equal(parsed["2_11"], "Second");
    assert.equal(parse("1. Legacy reason\ncontinued")["1_1"], "Legacy reason\ncontinued");
});

test("existing optional explanations migrate into bulk without overriding new bulk text", () => {
    const { context } = fixture();
    const text = context.readingExplanations.getDraftBulkText({
        passages: { 1: { explanation: "1. Older\n2. Keep me" } },
        bulkExplanationId: "Passage 1\nQuestion 1\nNewer"
    }, "id");
    const parsed = context.readingExplanations.parseAll(text);
    assert.equal(parsed["1_1"], "Newer");
    assert.equal(parsed["1_2"], "Keep me");
});

test("new test ignores shared latest draft and does not reuse an existing test id", async () => {
    const { context, window, local, elements } = fixture();
    local.set("latest-draft", JSON.stringify({
        passages: { 1: { passage: "Old test passage" } },
        bulkExplanationId: "Passage 1\nQuestion 1\nOld explanation\nPassage 2\nQuestion 11\nForeign data"
    }));
    window.toeflStorage = {
        createSetId: () => "new-test",
        saveDraftBySetIdAndType: async (id, module, draft, type) => {
            assert.equal(id, "new-test");
            assert.equal(type, "practicetest");
            assert.equal(draft.bulkExplanationId, "");
            assert.equal(draft.passages[1].passage, "");
            return true;
        }
    };
    context.toeflStorage = window.toeflStorage;
    await context.loadSectionDraft();
    assert.equal(elements.get("input-passage-1").value, "");
    await context.saveSectionDraft();
    assert.equal(context.currentSetId, "new-test");
    assert.ok(local.has("latest-draft_new-test"));
    assert.ok(local.get("latest-draft").includes("Old test passage"));
});

test("Firebase null passage gaps restore bulk explanations and allow Save & Update", async () => {
    for (const passages of [
        [null, { passage: "Saved passage", explanation: "1. Legacy reason", bulkExplanationEn: "Question 1\nEnglish reason" }, null],
        { 1: { passage: "Saved passage", explanation: "1. Legacy reason", bulkExplanationEn: "Question 1\nEnglish reason" }, 2: null }
    ]) {
        const { context, window, elements } = fixture("?testType=practicetest&setId=selected");
        context.currentSetId = "selected";
        const writes = [];
        window.toeflStorage = {
            isRemoteAvailable: true,
            getDraftBySetIdAndType: async () => ({ setId: "selected", testType: "practicetest", passages }),
            saveDraftBySetIdAndType: async (id, module, draft, type) => {
                writes.push({ id, module, draft, type });
                return true;
            }
        };
        context.toeflStorage = window.toeflStorage;
        await context.loadSectionDraft();
        assert.equal(elements.get("input-passage-1").value, "Saved passage");
        assert.equal(context.readingExplanations.parseAll(elements.get("input-bulk-explanation-id-all").value)["1_1"], "Legacy reason");
        assert.equal(context.readingExplanations.parseAll(elements.get("input-bulk-explanation-en-all").value)["1_1"], "English reason");
        context.sectionReady = true;
        context.sectionSaveQueue = Promise.resolve();
        context.clearTimeout = () => {};
        context.autoSaveTimeout = null;
        context.saveSectionMeta = async () => {};
        context.updateUserView = () => {};
        context.showAutoSaveStatus = () => {};
        loadFunction(context, editor, "queueSectionSave");
        loadFunction(context, editor, "saveAndUpdateUserView");
        elements.get("input-bulk-explanation-id-all").value = "Question 1\nUpdated reason";
        const button = { disabled: false };
        await context.saveAndUpdateUserView(button);
        assert.equal(button.disabled, false);
        assert.equal(writes.length, 1);
        assert.equal(writes[0].id, "selected");
        assert.equal(writes[0].type, "practicetest");
        assert.equal(writes[0].draft.passages[1].passage, "Saved passage");
        assert.equal(context.readingExplanations.parseAll(writes[0].draft.bulkExplanationId)["1_1"], "Updated reason");
    }
});

test("missing remote draft stays blank rather than importing stale local drafts", async () => {
    const { context, window, local, elements } = fixture("?testType=practicetest&setId=selected");
    context.currentSetId = "selected";
    elements.get("input-passage-1").value = "Previous screen content";
    local.set("latest-draft_selected", JSON.stringify({ passages: { 1: { passage: "Deleted data" } } }));
    local.set("latest-draft", JSON.stringify({ passages: { 1: { passage: "Another test" } } }));
    window.toeflStorage = { isRemoteAvailable: true, getDraftBySetIdAndType: async () => ({}) };
    context.toeflStorage = window.toeflStorage;
    await context.loadSectionDraft();
    assert.equal(elements.get("input-passage-1").value, "");
    assert.equal(Object.keys(context.activeSectionDraft).length, 0);
});

test("saving, updating, and clearing bulk explanations affects only the selected test", async () => {
    const { context, window, elements } = fixture("?testType=practicetest&setId=selected");
    context.currentSetId = "selected";
    const saved = [];
    window.toeflStorage = {
        isRemoteAvailable: true,
        getDraftBySetIdAndType: async () => ({
            passages: { 1: { passage: "Own passage", explanation: "1. Legacy explanation" } },
            bulkExplanationId: "Passage 1\nQuestion 1\nOriginal"
        }),
        saveDraftBySetIdAndType: async (id, module, draft) => { saved.push(draft); return true; }
    };
    context.toeflStorage = window.toeflStorage;
    await context.loadSectionDraft();
    elements.get("input-bulk-explanation-id-all").value = "Question 1\nUpdated";
    await context.saveSectionDraft();
    assert.equal(context.parseAllBulkExplanations(saved[0].bulkExplanationId)["1_1"], "Updated");
    assert.equal(saved[0].passages[1].explanation, "");
    elements.get("input-bulk-explanation-id-all").value = "";
    await context.saveSectionDraft();
    assert.equal(saved[1].bulkExplanationId, "");
    assert.equal(context.readingExplanations.getDraftBulkText(saved[1], "id"), "");
});

test("review hydration uses routed draft and never another test's answers or sample data", async () => {
    for (const source of [editor, review]) {
        const { context, window } = fixture("?setId=current&testType=practicetest");
        for (const name of [
            "parseReadingDraftQuestions", "parseReadingAnswerKey",
            "parseReadingBulkExplanations", "parseAllReadingBulkExplanations",
            "hydrateReviewFromFirebase"
        ]) loadFunction(context, source, name);
        let draft = {
            passages: { 1: { passage: "Current passage", questions: "1. Current question\nA. One\nB. Two", answerKey: "1. a" } },
            bulkExplanationId: "Question 1\nCurrent explanation"
        };
        window.toeflStorage = { getDraftBySetIdAndType: async () => draft };
        const previous = { setId: "other", testType: "practicetest", questions: [{ passageId: 1, number: 1, userAnswer: "b" }] };
        const result = await context.hydrateReviewFromFirebase(previous);
        assert.equal(result.setId, "current");
        assert.equal(result.questions[0].explanation, "Current explanation");
        assert.equal(result.questions[0].userAnswer, "");
        draft.bulkExplanationId = "Question 1\nRealtime update";
        const updated = await context.hydrateReviewFromFirebase(result);
        assert.equal(updated.questions[0].explanation, "Realtime update");
        draft = {};
        assert.equal(await context.hydrateReviewFromFirebase(previous), null);
        assert.ok(!source.includes("            applyOctoberFirstSample(result);"));
        assert.ok(!source.includes("            ensureQuestionOneFallback(reviewResultData);"));
    }
});

test("save requests are serialized and the review route drops the new-test flag", async () => {
    const { context, window } = fixture();
    context.sectionReady = true;
    context.autoSaveTimeout = null;
    context.clearTimeout = () => {};
    context.showAutoSaveStatus = () => {};
    context.sectionSaveQueue = Promise.resolve();
    const calls = [];
    let finishFirst;
    context.saveSectionMeta = async () => {
        calls.push("meta");
        if (calls.length === 1) await new Promise((resolve) => { finishFirst = resolve; });
    };
    context.saveSectionDraft = async () => { calls.push("draft"); return true; };
    loadFunction(context, editor, "queueSectionSave");
    const first = context.queueSectionSave();
    const second = context.queueSectionSave();
    await Promise.resolve();
    assert.deepEqual(calls, ["meta"]);
    finishFirst();
    await Promise.all([first, second]);
    assert.deepEqual(calls, ["meta", "draft", "meta", "draft"]);

    window.location.pathname = "/section 3.html";
    window.location.hash = "#dev-view";
    let url;
    window.history = { replaceState: (state, title, value) => { url = value; } };
    context.updateReviewLink = () => {};
    loadFunction(context, editor, "updateEditorUrl");
    context.updateEditorUrl("selected", "");
    assert.ok(url.includes("setId=selected"));
    assert.ok(url.includes("package=2"));
    assert.ok(!url.includes("new=1"));
});

test("autosave reports local-only failure instead of cloud success", async () => {
    const { context } = fixture();
    const statuses = [];
    context.queueSectionSave = async () => false;
    context.updateUserView = () => {};
    context.showAutoSaveStatus = (...args) => statuses.push(args);
    loadFunction(context, editor, "performAutoSave");
    await context.performAutoSave();
    assert.deepEqual(statuses[0], ["Saved locally; Firebase unavailable", false]);
});
