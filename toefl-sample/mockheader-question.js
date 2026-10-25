(function (global) {
    "use strict";

    const steps = [
        { id: 1, title: "Listening", page: "section 1.html" },
        { id: 2, title: "Structure & Writing", page: "section 2.html" },
        { id: 3, title: "Reading", page: "section 3.html" }
    ];

    function formatDate(date) {
        const parts = new Intl.DateTimeFormat("en", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).formatToParts(date);
        const part = (type) => parts.find((item) => item.type === type)?.value || "";
        return `${part("day")} ${part("month")} ${part("year")}`;
    }

    function getCurrentStep() {
        const path = decodeURIComponent(global.location.pathname).toLowerCase();
        return steps.find((step) => path.endsWith(step.page)) || null;
    }

    function getPartLabel(step) {
        if (step.id === 1) {
            const onboarding = document.getElementById("onboarding-overlay");
            if (onboarding?.classList.contains("is-visible")) return "Up Next";
            const title = document.getElementById("audio-shell-title")?.textContent.trim();
            return title || "Up Next";
        }

        if (step.id === 2) {
            const activePart = document.querySelector("#user-passages-container .sub-content.active");
            const partTitle = activePart?.querySelector(".structure-parta-directions__title")?.textContent.trim();
            return partTitle || "Part A: Structure";
        }

        const activePassage = document.querySelector("#reading-part-header .reading-part-chip.active .reading-part-title");
        const passageLabel = activePassage?.textContent.trim();
        return passageLabel ? passageLabel.replace(/^part\s+/i, "Part ") : "Part 1";
    }

    function getPackageDate(header) {
        const label = header.querySelector(".package-01-jan");
        const text = label?.textContent.trim() || "";
        const labelDate = text.replace(/^(?:mock\s*test|practice\s*test|package)\s*/i, "").trim();
        if (/\b\d{4}\b/.test(labelDate)) return labelDate;

        const params = new URLSearchParams(global.location.search);
        const dateValue = document.getElementById("set-date")?.value || params.get("setDate");
        if (dateValue) {
            const parsedDate = new Date(`${dateValue}T00:00:00`);
            if (!Number.isNaN(parsedDate.getTime())) return formatDate(parsedDate);
        }
        const dateOnly = labelDate.match(/^(\d{1,2}\s+[a-z]{3})$/i);
        if (dateOnly) return `${dateOnly[1]} ${new Date().getFullYear()}`;
        return labelDate || text;
    }

    function createStepMarkup(step, current, fullTest) {
        const state = step.id < current.id && fullTest
            ? "complete"
            : step.id === current.id
                ? "current"
                : "upcoming";
        const subtitle = state === "complete"
            ? "Complete"
            : state === "current"
                ? getPartLabel(step)
                : state === "upcoming" && step.id === current.id + 1
                    ? "Not started"
                    : "Not started";
        const currentStep = state === "current" ? ' aria-current="step"' : "";
        const lock = state === "complete"
            ? '<svg class="mock-test-header__lock" viewBox="0 0 12 14" aria-hidden="true"><path d="M3 6V4a3 3 0 0 1 6 0v2M2 6h8v7H2z"></path></svg>'
            : "";
        return `<li class="mock-test-header__step is-${state}"${currentStep}>
            <div class="mock-test-header__step-main">
                <span class="mock-test-header__number">${step.id}</span>
                <span class="mock-test-header__step-copy">
                    <span class="mock-test-header__step-title">${step.title}</span>
                    <span class="mock-test-header__step-subtitle">${subtitle}${lock}</span>
                </span>
            </div>
        </li>`;
    }

    function install(header, current) {
        const brand = header.querySelector(".logo-test-package-timer");
        const logo = brand?.querySelector(".logo-frame-icon");
        const packageInfo = brand?.querySelector(".test-package-timer");
        const timer = header.querySelector(".timer");
        const legacyProgress = header.querySelector(".progressbar-final");
        const features = legacyProgress?.querySelector(".features");
        const submit = header.querySelector("#submit-header-btn");
        if (!brand || !logo || !packageInfo || !timer || !legacyProgress || !features || !submit) {
            throw new Error("Mock test header is missing a required existing header element.");
        }

        const params = new URLSearchParams(global.location.search);
        const fullTest = params.get("fullTest") === "true";
        const identity = document.createElement("div");
        identity.className = "mock-test-header__identity";
        identity.innerHTML = `<span class="mock-test-header__test-meta">
            <span class="mock-test-header__test-name">Mock Test</span>
            <span class="mock-test-header__test-date">${getPackageDate(header)}</span>
        </span>`;
        packageInfo.classList.add("mock-test-header__legacy-package");
        identity.prepend(logo);
        identity.append(packageInfo);

        const stepNav = document.createElement("nav");
        stepNav.className = "mock-test-header__progress";
        stepNav.setAttribute("aria-label", "Mock test progress");
        stepNav.innerHTML = `<ol>${steps.map((step) => createStepMarkup(step, current, fullTest)).join("")}</ol>`;

        const controls = document.createElement("div");
        controls.className = "mock-test-header__controls";
        const timerLabel = document.createElement("span");
        timerLabel.className = "mock-test-header__timer-label";
        timerLabel.textContent = "Section time left";

        brand.replaceWith(identity);
        header.insertBefore(stepNav, legacyProgress);
        controls.append(timer, features, submit);
        header.append(controls);
        header.classList.add("mock-test-header");
        header.dataset.mockTestHeader = "true";

        const languageToggle = features.querySelector("#toggle-language-btn");
        if (languageToggle) languageToggle.hidden = true;
        timer.append(timerLabel);

        const updateCurrentPart = () => {
            const currentItem = stepNav.querySelector(".is-current, .is-up-next");
            const currentSubtitle = currentItem?.querySelector(".mock-test-header__step-subtitle");
            const isUpNext = current.id === 1
                && document.getElementById("onboarding-overlay")?.classList.contains("is-visible");
            if (currentItem) {
                currentItem.classList.toggle("is-current", !isUpNext);
                currentItem.classList.toggle("is-up-next", isUpNext);
                if (isUpNext) currentItem.removeAttribute("aria-current");
                else currentItem.setAttribute("aria-current", "step");
            }
            if (currentSubtitle) currentSubtitle.textContent = getPartLabel(current);
            header.dataset.mockTestHeaderStage = isUpNext ? "up-next" : "active";
        };
        const updateDate = () => {
            const date = stepNav.parentElement?.querySelector(".mock-test-header__test-date");
            if (date) date.textContent = getPackageDate(header);
        };
        const observer = new MutationObserver(() => {
            updateCurrentPart();
            updateDate();
        });
        const partSources = [
            document.getElementById("audio-shell-title"),
            document.getElementById("user-passages-container"),
            document.getElementById("reading-part-header"),
            document.getElementById("onboarding-overlay"),
            header.querySelector(".package-01-jan")
        ].filter(Boolean);
        partSources.forEach((source) => observer.observe(source, { childList: true, subtree: true, characterData: true, attributes: true }));
        updateCurrentPart();
    }

    function installCompleteSummary() {
        const main = document.querySelector(".summary-main");
        if (!main || main.querySelector(".mock-test-header--complete")) return;

        const params = new URLSearchParams(global.location.search);
        const packageDate = params.get("setDate");
        const dateMatch = packageDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const date = dateMatch
            ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))
            : new Date();
        const header = document.createElement("header");
        header.className = "cbt-header mock-test-header mock-test-header--complete";
        header.dataset.mockTestHeaderStage = "complete";

        const identity = document.createElement("div");
        identity.className = "mock-test-header__identity";
        identity.innerHTML = `<img class="logo-frame-icon" src="../asst/icon/QuickCheckLogo.png" alt="Quick Check">
            <span class="mock-test-header__test-meta">
                <span class="mock-test-header__test-name">Mock Test</span>
                <span class="mock-test-header__test-date">${formatDate(date)}</span>
            </span>`;

        const progress = document.createElement("nav");
        progress.className = "mock-test-header__progress";
        progress.setAttribute("aria-label", "Mock test progress");
        progress.innerHTML = `<ol>${steps.map((step) => createStepMarkup(step, { id: steps.length + 1 }, true)).join("")}</ol>`;

        header.append(identity, progress);
        main.prepend(header);
    }

    function start() {
        const params = new URLSearchParams(global.location.search);
        const testType = String(params.get("testType") || "mocktest").toLowerCase();
        const header = document.querySelector("#user-view .cbt-header");
        const current = getCurrentStep();
        const isPracticeTest = testType === "practicetest"
            || testType === "practice"
            || (header && !params.has("testType") && params.get("fullTest") !== "true"
                && /^practice\s+test\b/i.test(header.querySelector(".package-01-jan")?.textContent.trim() || ""));
        if (isPracticeTest) return;
        if (global.location.pathname.toLowerCase().endsWith("/full-test-summary.html")) {
            if (params.get("fullTest") === "true") installCompleteSummary();
            return;
        }
        if (!header || !current || header.dataset.mockTestHeader === "true") return;
        install(header, current);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})(window);
