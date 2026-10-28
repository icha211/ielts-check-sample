import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { onDisconnect, onValue, push, ref, remove, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let currentUser = null;
let generation = 0;
let stopProfile = null;
let stopConnection = null;
let session = null;
let visible = false;
let lastProfile = "";
let profileWrites = Promise.resolve();

function reportError(error) {
    console.error("[PartnerDirectory] Could not update live partner directory:", error);
    window.dispatchEvent(new CustomEvent("toefl-partner-directory-error", {
        detail: { message: "Live partner updates are unavailable. Check your connection and try again." }
    }));
}

export function createPartnerProfile(user, data) {
    const fullName = `${data.first_name || data.firstName || ""} ${data.last_name || data.lastName || ""}`.trim();
    return {
        displayName: String(fullName || user.displayName || "Learner").slice(0, 80),
        nationality: String(data.nationality || data.country || "").slice(0, 60),
        level: String(data.cefrLevel || data.cefr_level || "").slice(0, 16),
        photoURL: String(user.photoURL || data.photoURL || "").slice(0, 2048)
    };
}

function stopPresence() {
    if (stopConnection) stopConnection();
    stopConnection = null;
    const previous = session;
    session = null;
    if (previous) remove(previous).catch(reportError);
}

function startPresence(user, version) {
    if (stopConnection) return;
    stopConnection = onValue(ref(db, ".info/connected"), (snapshot) => {
        if (snapshot.val() !== true || !visible || generation !== version) return;
        const connection = push(ref(db, `partnerDirectory/${user.uid}/presence`));
        session = connection;
        const disconnect = onDisconnect(connection);
        disconnect.remove().then(async () => {
            if (!visible || generation !== version || session !== connection) {
                await disconnect.cancel();
                return;
            }
            await update(ref(db), { [`partnerDirectory/${user.uid}/presence/${connection.key}`]: true });
            if (!visible || generation !== version || session !== connection) await remove(connection);
        }).catch(reportError);
    }, reportError);
}

export async function setPartnerVisibility(isVisible) {
    const user = currentUser;
    if (!user) throw new Error("Sign in before changing partner visibility.");
    await update(ref(db, `users/${user.uid}`), { partnerDirectoryHidden: !isVisible });
}

onAuthStateChanged(auth, (user) => {
    generation += 1;
    const version = generation;
    if (stopProfile) stopProfile();
    stopProfile = null;
    stopPresence();
    currentUser = user;
    visible = false;
    lastProfile = "";
    if (!user) return;

    stopProfile = onValue(ref(db, `users/${user.uid}`), (snapshot) => {
        if (generation !== version) return;
        const data = snapshot.val() || {};
        visible = data.partnerDirectoryHidden !== true;
        const profile = visible ? createPartnerProfile(user, data) : null;
        const signature = JSON.stringify(profile);
        window.dispatchEvent(new CustomEvent("toefl-partner-visibility", {
            detail: { uid: user.uid, visible }
        }));
        if (!visible) stopPresence();
        if (signature === lastProfile) return;
        lastProfile = signature;
        profileWrites = profileWrites.then(async () => {
            if (generation !== version || lastProfile !== signature) return;
            if (profile) {
                await update(ref(db, `partnerDirectory/${user.uid}`), profile);
                if (generation === version && visible) startPresence(user, version);
            } else {
                await remove(ref(db, `partnerDirectory/${user.uid}`));
            }
        }).catch((error) => {
            if (generation === version) lastProfile = "";
            reportError(error);
        });
    }, reportError);
}, reportError);
