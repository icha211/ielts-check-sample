// Developer Dashboard JavaScript

let currentTestType = "mocktest"; // Track current test type (mocktest or practicetest)

const SETS_KEY = "toefl_developer_sets_v1";
const SETS_KEY_V2 = "toefl_developer_sets_v2";
const MODULE_CONFIG = {
    listening: {
        editorPage: "section 1.html",
        createPage: "section 1.html?mode=dev#dev-view",
        icon: `<img src="../asset/icon/headset.png" style="width:18px;height:18px;vertical-align:middle;" alt="">`,
        label: "Listening"
    },
    structure: {
        editorPage: "section 2.html",
        createPage: "section 2.html?mode=dev#dev-view",
        icon: `<img src="../asset/icon/paper-pencil.png" style="width:18px;height:18px;vertical-align:middle;" alt="">`,
        label: "Structure"
    },
    reading: {
        editorPage: "section 3.html",
        createPage: "section 3.html?mode=dev#dev-view",
        icon: `<img src="../asset/icon/blue-book.png" style="width:18px;height:18px;vertical-align:middle;" alt="">`,
        label: "Reading"
    }
};
const MONTH_LABELS = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
const MODULES = ["listening", "structure", "reading"];
let sectionSets = [];
let pendingMaterialTopicId = "";
const MATERIALS_KEY = "toefl_structure_materials_v1";
const MATERIAL_TOPICS_KEY = "toefl_structure_material_topics_v1";
const HIDDEN_MATERIAL_TOPICS_KEY = "toefl_hidden_material_topics_v1";
const MATERIALS_VIEW_KEY = "toefl_materials_library_view";
const MATERIALS_DOCUMENT_URL = "https://docs.google.com/document/d/1PQuVZWtVnbyMgbLvXC6YosOxuP76ZQjS/edit";
const DEFAULT_MATERIAL_TOPICS = [
    ["Module 1", "Sentence Foundation (Core Structure)", "fwm0htce4hfj", [
        ["1.1", "Missing Subjects & Verbs", "tk90kv3d0ueb"], ["1.2", "Appositives (Noun Phrase Distractors)", "v29ynt82k1nw"], ["1.3", "Present Participles (-ing) vs. Past Participles (-ed)", "n6szn2voai93"], ["1.4", "Subject-Verb Agreement", "dqzite884zzv"], ["1.5", "Tricky Singular Subjects", "wb90rp7vdygw"]
    ]],
    ["Module 2", "Clauses & Connectors", "j0qsk030edq3", [
        ["2.1", "Coordinate Connectors", "cgt876hy0b25"], ["2.2", "Adverb Clauses", "ixdl2ewgupy7"], ["2.3", "Noun Clauses", "sx8pexlpcwri"], ["2.4", "Adjective/Relative Clauses", "nlqj805otend"], ["2.5", "Reduced Clauses", "xyftgejmqlep"]
    ]],
    ["Module 3", "Advanced Verb Mechanics", "rozbt4lm6qmd", [
        ["3.1", "Causative Verbs", "uuk2pgvcuuy0"], ["3.2", "Active vs. Passive Voice", "m76zs4iiu06f"], ["3.3", "Modals + Base Verbs", "ne680slyfgsj"], ["3.4", "Infinitives vs. Gerunds", "qsfbphukh19x"], ["3.5", "Time Markers & Tenses", "cr94bxy4gp3w"]
    ]],
    ["Module 4", "Word Order & Inversion", "majq7kkgj0fj", [
        ["4.1", "Inversion with Negatives", "91vyvha3q9ri"], ["4.2", "Inversion with Place Expressions", "aog5t6z8pyry"], ["4.3", "Inversion in Conditionals", "t1thd5omst7y"]
    ]],
    ["Module 5", "Parallelism & Comparisons", "s7nigh578i8l", [
        ["5.1", "Parallel Structure", "yerjaseu1sl6"], ["5.2", "Paired Conjunctions", "trypm2ym2qs3"], ["5.3", "Comparatives & Superlatives", "atrtn1zfpicv"], ["5.4", "Illogical Comparisons", "6gwyjzh4kxh5"]
    ]],
    ["Module 6", "Word Forms & Parts of Speech", "9nhfhs9olc45", [
        ["6.1", "Adjectives vs. Adverbs", "2vcjvcwg8nca"], ["6.2", "Noun Endings", "zaxuv4xr0cb7"], ["6.3", "Singular/Plural Countability", "va8hzv6k5kyc"], ["6.4", "Pronoun Agreement", "m45q6zxakv0u"]
    ]],
    ["Module 7", "Tricky Vocabulary & Idioms", "ua0o72t9yikl", [
        ["7.1", "Dependent Prepositions", "lsxm16xl0omv"], ["7.2", "Make vs. Do", "jfsedsc92pgo"], ["7.3", "Like, Alike, and Unlike", "axi3cpyqmu7e"], ["7.4", "Another, Other, Others", "zay714s3qunh"]
    ]]
];

// Create-modal options shown for Mock Test: one blank set per module, difficulty chosen inside the editor.
const MOCK_MODULE_OPTIONS = [
    { module: "listening", label: "Listening", icon: "headset.png" },
    { module: "structure", label: "Structure", icon: "paper-pencil.png" },
    { module: "reading", label: "Reading", icon: "blue-book.png" }
];

// Create-modal options shown for Practice Test: fixed 20-question presets per module/difficulty.
const PRACTICE_MODULE_OPTIONS = [
    { module: "listening", focus: "part1", label: "Listening - Part 1 (20 Qs)", icon: "headset.png" },
    { module: "listening", focus: "part2", label: "Listening - Part 2 (20 Qs)", icon: "headset.png" },
    { module: "listening", focus: "part3", label: "Listening - Part 3 (20 Qs)", icon: "headset.png" },
    { module: "structure", difficulty: "beginner", focus: "partA", label: "Structure - Beginner (Part A \u00b7 20 Qs)", icon: "paper-pencil.png" },
    { module: "structure", difficulty: "advanced", focus: "partA", label: "Structure - Advanced (Part A \u00b7 20 Qs)", icon: "paper-pencil.png" },
    { module: "structure", difficulty: "beginner", focus: "partB", label: "Writing - Beginner (Part B \u00b7 20 Qs)", icon: "paper-pencil.png" },
    { module: "structure", difficulty: "advanced", focus: "partB", label: "Writing - Advanced (Part B \u00b7 20 Qs)", icon: "paper-pencil.png" },
    { module: "reading", focus: "part1-2", label: "Reading - Part 1 & Part 2 (20 Qs each)", icon: "blue-book.png" }
];

