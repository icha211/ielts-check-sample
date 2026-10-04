(function () {
    "use strict";

    const HISTORY_PREFIX = "toefl_test_history_v1_";
    const SECTION_TITLES = {
        listening: "Listening Comprehension",
        structure: "Structure & Writing",
        reading: "Reading Comprehension"
    };

    function getOwnerId() {
        try {
            const token = localStorage.getItem("toefl_firebase_id_token") || "";
            const payload = token.split(".")[1];
            if (payload) {
                const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
                const userId = claims.user_id || claims.sub || claims.email;
                if (userId) return String(userId);
            }
        } catch (_) {}
        return "this-browser";
    }

    function getStorageKey() {
        return HISTORY_PREFIX + encodeURIComponent(getOwnerId());
    }

    function parseAttempts(raw) {
        try {
            const data = JSON.parse(raw || "[]");
            return Array.isArray(data) ? data.filter((item) => item && typeof item === "object") : [];
        } catch (_) {
            return [];
        }
    }

    function readAttempts() {
        const key = getStorageKey();
        const attempts = parseAttempts(localStorage.getItem(key));
        attempts.sort((left, right) => Date.parse(right.submittedAt || right.recordedAt || 0) - Date.parse(left.submittedAt || left.recordedAt || 0));
        return attempts;
    }

    function createAttempt(result, sectionKey) {
        const params = new URLSearchParams(window.location.search);
        const timestamp = new Date().toISOString();
        const testType = String(result.testType || params.get("testType") || "mocktest").toLowerCase();
        return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            sectionKey,
            sectionTitle: SECTION_TITLES[sectionKey] || result.sectionTitle || "TOEFL ITP",
            setId: String(result.setId || params.get("setId") || ""),
            setDate: String(result.setDate || params.get("setDate") || ""),
            testType: testType.includes("practice") ? "practicetest" : "mocktest",
            runMode: String(result.runMode || params.get("runMode") || params.get("practiceMode") || "full"),
            submittedAt: String(result.submittedAt || timestamp),
            recordedAt: timestamp,
            totalQuestions: Number(result.totalQuestions) || (Array.isArray(result.questions) ? result.questions.length : 0),
            rawScore: Number(result.rawScore) || 0,
            scaledScore: Number(result.scaledScore) || 0
        };
    }

    function writeAttempts(key, attempts) {
        try {
            localStorage.setItem(key, JSON.stringify(attempts.slice(-250)));
            window.dispatchEvent(new CustomEvent("toefl-test-history-updated", { detail: { key } }));
        } catch (error) {
            console.warn("[TestHistory] Could not save attempt history:", error);
        }
    }

    function record(result) {
        if (!result || typeof result !== "object") return null;
        const sectionKey = String(result.sectionKey || "").toLowerCase();
        if (!SECTION_TITLES[sectionKey]) return null;
        const key = getStorageKey();
        const attempts = parseAttempts(localStorage.getItem(key));
        const attempt = createAttempt(result, sectionKey);
        attempts.push(attempt);
        writeAttempts(key, attempts);
        return attempt;
    }

    function subscribe(callback) {
        const key = getStorageKey();
        const onStorage = (event) => {
            if (event.key === key) callback(readAttempts());
        };
        const onUpdate = (event) => {
            if (!event.detail || event.detail.key === key) callback(readAttempts());
        };
        window.addEventListener("storage", onStorage);
        window.addEventListener("toefl-test-history-updated", onUpdate);
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("toefl-test-history-updated", onUpdate);
        };
    }

    window.toeflTestHistory = { readAttempts, record, subscribe };
})();
