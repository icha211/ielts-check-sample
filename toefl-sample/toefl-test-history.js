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
            localStorage.setItem(key, JSON.stringify(sorted.slice(0, MAX_LOCAL_ATTEMPTS).map((attempt) => {
                if (!attempt.syncedAt) return attempt;
                const { result, ...summary } = attempt;
                return summary;
            })));
        } catch (error) {
            console.warn("[TestHistory] Could not cache attempt history locally:", error);
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
        const attempt = {
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
            scaledScore: Number(result.scaledScore) || 0,
            result: sanitizeForFirebase(result)
        };
        return attempt;
    }

    function getLegacyAttempts(uid) {
        const attempts = readLocalAttempts(getStorageKey(uid));
        if (uid !== GUEST_OWNER) attempts.push(...readLocalAttempts(getStorageKey(GUEST_OWNER)));
        return sortAttempts(attempts);
    }

    function startRemoteSync(uid, modules) {
        if (unsubscribeRemote) unsubscribeRemote();
        currentUid = uid;
        cloudAttempts = getLegacyAttempts(uid);
        const historyRef = modules.ref(modules.db, `user_test_history/${uid}`);
        const localKey = getStorageKey(uid);
        const guestKey = getStorageKey(GUEST_OWNER);

        setSyncStatus("syncing", "Syncing test history to your account...");
        unsubscribeRemote = modules.onValue(historyRef, (snapshot) => {
            if (currentUid !== uid) return;
            const remoteData = snapshot.val() || {};
            const syncedAt = new Date().toISOString();
            const remoteAttempts = Object.values(remoteData)
                .filter((attempt) => attempt && typeof attempt === "object" && typeof attempt.id === "string")
                .map((attempt) => ({ ...attempt, syncedAt: attempt.syncedAt || syncedAt }));
            const merged = new Map(remoteAttempts.map((attempt) => [attempt.id, attempt]));
            const localAttempts = getLegacyAttempts(uid);
            localAttempts.forEach((attempt) => {
                const remoteAttempt = merged.get(attempt.id);
                if (!remoteAttempt || (attempt.result && !remoteAttempt.result)) {
                    merged.set(attempt.id, attempt);
                }
            });
            cloudAttempts = sortAttempts(Array.from(merged.values()));
            publishAttempts(cloudAttempts, localKey);

            const pendingWrites = localAttempts
                .filter((attempt) => {
                    const remoteAttempt = remoteAttempts.find((item) => item.id === attempt.id);
                    return !remoteAttempt || (attempt.result && !remoteAttempt.result);
                })
                .map(async (attempt) => {
                    await modules.set(modules.ref(modules.db, `user_test_history/${uid}/${attempt.id}`), attempt);
                    attempt.syncedAt = new Date().toISOString();
                });

            Promise.all(pendingWrites).then(() => {
                if (currentUid !== uid) return;
                if (localAttempts.length && localStorage.getItem(guestKey)) {
                    localStorage.removeItem(guestKey);
                }
                cloudAttempts = cloudAttempts.map((attempt) => ({
                    ...attempt,
                    syncedAt: attempt.syncedAt || new Date().toISOString()
                }));
                publishAttempts(cloudAttempts, localKey);
                setSyncStatus("synced", "Test history is synced to your account.");
            }).catch((error) => {
                if (currentUid !== uid) return;
                console.error("[TestHistory] Could not sync saved attempts:", error);
                setSyncStatus("error", "Test history could not sync. Your attempts are saved on this device.");
            });
        }, (error) => {
            if (currentUid !== uid) return;
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
                    console.error("[TestHistory] Firebase authentication state failed:", error);
                    setSyncStatus("error", "Could not connect to your account history.");
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
        if (!result || typeof result !== "object") return null;
        const sectionKey = String(result.sectionKey || "").toLowerCase();
        if (!SECTION_TITLES[sectionKey]) return null;

        const attempt = createAttempt(result, sectionKey);
        const key = getStorageKey();
        const attempts = readLocalAttempts(key);
        attempts.unshift(attempt);
        if (currentUid) {
            cloudAttempts = sortAttempts([attempt, ...cloudAttempts.filter((item) => item.id !== attempt.id)]);
        }
        publishAttempts(attempts, key);

        await initializeFirebase();
        if (!currentUid) return attempt;

        try {
            await firebaseModules.set(
                firebaseModules.ref(firebaseModules.db, `user_test_history/${currentUid}/${attempt.id}`),
                attempt
            );
            if (currentUid) {
                attempt.syncedAt = new Date().toISOString();
                cloudAttempts = sortAttempts([attempt, ...cloudAttempts.filter((item) => item.id !== attempt.id)]);
                publishAttempts(cloudAttempts);
                setSyncStatus("synced", "Test history is synced to your account.");
            }
        } catch (error) {
            console.error("[TestHistory] Could not save attempt to Firebase:", error);
            setSyncStatus("error", "This attempt is saved on this device but could not sync to your account.");
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
        record,
        subscribe,
        subscribeSync
    };
    initializeFirebase();
})();