const DIFFICULTY_LABELS = {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced"
};

function safeParse(raw, fallback) {
    try {
        return JSON.parse(raw) || fallback;
    } catch {
        return fallback;
    }
}

// deleteSetRecordWithType only prunes the test-type-scoped sets/drafts keys.
// These legacy/generic keys (written by the editor pages themselves, e.g.
// getStoredSetMap()/upsertLocalRecord() in section 1/2/3.html) are never
// pruned anywhere else, so a deleted set's data kept resurfacing whenever a
// brand new package was created for the same date.
function purgeLocalSetCaches(setId) {
    if (!setId) return;

    const setsMapKeys = [
        "toefl_developer_sets_v2",
        "toefl_developer_sets_v1",
        "toefl_developer_mocktest_sets_v2",
        "toefl_developer_practicetest_sets_v2"
    ];
    const draftsMapKeys = [
        "toefl_developer_drafts_v2",
        "toefl_developer_mocktest_drafts_v2",
        "toefl_developer_practicetest_drafts_v2"
    ];

    setsMapKeys.concat(draftsMapKeys).forEach((key) => {
        const map = safeParse(localStorage.getItem(key), {});
        if (!map || typeof map !== "object" || !(setId in map)) return;
        delete map[setId];
        localStorage.setItem(key, JSON.stringify(map));
    });
}

function normalizeDateKey(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "";
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function getMaterialRecords() {
    const saved = safeParse(localStorage.getItem(MATERIALS_KEY), {});
    return saved && typeof saved === "object" ? saved : {};
}

function getCustomMaterialTopics() {
    const saved = safeParse(localStorage.getItem(MATERIAL_TOPICS_KEY), []);
    return Array.isArray(saved) ? saved : [];
}

function getHiddenMaterialTopics() {
    const saved = safeParse(localStorage.getItem(HIDDEN_MATERIAL_TOPICS_KEY), []);
    return Array.isArray(saved) ? saved : [];
}

async function syncMaterialsLibraryToFirebase() {
    if (!window.toeflStorage || typeof window.toeflStorage.saveMaterialsLibrary !== "function") return;
    const saved = await window.toeflStorage.saveMaterialsLibrary({
        records: getMaterialRecords(),
        customTopics: getCustomMaterialTopics(),
        hiddenTopics: getHiddenMaterialTopics()
    });
    if (!saved) toast("Saved locally. Firebase sync will retry when online.");
    return saved;
}

async function loadMaterialsLibraryFromFirebase() {
    if (!window.toeflStorage || typeof window.toeflStorage.getMaterialsLibrary !== "function") return;
    const remote = await window.toeflStorage.getMaterialsLibrary();
    if (!remote || typeof remote !== "object") return;
    const hasRemoteData = (remote.records && Object.keys(remote.records).length > 0)
        || (Array.isArray(remote.customTopics) && remote.customTopics.length > 0);
    const hasLocalData = Object.keys(getMaterialRecords()).length > 0 || getCustomMaterialTopics().length > 0;
    if (!hasRemoteData && hasLocalData) {
        await syncMaterialsLibraryToFirebase();
        return;
    }
    if (remote.records && typeof remote.records === "object") localStorage.setItem(MATERIALS_KEY, JSON.stringify(remote.records));
    if (Array.isArray(remote.customTopics)) localStorage.setItem(MATERIAL_TOPICS_KEY, JSON.stringify(remote.customTopics));
    if (Array.isArray(remote.hiddenTopics)) localStorage.setItem(HIDDEN_MATERIAL_TOPICS_KEY, JSON.stringify(remote.hiddenTopics));
}

function materialTopicId(topic) {
    return `${topic.module}-${topic.code}`;
}

function getDefaultMaterialTopics() {
    const defaults = DEFAULT_MATERIAL_TOPICS.flatMap(([module, moduleTitle, moduleHeading, topics]) => topics.map(([code, title, heading]) => ({
        module, moduleTitle, moduleHeading, code, title, heading,
        defaultUrl: `${MATERIALS_DOCUMENT_URL}#heading=h.${heading}`
    })));
    const hiddenIds = getHiddenMaterialTopics();
    return defaults.concat(getCustomMaterialTopics())
        .filter((topic) => hiddenIds.indexOf(materialTopicId(topic)) === -1);
}

function renderMaterialsLibrary() {
    const list = document.getElementById("materialsLibraryList");
    const count = document.getElementById("materialsLibraryCount");
    const search = String((document.getElementById("materialsSearch") || {}).value || "").trim().toLowerCase();
    if (!list || !count) return;

    const topics = getDefaultMaterialTopics();
    const records = getMaterialRecords();
    count.textContent = `${topics.length} topics`;
    const visible = topics.filter((topic) => `${topic.module} ${topic.moduleTitle} ${topic.code} ${topic.title}`.toLowerCase().includes(search));
    list.innerHTML = visible.map((topic) => {
        const record = records[materialTopicId(topic)] || null;
        const topicId = materialTopicId(topic);
        const viewUrl = `material-preview.html?topic=${encodeURIComponent(topicId)}`;
        return `<article class="material-card">
            <div class="material-card__module">${escapeHtml(topic.module)}</div>
            <h3>${escapeHtml(topic.code)} ${escapeHtml(topic.title)}</h3>
            <p>${record ? escapeHtml(record.title) : "No uploaded lesson yet"}</p>
            <div class="material-card__actions">
                <a class="btn-mini open" href="${escapeHtml(viewUrl)}" target="_blank" rel="noopener">View Material</a>
                <button class="btn-mini edit" type="button" onclick="uploadMaterial('${escapeHtml(topicId)}')">${record ? "Replace" : "Upload"}</button>
                <button class="btn-mini delete" type="button" onclick="deleteMaterial('${escapeHtml(topicId)}')">Delete</button>
            </div>
        </article>`;
    }).join("") || '<div class="empty">No topics match this search.</div>';
}

function uploadMaterial(topicId) {
    const input = document.getElementById("materialDocumentInput");
    if (!input) return;
    pendingMaterialTopicId = topicId;
    input.value = "";
    input.click();
}

async function saveMaterialDocument(file) {
    if (!pendingMaterialTopicId || !file) return;
    if (!window.mammoth || typeof window.mammoth.convertToHtml !== "function") {
        toast("Document reader is unavailable. Check your internet connection and try again.");
        return;
    }
    if (file.size > 8 * 1024 * 1024) {
        toast("DOCX files must be 8 MB or smaller.");
        return;
    }
    try {
        const result = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        const html = String(result.value || "").trim();
        if (!html) throw new Error("The document has no readable text.");
        const records = getMaterialRecords();
        records[pendingMaterialTopicId] = {
            title: file.name.replace(/\.docx$/i, ""),
            html,
            fileName: file.name,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem(MATERIALS_KEY, JSON.stringify(records));
        renderMaterialsLibrary();
        await syncMaterialsLibraryToFirebase();
        toast("Material uploaded and extracted");
    } catch (error) {
        toast(error.message || "Unable to read this DOCX file.");
    } finally {
        pendingMaterialTopicId = "";
    }
}

function applyMaterialsView(view) {
    const selectedView = view === "list" ? "list" : "grid";
    const list = document.getElementById("materialsLibraryList");
    if (list) list.classList.toggle("list-view", selectedView === "list");
    document.querySelectorAll("#materialsViewToggle [data-materials-view]").forEach((button) => {
        const active = button.dataset.materialsView === selectedView;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
}

function deleteMaterial(topicId) {
    const records = getMaterialRecords();
    delete records[topicId];
    localStorage.setItem(MATERIALS_KEY, JSON.stringify(records));
    const hiddenTopics = safeParse(localStorage.getItem(HIDDEN_MATERIAL_TOPICS_KEY), []);
    const nextHiddenTopics = Array.isArray(hiddenTopics) ? hiddenTopics : [];
    if (nextHiddenTopics.indexOf(topicId) === -1) nextHiddenTopics.push(topicId);
    localStorage.setItem(HIDDEN_MATERIAL_TOPICS_KEY, JSON.stringify(nextHiddenTopics));
    renderMaterialsLibrary();
    syncMaterialsLibraryToFirebase();
    toast("Material removed from the library");
}

function readMaterialFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
        reader.readAsDataURL(file);
    });
}

function toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 2200);
}

