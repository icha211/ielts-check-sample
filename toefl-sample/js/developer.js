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

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 2200);
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
    const parsedV2 = safeParse(localStorage.getItem(SETS_KEY_V2), {});
    const hasV2 = parsedV2 && typeof parsedV2 === "object" && Object.keys(parsedV2).length > 0;
    const parsed = hasV2 ? parsedV2 : safeParse(localStorage.getItem(SETS_KEY), {});
    return normalizeSetsMapToList(parsed);
}

async function loadSetsFromFirebase() {
    try {
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

    const draftsV2 = safeParse(localStorage.getItem("toefl_developer_drafts_v2"), {});

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
    if (!confirm(`Delete this ${MODULE_CONFIG[module]?.label || module} set? This cannot be undone.`)) return;
    try {
        await toeflStorage.deleteSetRecordWithType(setId, currentTestType);
        updateSyncStatus(toeflStorage.online);
        toast(`${MODULE_CONFIG[module]?.label || module} set deleted`);
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

function buildEditorUrl(moduleId, setDate, setId, testType = "mocktest") {
    const params = new URLSearchParams();
    if (setDate) params.set("setDate", setDate);
    if (setId) params.set("setId", setId);
    params.set("mode", "dev");
    params.set("testType", testType);
    const query = params.toString();
    if (!query) return MODULE_CONFIG[moduleId].createPage;
    return `${MODULE_CONFIG[moduleId].editorPage}?${query}#dev-view`;
}

function dateKey(year, monthIndex, day) {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

function renderLibrary() {
    const host = document.getElementById("library");
    if (sectionSets.length === 0) {
        const testTypeLabel = currentTestType === "practicetest" ? "Practice" : "Mock";
        host.innerHTML = `<div class="empty">No TOEFL ${testTypeLabel} Test sets saved yet. Open Listening, Structure, or Reading, set the date and difficulty, then click Update.</div>`;
        return;
    }

    host.innerHTML = sectionSets.map((item) => `
        <article class="card">
            <div class="card-body">
                <h3>${item.icon} ${escapeHtml(item.label)} Set</h3>
                <div class="meta">
                    <span><img src="../asset/icon/pin.png" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"> Set Date: ${escapeHtml(item.displayDate)}</span>
                    <span>Difficulty: ${escapeHtml(item.difficultyLabel)}</span>
                    <span>ID: ${escapeHtml(item.setId || "-")}</span>
                    <span>Updated: ${escapeHtml(item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "Not saved")}</span>
                </div>
                <div class="actions">
                    <a class="btn-mini edit" href="${buildEditorUrl(item.module, item.setDate, item.setId, currentTestType)}">Open Editor</a>
                    <a class="btn-mini open" href="study-plan.html?year=${item.year ?? new Date().getFullYear()}&month=${item.monthIndex ?? new Date().getMonth()}">Schedule</a>
                    <button class="btn-mini" style="background:#d64545;color:#fff;border:none;cursor:pointer;" onclick="deleteSet('${item.setId}', '${item.module}')">Delete</button>
                </div>
            </div>
        </article>
    `).join("");
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
                    <a class="month-action create" href="${buildEditorUrl(moduleId, key, undefined, currentTestType)}">
                        <span>＋ ${MODULE_CONFIG[moduleId].label}</span>
                        <span>Create</span>
                    </a>
                `).join("")}
            `
            : `
                ${MODULES.map((moduleId) => `
                    <a class="month-action create" href="${buildEditorUrl(moduleId, key, undefined, currentTestType)}">
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
    sectionSets = await filterSetsWithRealContent(loadedSets);
    renderStats();
    renderModuleOverview();
    renderLibrary();
    renderMonthCalendar();
}

// Initialize event listeners
document.addEventListener("DOMContentLoaded", () => {
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
            await renderAll();
        });
    });

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

    // Module selection in modal
    document.querySelectorAll(".module-option").forEach((option) => {
        option.addEventListener("click", (e) => {
            e.preventDefault();
            const module = e.currentTarget.dataset.module;
            console.log("Selected module:", module, "for test type:", currentTestType);
            const modal = document.getElementById("moduleSelectionModal");
            if (modal) {
                modal.style.display = "none";
            }
            
            const url = buildEditorUrl(module, undefined, undefined, currentTestType);
            console.log("Navigating to:", url);
            window.location.href = url;
        });
    });

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
