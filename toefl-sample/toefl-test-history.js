(function () {
    "use strict";

    const HISTORY_PREFIX = "toefl_test_history_v1_";
    const GUEST_OWNER = "this-browser";
    const MAX_LOCAL_ATTEMPTS = 250;
    const SECTION_TITLES = {
        listening: "Listening Comprehension",
        structure: "Structure & Writing",
        reading: "Reading Comprehension"
    };

    let currentUid = null;
    let cloudAttempts = [];
    let unsubscribeRemote = null;
    let firebasePromise = null;
    let firebaseModules = null;
    let authGeneration = 0;
    let authReady = false;
    let pageAttemptId = null;
    const pendingWrites = new Map();
    let syncStatus = { state: "loading", message: "Connecting to your test history..." };

    function getStorageKey(owner = currentUid || GUEST_OWNER) {
        return HISTORY_PREFIX + encodeURIComponent(owner);
    }

    function parseAttempts(raw) {
        try {
            const data = JSON.parse(raw || "[]");
            return Array.isArray(data) ? data.filter((item) => item && typeof item === "object") : [];
        } catch (error) {
            console.warn("[TestHistory] Stored attempt history is invalid:", error);
            return [];
        }
    }

    function sortAttempts(attempts) {
        return attempts.sort((left, right) =>
            Date.parse(right.recordedAt || right.submittedAt || 0) -
            Date.parse(left.recordedAt || left.submittedAt || 0)
        );
    }

    function readLocalAttempts(key = getStorageKey()) {
        return sortAttempts(parseAttempts(localStorage.getItem(key)));
    }

    function getAttempts() {
        if (!authReady) return [];
        return currentUid ? cloudAttempts : readLocalAttempts();
    }

    function dispatchHistoryUpdate() {
        window.dispatchEvent(new CustomEvent("toefl-test-history-updated", { detail: { owner: currentUid || GUEST_OWNER } }));
    }

    function setSyncStatus(state, message) {
        syncStatus = { state, message };
        window.dispatchEvent(new CustomEvent("toefl-test-history-sync", { detail: syncStatus }));
    }

    function publishAttempts(attempts, key = getStorageKey()) {
        const sorted = sortAttempts(attempts);
        try {
            const cached = sorted.filter((attempt) => !attempt.syncedAt)
                .concat(sorted.filter((attempt) => attempt.syncedAt).slice(0, MAX_LOCAL_ATTEMPTS));
            localStorage.setItem(key, JSON.stringify(cached.map((attempt) => {
                if (!attempt.syncedAt) return attempt;
                const { result, ...summary } = attempt;
                return summary;
            })));
        } catch (error) {
            console.warn("[TestHistory] Could not cache attempt history locally:", error);
            setSyncStatus("error", "History could not be saved on this device. Keep this page open until cloud sync completes.");
        }
        dispatchHistoryUpdate();
    }

    function sanitizeForFirebase(value) {
        if (value === null || typeof value === "string" || typeof value === "boolean") return value;
        if (typeof value === "number") return Number.isFinite(value) ? value : null;
        if (Array.isArray(value)) {
            return value.map((child) => {
                const sanitized = sanitizeForFirebase(child);
                return sanitized === undefined ? null : sanitized;
            });
        }
        if (typeof value !== "object") return undefined;

        const safeObject = {};
        Object.entries(value).forEach(([key, child]) => {
            if (/[.#$\/\[\]]/.test(key) || key === "__proto__" || child === undefined) return;
            safeObject[key] = sanitizeForFirebase(child);
        });
        return safeObject;
    }

    function createAttempt(result, sectionKey) {
        const params = new URLSearchParams(window.location.search);
        const timestamp = new Date().toISOString();
        const testType = String(result.testType || params.get("testType") || "mocktest").toLowerCase();
        const isFullMock = !testType.includes("practice") && params.get("fullTest") === "true";
        const requestedSessionId = isFullMock ? params.get("mockSessionId") : null;
        if (requestedSessionId && !/^[a-zA-Z0-9_-]{1,100}$/.test(requestedSessionId)) {
            throw new Error("Invalid mock test session ID.");
        }
        if (!pageAttemptId) pageAttemptId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const mockSessionId = isFullMock ? requestedSessionId || pageAttemptId : "";
        const attempt = {
            id: `${mockSessionId || pageAttemptId}-${sectionKey}`,
            schemaVersion: 2,
            mockSessionId,
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
            scaledScore: Number(result.scaledScore) || 0,
            result: sanitizeForFirebase(mockSessionId ? { ...result, mockSessionId } : result)
        };
        return attempt;
    }

    function getLegacyAttempts(uid) {
        return readLocalAttempts(getStorageKey(uid));
    }

    function getHistoryEntries() {
        const entries = [];
        const sessions = new Map();
        getAttempts().forEach((attempt) => {
            if (attempt.testType !== "mocktest" || !attempt.mockSessionId) {
                entries.push({ ...attempt, entryKind: "section", status: "completed" });
                return;
            }
            if (!sessions.has(attempt.mockSessionId)) sessions.set(attempt.mockSessionId, {});
            const sections = sessions.get(attempt.mockSessionId);
            const previous = sections[attempt.sectionKey];
            if (!previous || Date.parse(attempt.recordedAt) > Date.parse(previous.recordedAt)) {
                sections[attempt.sectionKey] = attempt;
            }
        });
        sessions.forEach((sections, sessionId) => {
            const sectionAttempts = sortAttempts(Object.values(sections));
            const complete = Object.keys(SECTION_TITLES).every((key) => sections[key]);
            entries.push({
                ...sectionAttempts[0],
                id: sessionId,
                entryKind: "full-mock",
                sectionTitle: "Listening, Structure & Reading",
                sectionKey: "",
                sectionAttempts,
                status: complete ? "completed" : "in-progress",
                totalQuestions: sectionAttempts.reduce((sum, attempt) => sum + attempt.totalQuestions, 0),
                rawScore: sectionAttempts.reduce((sum, attempt) => sum + attempt.rawScore, 0),
                scaledScore: complete
                    ? Math.round(sectionAttempts.reduce((sum, attempt) => sum + attempt.scaledScore, 0) * 10 / 3)
                    : null
            });
        });
        return sortAttempts(entries);
    }

    function restoreResults(entryId) {
        const entry = getHistoryEntries().find((item) => item.id === entryId);
        const attempts = entry && (entry.sectionAttempts || [entry]);
        if (!attempts || !attempts.every((attempt) => attempt.result && Array.isArray(attempt.result.questions))) {
            throw new Error("Saved answer details are unavailable for this result.");
        }
        const storageKeys = { listening: "toefl_section1_result", structure: "toefl_section2_result", reading: "toefl_section3_result" };
        Object.values(storageKeys).forEach((key) => localStorage.removeItem(key));
        attempts.forEach((attempt) => {
            localStorage.setItem(storageKeys[attempt.sectionKey], JSON.stringify(attempt.result));
        });
    }

    function saveRemoteAttempt(uid, generation, attempt, modules) {
        const writeKey = `${generation}:${uid}:${attempt.id}`;
        if (pendingWrites.has(writeKey)) return pendingWrites.get(writeKey);
        let saved = false;
        const promise = Promise.resolve().then(() => {
            if (generation !== authGeneration || currentUid !== uid) return;
            return modules.set(modules.ref(modules.db, `user_test_history/${uid}/${attempt.id}`), attempt).then(() => {
                saved = true;
                const syncedAttempt = { ...attempt, syncedAt: new Date().toISOString() };
                const key = getStorageKey(uid);
                const localAttempts = readLocalAttempts(key).filter((item) => item.id !== attempt.id);
                localAttempts.unshift(syncedAttempt);
                if (generation === authGeneration && currentUid === uid) {
                    cloudAttempts = sortAttempts([syncedAttempt, ...cloudAttempts.filter((item) => item.id !== attempt.id)]);
                }
                publishAttempts(localAttempts, key);
            });
        }).catch((error) => {
            console.error("[TestHistory] Could not save attempt to Firebase:", error);
            if (generation === authGeneration && currentUid === uid) {
                setSyncStatus("error", "This attempt could not sync. Check your connection; locally saved attempts retry when you reopen history.");
            }
        }).finally(() => {
            pendingWrites.delete(writeKey);
            if (saved && generation === authGeneration && currentUid === uid &&
                !readLocalAttempts(getStorageKey(uid)).some((item) => !item.syncedAt)) {
                setSyncStatus("synced", "Test history is synced to your account.");
            }
        });
        pendingWrites.set(writeKey, promise);
        return promise;
    }

    function startRemoteSync(uid, modules) {
        if (unsubscribeRemote) unsubscribeRemote();
        currentUid = uid;
        cloudAttempts = getLegacyAttempts(uid);
        const historyRef = modules.ref(modules.db, `user_test_history/${uid}`);
        const localKey = getStorageKey(uid);
        const generation = authGeneration;
        let isFirstSnapshot = true;

        setSyncStatus("syncing", "Syncing test history to your account...");
        dispatchHistoryUpdate();
        unsubscribeRemote = modules.onValue(historyRef, (snapshot) => {
            if (currentUid !== uid || generation !== authGeneration) return;
            const remoteData = snapshot.val() || {};
            const syncedAt = new Date().toISOString();
            const remoteAttempts = Object.values(remoteData)
                .filter((attempt) => attempt && typeof attempt === "object" && typeof attempt.id === "string")
                .map((attempt) => ({ ...attempt, syncedAt: attempt.syncedAt || syncedAt }));
            const merged = new Map(remoteAttempts.map((attempt) => [attempt.id, attempt]));
            const localAttempts = getLegacyAttempts(uid);
            localAttempts.forEach((attempt) => {
                const remoteAttempt = merged.get(attempt.id);
                const writing = pendingWrites.has(`${generation}:${uid}:${attempt.id}`);
                if ((!remoteAttempt && !attempt.syncedAt) ||
                    (!attempt.syncedAt && (writing || (attempt.result && !remoteAttempt?.result)))) {
                    merged.set(attempt.id, attempt);
                }
            });
            cloudAttempts = sortAttempts(Array.from(merged.values()));
            publishAttempts(cloudAttempts, localKey);

            if (isFirstSnapshot) {
                isFirstSnapshot = false;
                cloudAttempts.filter((attempt) => !attempt.syncedAt)
                    .forEach((attempt) => saveRemoteAttempt(uid, generation, attempt, modules));
            }
            if (!cloudAttempts.some((attempt) => !attempt.syncedAt)) {
                setSyncStatus("synced", "Test history is synced to your account.");
            }
        }, (error) => {
            if (currentUid !== uid || generation !== authGeneration) return;
            console.error("[TestHistory] Could not listen for history updates:", error);
            setSyncStatus("error", "Test history could not sync. Check your connection and account access.");
        });
    }

    function initializeFirebase() {
        if (!firebasePromise) {
            firebasePromise = Promise.all([
                import("./js/firebase-config.js"),
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"),
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js")
            ]).then(([config, authSdk, databaseSdk]) => new Promise((resolve) => {
                firebaseModules = {
                    db: config.db,
                    ref: databaseSdk.ref,
                    onValue: databaseSdk.onValue,
                    set: databaseSdk.set
                };
                authSdk.onAuthStateChanged(config.auth, (user) => {
                    authGeneration += 1;
                    authReady = true;
                    if (user) {
                        startRemoteSync(user.uid, firebaseModules);
                    } else {
                        if (unsubscribeRemote) unsubscribeRemote();
                        unsubscribeRemote = null;
                        currentUid = null;
                        cloudAttempts = [];
                        setSyncStatus("local", "Sign in to sync your test history across devices.");
                        dispatchHistoryUpdate();
                    }
                    resolve();
                }, (error) => {
                    if (unsubscribeRemote) unsubscribeRemote();
                    unsubscribeRemote = null;
                    authGeneration += 1;
                    authReady = false;
                    currentUid = null;
                    cloudAttempts = [];
                    console.error("[TestHistory] Firebase authentication state failed:", error);
                    setSyncStatus("error", "Could not connect to your account history.");
                    dispatchHistoryUpdate();
                    resolve();
                });
            })).catch((error) => {
                console.error("[TestHistory] Firebase history service could not start:", error);
                setSyncStatus("error", "Cloud history is unavailable. Attempts will remain on this device.");
            });
        }
        return firebasePromise;
    }

    async function record(result) {
        if (!result || typeof result !== "object") throw new TypeError("A test result is required.");
        const sectionKey = String(result.sectionKey || "").toLowerCase();
        if (!SECTION_TITLES[sectionKey]) throw new TypeError("Unknown test section.");

        const attempt = createAttempt(result, sectionKey);
        await initializeFirebase();
        const uid = currentUid;
        const generation = authGeneration;
        const key = getStorageKey(uid || GUEST_OWNER);
        const attempts = readLocalAttempts(key);
        const existing = attempts.find((item) => item.id === attempt.id);
        if (existing) return existing;
        attempts.unshift(attempt);
        if (uid) {
            cloudAttempts = sortAttempts([attempt, ...cloudAttempts.filter((item) => item.id !== attempt.id)]);
        }
        publishAttempts(attempts, key);

        if (uid) {
            setSyncStatus("syncing", "Saving your test result...");
            let timeout;
            await Promise.race([
                saveRemoteAttempt(uid, generation, attempt, firebaseModules),
                new Promise((resolve) => {
                    timeout = setTimeout(() => {
                        if (currentUid === uid && authGeneration === generation) {
                            setSyncStatus("error", "Cloud sync is still pending. Locally saved results will retry when you reopen history.");
                        }
                        resolve();
                    }, 5000);
                })
            ]);
            clearTimeout(timeout);
        }
        return attempt;
    }

    function subscribe(callback) {
        const onStorage = (event) => {
            if (event.key === getStorageKey()) callback(getAttempts());
        };
        const onUpdate = () => callback(getAttempts());
        window.addEventListener("storage", onStorage);
        window.addEventListener("toefl-test-history-updated", onUpdate);
        initializeFirebase();
        callback(getAttempts());
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("toefl-test-history-updated", onUpdate);
        };
    }

    function subscribeSync(callback) {
        const onStatus = (event) => callback(event.detail);
        window.addEventListener("toefl-test-history-sync", onStatus);
        callback(syncStatus);
        initializeFirebase();
        return () => window.removeEventListener("toefl-test-history-sync", onStatus);
    }

    window.toeflTestHistory = {
        readAttempts: getAttempts,
        readHistoryEntries: getHistoryEntries,
        restoreResults,
        record,
        subscribe,
        subscribeSync
    };
    initializeFirebase();
})();
