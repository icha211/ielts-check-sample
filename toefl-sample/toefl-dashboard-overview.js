(function () {
    "use strict";

    const SECTION_RESULTS = [
        { key: "toefl_section1_result", section: "listening", defaultTotal: 50 },
        { key: "toefl_section2_result", section: "structure", defaultTotal: 40 },
        { key: "toefl_section3_result", section: "reading", defaultTotal: 50 }
    ];
    const SCORE_GOAL = 550;
    const SCORE_MIN = 310;
    const SCORE_MAX = 677;

    function getNode(selector) {
        return document.querySelector(selector);
    }

    function setStat(name, value) {
        const node = getNode(`[data-dashboard-stat="${name}"]`);
        if (node) node.textContent = String(value);
    }

    function readSectionResults() {
        return SECTION_RESULTS.flatMap(({ key, section, defaultTotal }) => {
            let result;
            try {
                result = JSON.parse(localStorage.getItem(key) || "null");
            } catch (error) {
                console.warn(`[Dashboard] Could not read ${key}:`, error);
                return [];
            }
            if (!result || typeof result !== "object") return [];

            const storedScore = Number(result.scaledScore);
            const rawScore = Number(result.rawScore);
            const totalQuestions = Number(result.totalQuestions) || defaultTotal;
            const hasRawScore = result.rawScore !== null
                && result.rawScore !== undefined
                && Number.isFinite(rawScore)
                && totalQuestions > 0;
            const score = Number.isFinite(storedScore) && storedScore > 0
                ? storedScore
                : hasRawScore
                    ? Math.round(31 + (rawScore / totalQuestions) * (section === "reading" ? 36 : 37))
                    : null;

            return score === null ? [] : [{ ...result, score }];
        });
    }

    function getCefrLevel(score) {
        if (score < 337) return "<A2";
        if (score < 460) return "A2";
        if (score < 543) return "B1";
        if (score < 627) return "B2";
        return "C1";
    }

    function formatDate(value) {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    }

    function renderScore() {
        const results = readSectionResults();
        const scoreNode = getNode("#scoreText");
        const cefrNode = getNode("#cefrText");
        const dateNode = getNode("#scoreTestDate");
        const deltaNode = getNode("#scoreGoalDelta");
        const progress = getNode(".score-goal__track");
        const fill = getNode(".score-goal__fill");
        const bars = [...document.querySelectorAll(".score-summary__bars span")];

        if (!results.length) {
            if (scoreNode) scoreNode.textContent = "—";
            if (cefrNode) cefrNode.textContent = "";
            if (dateNode) dateNode.textContent = "Complete a test to see your score.";
            if (deltaNode) deltaNode.textContent = "No score yet";
            if (progress) progress.setAttribute("aria-valuenow", String(SCORE_MIN));
            if (fill) fill.style.width = "0%";
            bars.forEach((bar) => bar.style.setProperty("--bar-height", "6px"));
            return;
        }

        const score = Math.min(
            SCORE_MAX,
            Math.round((results.reduce((sum, result) => sum + result.score, 0) / results.length) * 10)
        );
        const latest = results
            .slice()
            .sort((left, right) => Date.parse(right.submittedAt || right.setDate || 0) - Date.parse(left.submittedAt || left.setDate || 0))[0];
        const latestDate = formatDate(latest.submittedAt || latest.setDate);
        const scoreRatio = Math.max(0, Math.min(1, (score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)));
        const progressWidth = `${scoreRatio * 100}%`;

        if (scoreNode) scoreNode.textContent = String(score);
        if (cefrNode) cefrNode.textContent = ` / ${getCefrLevel(score)}`;
        if (dateNode) {
            const sectionLabel = `${results.length} section score${results.length === 1 ? "" : "s"}`;
            const basis = results.length === SECTION_RESULTS.length
                ? `Based on ${sectionLabel}`
                : `Estimated from ${sectionLabel}`;
            dateNode.textContent = latestDate
                ? `${basis} · ${latestDate}`
                : basis;
        }
        if (deltaNode) {
            const difference = score - SCORE_GOAL;
            deltaNode.textContent = difference === 0
                ? "At your goal"
                : `${Math.abs(difference)} pts ${difference > 0 ? "above" : "to goal"}`;
        }
        if (progress) progress.setAttribute("aria-valuenow", String(score));
        if (fill) fill.style.width = progressWidth;
        bars.forEach((bar, index) => {
            const maxHeight = [22, 33, 45, 56][index];
            bar.style.setProperty("--bar-height", `${6 + scoreRatio * (maxHeight - 6)}px`);
        });
    }

    function renderActivity() {
        if (!window.toeflTestHistory) {
            setStat("mock-count", "—");
            setStat("practice-count", "—");
            setStat("activity-count", "—");
            return;
        }

        let attempts;
        try {
            attempts = window.toeflTestHistory.readAttempts();
        } catch (error) {
            console.error("[Dashboard] Could not load test history:", error);
            setStat("mock-count", "—");
            setStat("practice-count", "—");
            setStat("activity-count", "—");
            return;
        }

        const mockCount = attempts.filter((attempt) => attempt.testType === "mocktest").length;
        const practiceCount = attempts.filter((attempt) => attempt.testType === "practicetest").length;
        setStat("mock-count", mockCount);
        setStat("practice-count", practiceCount);
        setStat("activity-count", attempts.length);
    }

    function render() {
        renderScore();
        renderActivity();
    }

    render();
    if (window.toeflTestHistory) window.toeflTestHistory.subscribe(renderActivity);
    window.addEventListener("storage", (event) => {
        if (!event.key || SECTION_RESULTS.some(({ key }) => event.key === key)) renderScore();
    });
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) render();
    });
})();
