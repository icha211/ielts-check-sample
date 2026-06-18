// Developer Dashboard JavaScript

const SETS_KEY = "toefl_developer_sets_v1";
const SETS_KEY_V2 = "toefl_developer_sets_v2";
const MODULE_CONFIG = {
    listening: {
        editorPage: "section 1.html",
        createPage: "section 1.html#dev-view",
        icon: `<img src="../asset/icon/headset.png" style="width:18px;height:18px;vertical-align:middle;" alt="">`,
        label: "Listening"
    },
    structure: {
        editorPage: "section 2.html",
        createPage: "section 2.html#dev-view",
        icon: `<img src="../asset/icon/paper-pencil.png" style="width:18px;height:18px;vertical-align:middle;" alt="">`,
        label: "Structure"
    },
    reading: {
        editorPage: "section 3.html",
        createPage: "section 3.html#dev-view",
        icon: `<img src="../asset/icon/blue-book.png" style="width:18px;height:18px;vertical-align:middle;" alt="">`,
        label: "Reading"
    }
};
const MONTH_LABELS = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
const MODULES = ["listening", "structure", "reading"];
const DIFFICULTY_LABELS = {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced"
};

let sectionSets = [];

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
        const records = await toeflStorage.getSetRecords();
        updateSyncStatus(toeflStorage.online);
        return normalizeSetsMapToList(records);
    } catch (e) {
        updateSyncStatus(false);
        return getStoredSets();
    }
}

function persistSets(records) {
    const payload = {};
    records.forEach((item) => {
        const setId = item.setId || toeflStorage.createSetId(item.module, item.setDate);
        payload[setId] = {
            setId,
            module: item.module,
            label: item.label || MODULE_CONFIG[item.module]?.label || item.module,
            setDate: item.setDate,
            difficulty: item.difficulty,
            updatedAt: item.updatedAt || new Date().toISOString()
        };
    });
    localStorage.setItem(SETS_KEY_V2, JSON.stringify(payload));
    toeflStorage.saveSetRecords(Object.values(payload)).then(() => updateSyncStatus(toeflStorage.online));
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
        await toeflStorage.deleteSetRecord(setId);
        updateSyncStatus(toeflStorage.online);
        toast(`${MODULE_CONFIG[module]?.label || module} set deleted`);
        await renderAll();
    } catch (error) {
        updateSyncStatus(false);
        toast(`Delete failed: ${error?.message || "unknown error"}`);
    }
}

function toggleCreateOptions(force) {
    const menu = document.getElementById("createOptions");
    if (!menu) return;
    if (typeof force === "boolean") {
        menu.classList.toggle("show", force);
        return;
    }
    menu.classList.toggle("show");
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

function buildEditorUrl(moduleId, setDate, setId) {
    const params = new URLSearchParams();
    if (setDate) params.set("setDate", setDate);
    if (setId) params.set("setId", setId);
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
        host.innerHTML = '<div class="empty">No TOEFL section sets saved yet. Open Listening, Structure, or Reading, set the date and difficulty, then click Update.</div>';
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
                    <a class="btn-mini edit" href="${buildEditorUrl(item.module, item.setDate, item.setId)}">Open Editor</a>
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
                    <a class="month-action complete" href="${buildEditorUrl(item.module, key, item.setId)}">
                        <span>${item.icon} ${item.label}</span>
                        <span>${item.difficultyLabel}</span>
                    </a>
                `).join("")}
                ${missingModules.map((moduleId) => `
                    <a class="month-action create" href="${buildEditorUrl(moduleId, key)}">
                        <span>＋ ${MODULE_CONFIG[moduleId].label}</span>
                        <span>Create</span>
                    </a>
                `).join("")}
            `
            : `
                ${MODULES.map((moduleId) => `
                    <a class="month-action create" href="${buildEditorUrl(moduleId, key)}">
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
            const setId = item.setId || toeflStorage.createSetId(item.module, item.setDate);
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
    sectionSets = await loadSetsFromFirebase();
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
    document.getElementById("createBtn").addEventListener("click", () => toggleCreateOptions());
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

    renderAll().catch(console.error);
});