function formatCompactSetDate(dateString) {
    const normalized = normalizeDateKey(dateString || "");
    if (!normalized) return "-";
    const parsed = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return "-";
    const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${String(parsed.getDate()).padStart(2, "0")} ${monthShort[parsed.getMonth()]} ${parsed.getFullYear()}`;
}

function normalizeSet(item, fallbackModule) {
    const moduleId = MODULE_CONFIG[item?.module] ? item.module : fallbackModule;
    if (!MODULE_CONFIG[moduleId]) return null;

    const setDate = /^\d{4}-\d{2}-\d{2}$/.test(String(item?.setDate || item?.date || ""))
        ? String(item?.setDate || item?.date)
        : "";
    const dateValue = setDate ? new Date(`${setDate}T00:00:00`) : null;
    const validDate = dateValue instanceof Date && !Number.isNaN(dateValue?.getTime?.());
    const difficultyKey = Object.prototype.hasOwnProperty.call(DIFFICULTY_LABELS, item?.difficulty)
        ? item.difficulty
        : "intermediate";

    return {
        setId: String(item?.setId || ""),
        module: moduleId,
        label: MODULE_CONFIG[moduleId].label,
        icon: MODULE_CONFIG[moduleId].icon,
        setDate,
        difficulty: difficultyKey,
        difficultyLabel: DIFFICULTY_LABELS[difficultyKey],
        updatedAt: String(item?.updatedAt || ""),
        year: validDate ? dateValue.getFullYear() : null,
        monthIndex: validDate ? dateValue.getMonth() : null,
        day: validDate ? dateValue.getDate() : null,
        displayDate: validDate
            ? `${String(dateValue.getDate()).padStart(2, "0")} ${MONTH_LABELS[dateValue.getMonth()]} ${dateValue.getFullYear()}`
            : "No date set"
    };
}

function normalizeSetsMapToList(raw) {
    const items = Array.isArray(raw)
        ? raw
        : Object.entries(raw || {})
            .filter(([key]) => key !== "_updatedAt")
            .map(([moduleOrSetId, value]) => ({ ...value, setId: value?.setId || moduleOrSetId, module: value?.module || moduleOrSetId }));
    return items
        .filter((item) => item && item.module && MODULE_CONFIG[item.module])
        .map((item) => normalizeSet(item, item?.module))
        .filter(Boolean)
        .sort((left, right) => {
            const tLeft = new Date(left.updatedAt || 0).getTime();
            const tRight = new Date(right.updatedAt || 0).getTime();
            return tRight - tLeft;
        });
}


function getStoredSets() {
    // Look for test-type-specific keys first
    const mockTestKey = "toefl_developer_mocktest_sets_v2";
    const practiceTestKey = "toefl_developer_practicetest_sets_v2";
    
    // Determine which key to look for based on current test type
    const typeSpecificKey = currentTestType === "practicetest" ? practiceTestKey : mockTestKey;
    
    // Try type-specific key first
    let parsed = safeParse(localStorage.getItem(typeSpecificKey), {});
    if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
        return normalizeSetsMapToList(parsed);
    }
    
    // Fall back to old v2 key for backward compatibility
    parsed = safeParse(localStorage.getItem(SETS_KEY_V2), {});
    if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
        return normalizeSetsMapToList(parsed);
    }
    
    // Fall back to v1 key
    parsed = safeParse(localStorage.getItem(SETS_KEY), {});
    return normalizeSetsMapToList(parsed);
}

async function loadSetsFromFirebase() {
    try {
        // Firebase is the source of truth: deletes remove records from both local storage and Firebase
        const records = await toeflStorage.getSetRecordsByTestType(currentTestType);
        updateSyncStatus(toeflStorage.online);
        return normalizeSetsMapToList(records);
    } catch (e) {
        updateSyncStatus(false);
        return getStoredSets();
    }
}

function hasMeaningfulDraftContent(moduleId, draft) {
    if (!draft || typeof draft !== "object") return false;

    if (moduleId === "reading") {
        const passages = draft.passages && typeof draft.passages === "object" ? draft.passages : {};
        return Object.values(passages).some((row) => {
            const title = String(row?.title || "").trim();
            const passage = String(row?.passage || "").trim();
            const questions = String(row?.questions || "").trim();
            const answerKey = String(row?.answerKey || "").trim();
            const explanation = String(row?.explanation || "").trim();
            return Boolean(title || passage || questions || answerKey || explanation);
        });
    }

    const parts = draft.parts && typeof draft.parts === "object" ? draft.parts : {};
    return Object.values(parts).some((row) => {
        const questions = String(row?.questions || "").trim();
        const answerKey = String(row?.answerKey || "").trim();
        const explanation = String(row?.explanation || "").trim();
        const transcript = String(row?.transcript || "").trim();
        const videoStep = String(row?.videoStep || "").trim();
        return Boolean(questions || answerKey || explanation || transcript || videoStep);
    });
}

async function filterSetsWithRealContent(records) {
    const list = Array.isArray(records) ? records : [];
    if (list.length === 0) return [];

    let audioIndexMap = {};
    if (window.toeflStorage && typeof toeflStorage.getAudioIndexMap === "function") {
        try {
            audioIndexMap = await toeflStorage.getAudioIndexMap();
        } catch {
            audioIndexMap = {};
        }
    }

    // Look for test-type-specific drafts first, then fall back to old key
    const draftsKeyForType = currentTestType === "practicetest" 
        ? "toefl_developer_practicetest_drafts_v2" 
        : "toefl_developer_mocktest_drafts_v2";
    
    let draftsV2 = safeParse(localStorage.getItem(draftsKeyForType), {});
    if (!draftsV2 || Object.keys(draftsV2).length === 0) {
        draftsV2 = safeParse(localStorage.getItem("toefl_developer_drafts_v2"), {});
    }

    const keepFlags = await Promise.all(list.map(async (item) => {
        const setId = String(item?.setId || "").trim();
        if (!setId) return false;

        if (item.module === "listening") {
            const audioParts = audioIndexMap && typeof audioIndexMap === "object" ? audioIndexMap[setId] : null;
            const hasAudio = Boolean(
                audioParts && typeof audioParts === "object" &&
                Object.keys(audioParts).some((key) => key !== "_updatedAt")
            );
            if (hasAudio) return true;
        }

        let draft = draftsV2 && typeof draftsV2 === "object" ? draftsV2[setId] : null;
        if ((!draft || typeof draft !== "object") && window.toeflStorage && typeof toeflStorage.getDraftBySetId === "function") {
            try {
                draft = await toeflStorage.getDraftBySetId(setId);
            } catch {
                draft = null;
            }
        }

        return hasMeaningfulDraftContent(item.module, draft);
    }));

    return list.filter((_, index) => keepFlags[index]);
}

function persistSets(records) {
    const payload = {};
    records.forEach((item) => {
        const setId = item.setId || toeflStorage.createSetId(item.module, item.setDate, currentTestType);
        payload[setId] = {
            setId,
            module: item.module,
            label: item.label || MODULE_CONFIG[item.module]?.label || item.module,
            setDate: item.setDate,
            difficulty: item.difficulty,
            updatedAt: item.updatedAt || new Date().toISOString()
        };
    });
    const localKey = currentTestType === "practicetest" 
        ? "toefl_developer_practicetest_sets_v2" 
        : "toefl_developer_mocktest_sets_v2";
    localStorage.setItem(localKey, JSON.stringify(payload));
    toeflStorage.saveSetRecordsWithType(Object.values(payload), currentTestType).then(() => updateSyncStatus(toeflStorage.online));
}

function updateSyncStatus(online) {
    const el = document.getElementById("syncStatus");
    if (!el) return;
    el.style.display = "block";
    el.textContent = online ? "☁ Synced" : "⚡ Offline – local only";
    el.style.background = online ? "#1764aa" : "#a05800";
    el.style.color = "#fff";
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.style.display = "none"; }, 3000);
}

async function deleteSet(setId, module) {
    const moduleLabel = MODULE_CONFIG[module]?.label || module;

    const confirmed = confirm(`Delete "${moduleLabel}" set?\n\nThis removes it from the website and from Firebase.`);
    if (!confirmed) return;

    try {
        // Always fully delete: removes from active Firebase data and local storage/UI
        await toeflStorage.deleteSetRecordWithType(setId, currentTestType);
        purgeLocalSetCaches(setId);
        updateSyncStatus(toeflStorage.online);
        toast(`${moduleLabel} deleted. 🗑️`);
        await renderAll();
    } catch (error) {
        updateSyncStatus(false);
        toast(`Delete failed: ${error?.message || "unknown error"}`);
    }
}

function toggleExplanationOptions(force) {
    const menu = document.getElementById("explanationOptions");
    if (!menu) return;
    if (typeof force === "boolean") {
        menu.classList.toggle("show", force);
        return;
    }
    menu.classList.toggle("show");
}

function toggleCreateOptions(force) {
    const menu = document.querySelector(".create-stack");
    if (!menu) return;
    if (typeof force === "boolean") {
        menu.classList.toggle("show", force);
        return;
    }
    menu.classList.toggle("show");
}

function renderModuleSelectionOptions(testType) {
    const container = document.getElementById("moduleOptionsContainer");
    if (!container) return;
    const options = testType === "practicetest" ? PRACTICE_MODULE_OPTIONS : MOCK_MODULE_OPTIONS;
    container.innerHTML = options.map((opt) => `
        <a href="#" class="module-option" data-module="${opt.module}"${opt.difficulty ? ` data-difficulty="${opt.difficulty}"` : ""}${opt.focus ? ` data-focus="${opt.focus}"` : ""}>
            <img src="../asset/icon/${opt.icon}" alt="${escapeHtml(opt.label)}" />
            <span>${escapeHtml(opt.label)}</span>
        </a>
    `).join("");
}

function buildEditorUrl(moduleId, setDate, setId, testType = "mocktest", options = {}) {
    const startBlank = Boolean(options && options.startBlank);
    const params = new URLSearchParams();
    if (setDate) params.set("setDate", setDate);
    if (setId) params.set("setId", setId);
    if (startBlank) params.set("new", "1");
    if (options && options.difficulty) params.set("difficulty", options.difficulty);
    if (options && options.focus) params.set("focus", options.focus);
    if (options && options.editorTab) params.set("editorTab", options.editorTab);
    params.set("mode", "dev");
    params.set("testType", testType);
    const query = params.toString();
    if (!query) return MODULE_CONFIG[moduleId].createPage;
    return `${MODULE_CONFIG[moduleId].editorPage}?${query}#dev-view`;
}

