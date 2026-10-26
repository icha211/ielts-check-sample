(function (global) {
    "use strict";

    const instances = new WeakMap();
    let lucideLoadPromise;

    function renderLucideIcons() {
        if (global.lucide?.createIcons) {
            global.lucide.createIcons();
            return;
        }
        if (lucideLoadPromise) return;

        const script = document.createElement("script");
        script.src = "https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js";
        lucideLoadPromise = new Promise((resolve, reject) => {
            script.addEventListener("load", resolve, { once: true });
            script.addEventListener("error", () => reject(new Error("Lucide could not be loaded.")), { once: true });
            document.head.appendChild(script);
        }).then(() => {
            if (!global.lucide?.createIcons) throw new Error("Lucide loaded without its icon renderer.");
            global.lucide.createIcons();
        }).catch((error) => {
            lucideLoadPromise = null;
            console.error("[Question navigator] Unable to render Lucide icons:", error);
        });
    }

    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function createNavigator(options) {
        if (!options || !options.root || typeof options.getSections !== "function") {
            throw new TypeError("Question navigator requires a root element and section provider.");
        }

        const root = options.root;
        const existing = instances.get(root);
        if (existing) {
            existing.update(options);
            return existing;
        }

        const panel = root.closest("aside");
        if (!panel) throw new Error("Question navigator root must be inside an aside.");

        let config = options;
        root.classList.add("mocknav-question");

        function getToggleIconName(collapsed) {
            const isCompact = global.matchMedia("(max-width: 900px)").matches;
            if (isCompact) return collapsed ? "circle-chevron-up" : "circle-chevron-down";
            return collapsed ? "circle-chevron-right" : "circle-chevron-left";
        }

        function renderToggleIcon(toggle, collapsed) {
            toggle.innerHTML = `<i data-lucide="${getToggleIconName(collapsed)}" aria-hidden="true"></i>`;
            renderLucideIcons();
        }

        function render() {
            const sections = config.getSections();
            const items = sections.flatMap((section) => section.items);
            const answeredCount = items.filter((item) => item.answered).length;
            const remainingCount = items.length - answeredCount;
            const progress = items.length ? Math.round((answeredCount / items.length) * 100) : 0;
            const activeSectionId = sections.find((section) => section.active
                || section.items.some((item) => item.current))?.id || sections[0]?.id;
            const collapsed = panel.classList.contains("is-collapsed");

            root.innerHTML = `
                <div class="mocknav-question__toolbar">
                    <button class="mocknav-question__toggle" type="button"
                        aria-label="${collapsed ? "Expand" : "Collapse"} question navigator"
                        aria-expanded="${collapsed ? "false" : "true"}">
                        <i data-lucide="${getToggleIconName(collapsed)}" aria-hidden="true"></i>
                    </button>
                    <h1 class="mocknav-question__title">Question Navigator</h1>
                    <div class="mocknav-question__remaining" aria-label="${remainingCount} questions left">
                        <div class="mocknav-question__ring" style="--mocknav-progress:${progress}%">
                            <span>${remainingCount}</span>
                        </div>
                        <span class="mocknav-question__remaining-label">left</span>
                    </div>
                </div>
                <div class="mocknav-question__sections">
                    ${sections.map((section) => {
                        const total = section.items.length;
                        const answered = section.items.filter((item) => item.answered).length;
                        const sectionProgress = total ? Math.round((answered / total) * 100) : 0;
                        const firstQuestion = section.items.length ? section.items[0].number : 0;
                        const lastQuestion = section.items.length ? section.items[section.items.length - 1].number : 0;
                        const sectionClass = section.id === activeSectionId ? " is-current" : "";
                        const label = escapeHTML(section.label);
                        const shortLabel = escapeHTML(section.shortLabel || section.label);
                        const sectionId = escapeHTML(section.id);
                        const questionRange = `${escapeHTML(firstQuestion)}/${escapeHTML(lastQuestion)}`;

                        return `
                            <section class="mocknav-question__section${sectionClass}" aria-labelledby="mocknav-title-${sectionId}">
                                <button class="mocknav-question__compact" type="button" data-mocknav-section="${sectionId}"
                                    aria-label="${label}, questions ${escapeHTML(firstQuestion)} to ${escapeHTML(lastQuestion)}">
                                    <span class="mocknav-question__compact-name">${shortLabel}</span>
                                    <span class="mocknav-question__compact-count">${questionRange}</span>
                                </button>
                                <div class="mocknav-question__expanded">
                                    <h2 class="mocknav-question__section-title" id="mocknav-title-${sectionId}">${label}</h2>
                                    <div class="mocknav-question__section-summary">
                                        <span>${remainingCountForSection(section.items)} left</span>
                                        <span>${answered} of ${total} answered</span>
                                    </div>
                                    <div class="mocknav-question__progress" role="progressbar"
                                        aria-label="${label} answered" aria-valuemin="0" aria-valuemax="${total}"
                                        aria-valuenow="${answered}">
                                        <span style="width:${sectionProgress}%"></span>
                                    </div>
                                    <div class="mocknav-question__grid">
                                        ${section.items.map((item) => {
                                            const questionClass = item.answered ? "is-answered" : "is-unanswered";
                                            const currentClass = item.current ? " is-current" : "";
                                            const questionId = escapeHTML(item.uid);
                                            const number = escapeHTML(item.number);
                                            const state = item.answered ? "answered" : "unanswered";
                                            return `<button class="mocknav-question__question navigator-btn question-nav-btn ${questionClass}${currentClass}"
                                                type="button" data-uid="${questionId}" data-mocknav-question="${questionId}"
                                                aria-label="Question ${number}, ${state}"${item.current ? ' aria-current="step"' : ""}>${number}</button>`;
                                        }).join("")}
                                    </div>
                                </div>
                            </section>`;
                    }).join("")}
                </div>
                <div class="mocknav-question__legend" aria-label="Question status">
                    <span><i class="is-answered" aria-hidden="true"></i>Answered</span>
                    <span><i class="is-unanswered" aria-hidden="true"></i>Unanswered</span>
                </div>`;

            const toggle = root.querySelector(".mocknav-question__toggle");
            renderLucideIcons();
        }

        function remainingCountForSection(items) {
            return items.reduce((count, item) => count + (item.answered ? 0 : 1), 0);
        }

        root.addEventListener("click", (event) => {
            const toggle = event.target.closest(".mocknav-question__toggle");
            if (toggle) {
                if (typeof config.onToggle === "function") config.onToggle(event);
                const collapsed = panel.classList.contains("is-collapsed");
                toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
                toggle.setAttribute("aria-label", collapsed ? "Expand question navigator" : "Collapse question navigator");
                renderToggleIcon(toggle, collapsed);
                return;
            }

            const question = event.target.closest("[data-mocknav-question]");
            if (question && typeof config.onQuestionSelect === "function") {
                config.onQuestionSelect(question.dataset.mocknavQuestion);
                return;
            }

            const sectionButton = event.target.closest("[data-mocknav-section]");
            if (sectionButton && typeof config.onSectionSelect === "function") {
                const section = config.getSections().find((entry) => entry.id === sectionButton.dataset.mocknavSection);
                if (section) config.onSectionSelect(section);
            }
        });

        const instance = {
            refresh: render,
            update(nextOptions) {
                config = nextOptions;
                render();
            }
        };
        instances.set(root, instance);
        render();
        global.matchMedia("(max-width: 900px)").addEventListener("change", () => {
            const toggle = root.querySelector(".mocknav-question__toggle");
            if (toggle) renderToggleIcon(toggle, panel.classList.contains("is-collapsed"));
        });
        if (!panel.classList.contains("is-collapsed")
            && typeof config.onToggle === "function") {
            config.onToggle({ stopPropagation() {} });
            const toggle = root.querySelector(".mocknav-question__toggle");
            toggle.setAttribute("aria-expanded", "false");
            toggle.setAttribute("aria-label", "Expand question navigator");
            renderToggleIcon(toggle, true);
        }
        return { refresh: render };
    }

    global.MockQuestionNavigator = { create: createNavigator };
})(window);