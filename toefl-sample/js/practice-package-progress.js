import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { get, ref, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const GUEST_PROGRESS_KEY = "toefl_guest_practice_package_progress_v1";
const GUEST_ID_KEY = "toefl_guest_practice_user_id";

let userPromise;

function getFirebaseUser() {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    if (!userPromise) {
        userPromise = new Promise((resolve, reject) => {
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                unsubscribe();
                resolve(user);
            }, reject);
        });
    }
    return userPromise;
}

function getGuestId() {
    let guestId = localStorage.getItem(GUEST_ID_KEY);
    if (!guestId) {
        guestId = crypto.randomUUID();
        localStorage.setItem(GUEST_ID_KEY, guestId);
    }
    return guestId;
}

function getGuestProgressKey() {
    return `${GUEST_PROGRESS_KEY}_${getGuestId()}`;
}

function readGuestProgress() {
    const progress = JSON.parse(localStorage.getItem(getGuestProgressKey()) || "{}");
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
        throw new Error("Stored guest practice package progress is invalid");
    }
    return progress;
}

function normalizePackageNumbers(value) {
    return Object.keys(value || {})
        .map((packageNumber) => Number(packageNumber))
        .filter((packageNumber) => Number.isInteger(packageNumber) && packageNumber > 0)
        .sort((left, right) => left - right);
}

export async function getConsumedPracticePackages() {
    const user = await getFirebaseUser();
    if (!user) {
        return normalizePackageNumbers(readGuestProgress());
    }

    const snapshot = await get(ref(db, `users/${user.uid}/practicePackageProgress`));
    const progress = snapshot.exists() ? snapshot.val() : {};
    return normalizePackageNumbers(progress?.consumedPackages);
}

export async function markPracticePackageUsed(packageNumber) {
    const number = Number(packageNumber);
    if (!Number.isInteger(number) || number < 1) throw new Error("Invalid practice package number");
    const user = await getFirebaseUser();
    const usedAt = new Date().toISOString();

    if (!user) {
        const progressKey = getGuestProgressKey();
        const stored = readGuestProgress();
        stored[number] = { usedAt };
        localStorage.setItem(progressKey, JSON.stringify(stored));
        return;
    }

    await set(ref(db, `users/${user.uid}/practicePackageProgress/consumedPackages/${number}`), { usedAt });
}