function dateKey(year, monthIndex, day) {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Mock Test owns day 1, 5, 9, 13... (every 4th day); Practice Test owns the days in between (e.g. 2-4, 6-8).
function isMockTestDayNumber(day) {
    return ((day - 1) % 4) === 0;
}

function isDayOpenForTestType(day, testType) {
    const isMockSlot = isMockTestDayNumber(day);
    return testType === "practicetest" ? !isMockSlot : isMockSlot;
}

function buildScheduleMap() {
    const scheduleMap = {};
    sectionSets.forEach((item) => {
        if (!item.setDate) return;
        if (!scheduleMap[item.setDate]) {
            scheduleMap[item.setDate] = { items: [], listening: false, structure: false, reading: false };
        }
        scheduleMap[item.setDate].items.push(item);
        scheduleMap[item.setDate][item.module] = true;
    });
    return scheduleMap;
}

function isDayComplete(dateValue, scheduleMap) {
    return MODULES.every((moduleId) => Boolean(scheduleMap[dateValue] && scheduleMap[dateValue][moduleId]));
}

function getMonthStats(year, monthIndex) {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const scheduleMap = buildScheduleMap();
    let completeDays = 0;
    let activeDays = 0;

    for (let day = 1; day <= daysInMonth; day += 1) {
        const key = dateKey(year, monthIndex, day);
        const hasAny = Boolean(scheduleMap[key] && scheduleMap[key].items.length);
        if (hasAny) activeDays += 1;
        if (isDayComplete(key, scheduleMap)) completeDays += 1;
    }

    return { daysInMonth, completeDays, activeDays, scheduleMap };
}

function renderStats() {
    const uniqueDays = new Set(sectionSets.filter((item) => item.setDate).map((item) => item.setDate));
    const now = new Date();
    const currentMonthIndex = now.getMonth();
    const currentMonthYear = now.getFullYear();
    const currentMonthCount = sectionSets.filter((item) => item.monthIndex === currentMonthIndex && item.year === currentMonthYear).length;
    const advancedCount = sectionSets.filter((item) => item.difficulty === "advanced").length;
    const stats = [
        { label: "Saved Sets", value: sectionSets.length },
        { label: "Scheduled Days", value: uniqueDays.size },
        { label: "This Month", value: currentMonthCount },
        { label: "Advanced Sets", value: advancedCount }
    ];

    document.getElementById("stats").innerHTML = stats.map((item) => `
        <article class="stat">
            <small>${item.label}</small>
            <strong>${item.value}</strong>
        </article>
    `).join("");
}

function renderModuleOverview() {
    const host = document.getElementById("moduleOverview");
    host.innerHTML = MODULES.map((moduleId) => {
        const moduleSets = sectionSets.filter((item) => item.module === moduleId);
        const savedSet = moduleSets[0] || null;
        return `
            <article class="module-pill ${moduleId}">
                <div class="pill-head">${MODULE_CONFIG[moduleId].icon} ${MODULE_CONFIG[moduleId].label}</div>
                <div class="pill-body">
                    <small>${savedSet ? `${savedSet.difficultyLabel} · ${savedSet.displayDate}` : "No set metadata yet"}</small>
                    <strong>${moduleSets.length > 0 ? `${moduleSets.length} Set(s)` : "Draft"}</strong>
                </div>
            </article>
        `;
    }).join("");
}

const LIBRARY_VIEW_KEY = "toefl_library_view";

function applyLibraryView(view) {
    const host = document.getElementById("library");
    if (host) host.classList.toggle("list-view", view === "list");
    document.querySelectorAll("#libraryViewToggle .view-toggle-btn").forEach((btn) => {
        const isActive = btn.dataset.view === view;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-pressed", String(isActive));
    });
}

function initLibraryViewToggle() {
    const toggle = document.getElementById("libraryViewToggle");
    if (!toggle) return;
    applyLibraryView(localStorage.getItem(LIBRARY_VIEW_KEY) === "list" ? "list" : "grid");
    toggle.addEventListener("click", (event) => {
        const btn = event.target.closest(".view-toggle-btn");
        if (!btn) return;
        localStorage.setItem(LIBRARY_VIEW_KEY, btn.dataset.view);
        applyLibraryView(btn.dataset.view);
    });
}

function renderLibrary() {
    const host = document.getElementById("library");
    if (sectionSets.length === 0) {
        const testTypeLabel = currentTestType === "practicetest" ? "Practice" : "Mock";
        host.innerHTML = `<div class="empty">No TOEFL ${testTypeLabel} Test sets saved yet. Open Listening, Structure, or Reading, set the date and difficulty, then click Update.</div>`;
        return;
    }

    host.innerHTML = sectionSets.map((item) => {
        const normalizedDate = normalizeDateKey(item.setDate || "");
        const metadataSetDateLabel = item.setDate ? item.displayDate : "-";
        const compactSetDateLabel = formatCompactSetDate(item.setDate);
        return `
        <article class="card">
            <div class="card-body">
                <h3>${item.icon} ${escapeHtml(item.label)} Set</h3>
                <div class="meta">
                    <span><img src="../asset/icon/pin.png" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"> Set Date: ${escapeHtml(metadataSetDateLabel)}</span>
                    <span>Difficulty: ${escapeHtml(item.difficultyLabel)}</span>
                    <span>ID: ${escapeHtml(item.setId || "-")}</span>
                    <span>Updated: ${escapeHtml(item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "Not saved")}</span>
                </div>
                <div class="actions">
                    <a class="btn-mini edit" href="${buildEditorUrl(item.module, item.setDate, item.setId, currentTestType)}">Open Editor</a>
                    <label class="btn-mini date date-picker-trigger" aria-label="Set date for ${escapeHtml(item.label)} set">
                        <span>Set Date: ${escapeHtml(compactSetDateLabel)}</span>
                        <input type="date" value="${escapeHtml(normalizedDate)}" onchange="handleLibrarySetDateChange('${escapeHtml(item.setId)}', '${escapeHtml(item.module)}', this.value)">
                    </label>
                    <a class="btn-mini open" href="study-plan.html?year=${item.year ?? new Date().getFullYear()}&month=${item.monthIndex ?? new Date().getMonth()}">Schedule</a>
                    <button class="btn-mini" style="background:#d64545;color:#fff;border:none;cursor:pointer;" onclick="deleteSet('${item.setId}', '${item.module}')">Delete</button>
                </div>
            </div>
        </article>
    `;
    }).join("");
}

async function handleLibrarySetDateChange(setId, moduleId, nextDate) {
    const selectedDate = normalizeDateKey(nextDate || "");

    if (selectedDate) {
        const parsedDate = new Date(`${selectedDate}T00:00:00`);
        if (!Number.isNaN(parsedDate.getTime()) && !isDayOpenForTestType(parsedDate.getDate(), currentTestType)) {
            const ownerLabel = currentTestType === "practicetest" ? "Mock Test" : "Practice Test";
            toast(`This date is reserved for ${ownerLabel}.`);
            await renderAll();
            return;
        }
    }

    const targetIndex = sectionSets.findIndex((item) => item && String(item.setId) === String(setId));
    if (targetIndex === -1) return;

    const target = sectionSets[targetIndex];
    const normalized = normalizeSet({
        ...target,
        module: moduleId || target.module,
        setDate: selectedDate,
        updatedAt: new Date().toISOString()
    }, moduleId || target.module);

    if (!normalized) return;
    sectionSets[targetIndex] = normalized;

    persistSets(sectionSets);
    await renderAll();
    toast(selectedDate ? `Set date updated: ${normalized.displayDate}` : "Set date cleared");
}

function renderMonthCalendar() {
    const host = document.getElementById("monthGrid");
    const now = new Date();
    const year = now.getFullYear();

    host.innerHTML = MONTH_LABELS.map((monthLabel, monthIndex) => {
        const { daysInMonth, completeDays, activeDays } = getMonthStats(year, monthIndex);
        const isComplete = completeDays > 0 && completeDays === activeDays;
        const ratio = `${String(activeDays).padStart(2, "0")}/${String(daysInMonth).padStart(2, "0")}`;
        const statusLabel = activeDays === 0 ? "Empty" : isComplete ? "Complete" : "In Progress";
        const cardClass = isComplete ? "month-card complete" : "month-card partial";
        const activeClass = monthIndex === now.getMonth() ? " active" : "";

        return `
            <button class="${cardClass}${activeClass}" type="button" data-month-index="${monthIndex}" data-year="${year}">
                <div class="month-head">
                    <strong>${monthLabel}</strong>
                    <span class="arrow">➜</span>
                </div>
                <div class="month-ratio">${ratio}</div>
                <div class="month-note">Scheduled set days for ${year}</div>
                <div class="month-status">${statusLabel}</div>
            </button>
        `;
    }).join("");

    host.querySelectorAll("[data-month-index]").forEach((button) => {
        button.addEventListener("click", () => {
            renderMonthDetail(Number(button.dataset.year), Number(button.dataset.monthIndex));
            host.querySelectorAll(".month-card.active").forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
        });
    });

    renderMonthDetail(year, now.getMonth());
}

function renderMonthDetail(year, monthIndex) {
    const host = document.getElementById("monthDetail");
    const monthLabel = MONTH_LABELS[monthIndex];
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const firstWeekday = new Date(year, monthIndex, 1).getDay();
    const { completeDays, activeDays, scheduleMap } = getMonthStats(year, monthIndex);
    const ratio = `${String(activeDays).padStart(2, "0")}/${String(daysInMonth).padStart(2, "0")}`;
    const dayCards = [];

    for (let index = 0; index < firstWeekday; index += 1) {
        dayCards.push('<div class="month-detail-day empty"></div>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const key = dateKey(year, monthIndex, day);
        const entry = scheduleMap[key];
        const dayComplete = isDayComplete(key, scheduleMap);
        const hasAny = Boolean(entry && entry.items.length);
        const items = entry ? entry.items : [];

        if (!isDayOpenForTestType(day, currentTestType)) {
            const ownerLabel = isMockTestDayNumber(day) ? "Mock Test" : "Practice Test";
            dayCards.push(`
                <article class="month-detail-day locked">
                    <div class="day-no">${day}</div>
                    <div class="month-actions">
                        <div class="month-action locked-note">
                            <span>🔒 ${ownerLabel} day</span>
                        </div>
                    </div>
                    <div class="detail-note">Reserved for ${ownerLabel} only</div>
                </article>
            `);
            continue;
        }

        const missingModules = MODULES.filter((moduleId) => !items.some((item) => item.module === moduleId));
        const moduleActions = hasAny
            ? `
                ${items.map((item) => `
                    <a class="month-action complete" href="${buildEditorUrl(item.module, key, item.setId, currentTestType)}">
                        <span>${item.icon} ${item.label}</span>
                        <span>${item.difficultyLabel}</span>
                    </a>
                `).join("")}
                ${missingModules.map((moduleId) => `
                    <a class="month-action create" href="${buildEditorUrl(moduleId, key, undefined, currentTestType, { startBlank: true })}">
                        <span>＋ ${MODULE_CONFIG[moduleId].label}</span>
                        <span>Create</span>
                    </a>
                `).join("")}
            `
            : `
                ${MODULES.map((moduleId) => `
                    <a class="month-action create" href="${buildEditorUrl(moduleId, key, undefined, currentTestType, { startBlank: true })}">
                        <span>＋ ${MODULE_CONFIG[moduleId].label}</span>
                        <span>Create</span>
                    </a>
                `).join("")}
            `;

        dayCards.push(`
            <article class="month-detail-day ${dayComplete ? "complete" : "partial"}">
                <div class="day-no">${day}</div>
                <div class="module-chip-row">
                    ${MODULES.map((moduleId) => {
                        const done = Boolean(entry && entry[moduleId]);
                        return `<span class="module-chip${done ? " done" : ""}" title="${MODULE_CONFIG[moduleId].label}">${MODULE_CONFIG[moduleId].icon}</span>`;
                    }).join("")}
                </div>
                <div class="month-actions">${moduleActions}</div>
                <div class="detail-note">${dayComplete ? "All three TOEFL modules scheduled" : hasAny ? "Some modules saved for this day" : "No saved section set yet"}</div>
            </article>
        `);
    }

    host.innerHTML = `
        <div class="month-detail-head">
            <div>
                <h3>${monthLabel} ${year}</h3>
                <div class="month-detail-meta">
                    <span>Scheduled ${ratio}</span>
                    <span>${completeDays} fully-covered day(s)</span>
                </div>
            </div>
            <div class="detail-note">Open any day to route into Listening, Structure, or Reading with that date prefilled.</div>
        </div>
        <div class="month-detail-grid">
            ${dayCards.join("")}
        </div>
    `;
    host.classList.add("show");
}

function exportData() {
    const blob = new Blob([JSON.stringify(sectionSets, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `toefl_section_sets_${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast("Exported section metadata");
}

async function importData(file) {
    try {
        const text = await file.text();
        const imported = JSON.parse(text);
        const inputItems = Array.isArray(imported)
            ? imported
            : Object.entries(imported || {}).map(([moduleId, value]) => ({ ...value, module: value?.module || moduleId }));
        const normalized = inputItems.map((item) => normalizeSet(item, item?.module)).filter(Boolean);
        if (normalized.length === 0) {
            toast("No valid section metadata found in file");
            return;
        }
        const existing = getStoredSets();
        const mergedMap = {};
        [...existing, ...normalized].forEach((item) => {
            const setId = item.setId || toeflStorage.createSetId(item.module, item.setDate, currentTestType);
            mergedMap[setId] = { ...item, setId };
        });
        persistSets(Object.values(mergedMap));
        renderAll();
        toast("Imported section metadata");
    } catch (error) {
        toast(`Error importing file: ${error.message}`);
    }
}

async function renderAll() {
    const loadedSets = await loadSetsFromFirebase();
    // Don't filter sets - show all recovered data even if empty
    sectionSets = Array.isArray(loadedSets) ? loadedSets : [];
    renderStats();
    renderModuleOverview();
    renderLibrary();
    renderMonthCalendar();
}

function setMaterialsLibraryVisible(isVisible) {
    const panel = document.getElementById("materialsLibraryPanel");
    const dashboardSections = ["stats", "moduleOverview", "library", "monthGrid", "monthDetail"];
    if (panel) panel.hidden = !isVisible;
    dashboardSections.forEach((id) => {
        const element = document.getElementById(id);
        const section = element?.closest("section");
        if (section) section.hidden = isVisible;
    });
    if (isVisible) renderMaterialsLibrary();
}

// Initialize event listeners
document.addEventListener("DOMContentLoaded", async () => {
    // Run data migration on startup to recover any lost data
    console.log("[Developer] Running startup data migration check...");
    if (typeof toeflStorage !== 'undefined' && toeflStorage.runDataMigration) {
        await toeflStorage.runDataMigration().catch(err => {
            console.error("[Developer] Migration error (non-blocking):", err);
        });
    }
    await loadMaterialsLibraryFromFirebase();
    
    initLibraryViewToggle();

    document.getElementById("exportBtn").addEventListener("click", exportData);
    document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
    document.getElementById("importFile").addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (file) importData(file);
        event.target.value = "";
    });
    
    // Test type tab switching
    document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            currentTestType = e.target.dataset.testType;
            document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
            e.target.classList.add("active");
            if (currentTestType === "materialslibrary") {
                setMaterialsLibraryVisible(true);
                return;
            }
            setMaterialsLibraryVisible(false);
            await renderAll();
        });
    });

    document.getElementById("materialsSearch")?.addEventListener("input", renderMaterialsLibrary);
    document.getElementById("createMaterialTopicForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const moduleNumber = String(document.getElementById("newMaterialModule")?.value || "").trim();
        const code = String(document.getElementById("newMaterialTopicCode")?.value || "").trim();
        const title = String(document.getElementById("newMaterialTopicName")?.value || "").trim();
        if (!moduleNumber || !code || !title) return;
        const topics = getCustomMaterialTopics();
        const topic = { module: `Module ${moduleNumber}`, moduleTitle: "Custom material", moduleHeading: "", code, title, heading: "", defaultUrl: "" };
        if (getDefaultMaterialTopics().some((item) => materialTopicId(item) === materialTopicId(topic))) {
            toast("A material with this module and topic number already exists.");
            return;
        }
        topics.push(topic);
        localStorage.setItem(MATERIAL_TOPICS_KEY, JSON.stringify(topics));
        event.currentTarget.reset();
        renderMaterialsLibrary();
        syncMaterialsLibraryToFirebase();
        toast("New material created");
    });
    document.getElementById("materialDocumentInput")?.addEventListener("change", (event) => {
        saveMaterialDocument(event.target.files?.[0]);
    });
    document.getElementById("materialsViewToggle")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-materials-view]");
        if (!button) return;
        const view = button.dataset.materialsView;
        localStorage.setItem(MATERIALS_VIEW_KEY, view);
        applyMaterialsView(view);
    });
    applyMaterialsView(localStorage.getItem(MATERIALS_VIEW_KEY));
    // Create button with test type selection - with error handling
    const createBtn = document.getElementById("createBtn");
    if (createBtn) {
        createBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const menu = document.getElementById("createOptions");
            if (menu) {
                menu.classList.toggle("show");
                console.log("Create menu toggled, now showing:", menu.classList.contains("show"));
            } else {
                console.error("Create options menu not found!");
            }
        });
    } else {
        console.error("Create button not found in DOM!");
    }

    // Test type selection in create menu
    const createOptions = document.getElementById("createOptions");
    if (createOptions) {
        document.querySelectorAll("#createOptions .option-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const testType = btn.dataset.testType;
                console.log("Selected test type:", testType);
                currentTestType = testType;
                
                // Update tabs to reflect current selection
                document.querySelectorAll(".tab-btn").forEach((tabBtn) => {
                    tabBtn.classList.toggle("active", tabBtn.dataset.testType === testType);
                });
                
                // Show module selection modal
                const modal = document.getElementById("moduleSelectionModal");
                if (modal) {
                    renderModuleSelectionOptions(testType);
                    modal.style.display = "flex";
                    console.log("Module selection modal shown");
                } else {
                    console.error("Module selection modal not found!");
                }
                
                if (createOptions) {
                    createOptions.classList.remove("show");
                }
            });
        });
    }

    // Module selection in modal (options are rendered dynamically per test type, so use delegation)
    const moduleOptionsContainer = document.getElementById("moduleOptionsContainer");
    if (moduleOptionsContainer) {
        moduleOptionsContainer.addEventListener("click", (e) => {
            const option = e.target.closest(".module-option");
            if (!option) return;
            e.preventDefault();
            const module = option.dataset.module;
            const difficulty = option.dataset.difficulty || "";
            const focus = option.dataset.focus || "";
            console.log("Selected module:", module, "difficulty:", difficulty, "focus:", focus, "for test type:", currentTestType);
            const modal = document.getElementById("moduleSelectionModal");
            if (modal) {
                modal.style.display = "none";
            }

            const url = buildEditorUrl(module, undefined, undefined, currentTestType, { startBlank: true, difficulty, focus, editorTab: "questions" });
            console.log("Navigating to:", url);
            window.location.href = url;
        });
    }

    // Close modal button
    const closeModuleModal = document.getElementById("closeModuleModal");
    if (closeModuleModal) {
        closeModuleModal.addEventListener("click", () => {
            const modal = document.getElementById("moduleSelectionModal");
            if (modal) {
                modal.style.display = "none";
            }
        });
    }

    // Close modal when clicking outside
    const moduleSelectionModal = document.getElementById("moduleSelectionModal");
    if (moduleSelectionModal) {
        moduleSelectionModal.addEventListener("click", (e) => {
            if (e.target.id === "moduleSelectionModal") {
                e.target.style.display = "none";
            }
        });
    }

    document.getElementById("explanationBtn").addEventListener("click", () => toggleExplanationOptions());

    document.addEventListener("click", (event) => {
        const createPicker = document.querySelector(".create-stack");
        if (createPicker && !createPicker.contains(event.target)) {
            toggleCreateOptions(false);
        }
        
        const explanationStack = document.querySelector(".explanation-inline-options");
        if (explanationStack && !explanationStack.parentElement.contains(event.target)) {
            toggleExplanationOptions(false);
        }
    });

    window.addEventListener("focus", renderAll);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) renderAll();
    });

    // API Gateway Configuration Panel event listeners (with safety checks)
    const settingsBtn = document.getElementById('settingsBtn');
    const closeConfigBtn = document.getElementById('closeConfigBtn');
    const testGatewayBtn = document.getElementById('testGatewayBtn');
    const saveGatewayConfigBtn = document.getElementById('saveGatewayConfigBtn');
    const apiGatewayConfigPanel = document.getElementById('apiGatewayConfigPanel');
    const apiGatewayUrlInput = document.getElementById('apiGatewayUrl');
    const apiGatewayHostInput = document.getElementById('apiGatewayHost');
    const apiGatewayPortInput = document.getElementById('apiGatewayPort');
    const apiGatewayProtocolInput = document.getElementById('apiGatewayProtocol');
    const configStatus = document.getElementById('configStatus');

    // Load saved configuration
    function loadGatewayConfig() {
        if (!apiGatewayUrlInput || !apiGatewayHostInput || !apiGatewayPortInput || !apiGatewayProtocolInput) return;
        
        const savedUrl = localStorage.getItem('toefl_api_gateway_url');
        const savedHost = localStorage.getItem('toefl_api_gateway_host');
        const savedPort = localStorage.getItem('toefl_api_gateway_port');
        const savedProtocol = localStorage.getItem('toefl_api_gateway_protocol');
        
        if (savedUrl) apiGatewayUrlInput.value = savedUrl;
        if (savedHost) apiGatewayHostInput.value = savedHost;
        if (savedPort) apiGatewayPortInput.value = savedPort;
        if (savedProtocol) apiGatewayProtocolInput.value = savedProtocol;
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if (apiGatewayConfigPanel) {
                loadGatewayConfig();
                apiGatewayConfigPanel.style.display = 'grid';
                if (configStatus) {
                    configStatus.textContent = '';
                    configStatus.className = 'config-status';
                }
            }
        });
    }

    if (closeConfigBtn) {
        closeConfigBtn.addEventListener('click', () => {
            if (apiGatewayConfigPanel) {
                apiGatewayConfigPanel.style.display = 'none';
            }
        });
    }

    if (testGatewayBtn) {
        testGatewayBtn.addEventListener('click', async () => {
            if (!configStatus) return;
            configStatus.textContent = 'Testing...';
            configStatus.className = 'config-status loading';
            
            try {
                // Build the gateway URL from current inputs
                let testUrl;
                if (apiGatewayUrlInput && apiGatewayUrlInput.value.trim()) {
                    testUrl = apiGatewayUrlInput.value.trim();
                } else {
                    const protocol = (apiGatewayProtocolInput && apiGatewayProtocolInput.value) || 'http';
                    const host = (apiGatewayHostInput && apiGatewayHostInput.value) || 'localhost';
                    const port = (apiGatewayPortInput && apiGatewayPortInput.value) || '8000';
                    testUrl = `${protocol}://${host}:${port}`;
                }
                
                const response = await fetch(`${testUrl}/api/docs`, { 
                    method: 'GET',
                    timeout: 5000
                });
                
                if (response.ok) {
                    configStatus.textContent = '✅ Gateway is running!';
                    configStatus.className = 'config-status success';
                } else {
                    configStatus.textContent = '❌ Gateway responded but with error. Check configuration.';
                    configStatus.className = 'config-status error';
                }
            } catch (error) {
                configStatus.textContent = `❌ Cannot reach gateway. Start with: python -m uvicorn apps.api-gateway.main:app --port 8000`;
                configStatus.className = 'config-status error';
                console.error('Gateway test failed:', error);
            }
        });
    }

    if (saveGatewayConfigBtn) {
        saveGatewayConfigBtn.addEventListener('click', () => {
            if (apiGatewayUrlInput && apiGatewayUrlInput.value.trim()) {
                localStorage.setItem('toefl_api_gateway_url', apiGatewayUrlInput.value.trim());
            } else {
                localStorage.removeItem('toefl_api_gateway_url');
            }
            
            if (apiGatewayHostInput && apiGatewayHostInput.value.trim()) {
                localStorage.setItem('toefl_api_gateway_host', apiGatewayHostInput.value.trim());
            }
            
            if (apiGatewayPortInput && apiGatewayPortInput.value.trim()) {
                localStorage.setItem('toefl_api_gateway_port', apiGatewayPortInput.value.trim());
            }
            
            if (apiGatewayProtocolInput) {
                localStorage.setItem('toefl_api_gateway_protocol', apiGatewayProtocolInput.value);
            }
            
            if (configStatus) {
                configStatus.textContent = '✅ Configuration saved!';
                configStatus.className = 'config-status success';
            }
        });
    }

    renderAll().catch(console.error);
});
