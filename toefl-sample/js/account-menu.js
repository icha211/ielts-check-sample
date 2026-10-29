import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const AUTH_STORAGE_KEYS = [
    "toefl_firebase_id_token",
    "toefl_firebase_id_token_expiry",
    "toefl_firebase_refresh_token",
    "toefl_firebase_auth_email",
    "toefl_firebase_auth_mode"
];

export async function signOutAndRedirect() {
    try {
        await signOut(auth);
    } finally {
        AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
        window.location.href = "signup.html";
    }
}

export function resolveDisplayName(user, profile = {}) {
    const first = profile.first_name || profile.firstName || "";
    const last = profile.last_name || profile.lastName || "";
    const full = `${first} ${last}`.trim();
    return full || user?.displayName || user?.email?.split("@")[0] || "Student";
}

export function resolvePlanLabel(subscription) {
    if (!subscription || typeof subscription !== "object") return "Free";
    const active = subscription.status ? ["active", "trialing"].includes(String(subscription.status).toLowerCase()) : true;
    const plan = String(subscription.plan || subscription.tier || "").trim();
    if (!active || !plan || plan.toLowerCase() === "free") return "Free";
    return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function paintAvatar(el, name, photoURL) {
    if (!el) return;
    el.textContent = "";
    if (photoURL) {
        const img = document.createElement("img");
        img.src = photoURL;
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => { el.textContent = name.charAt(0).toUpperCase(); }, { once: true });
        el.appendChild(img);
    } else {
        el.textContent = name.charAt(0).toUpperCase();
    }
}

export function initAccountMenu() {
    const doc = document;
    const avatarBtn = doc.getElementById("qcnavAccountBtn");
    const menu = doc.getElementById("qcnavAccountPanel");
    if (!avatarBtn || !menu) return;

    const els = {
        avatar: avatarBtn.querySelector(".qcnav-avatar"),
        menuAvatar: menu.querySelector("[data-account-avatar]"),
        name: menu.querySelector("[data-account-name]"),
        email: menu.querySelector("[data-account-email]"),
        plan: menu.querySelector("[data-account-plan]"),
        signedIn: menu.querySelectorAll("[data-account-signed-in]"),
        signedOut: menu.querySelectorAll("[data-account-signed-out]")
    };

    menu.querySelector("[data-account-logout]")?.addEventListener("click", (event) => {
        event.preventDefault();
        signOutAndRedirect();
    });

    let planLabel = "Free";
    const paintPlan = () => {
        if (els.plan) els.plan.textContent = window.QCPrefs ? window.QCPrefs.t(planLabel) : planLabel;
    };
    paintPlan();
    window.addEventListener("qc:langchange", paintPlan);

    let version = 0;
    onAuthStateChanged(auth, async (user) => {
        const current = ++version;
        els.signedIn.forEach((el) => { el.hidden = !user; });
        els.signedOut.forEach((el) => { el.hidden = Boolean(user); });

        if (!user) {
            paintAvatar(els.avatar, "U", "");
            avatarBtn.setAttribute("aria-label", "Account menu");
            return;
        }

        let profile = {};
        let subscription = null;
        const [profileResult, subscriptionResult] = await Promise.allSettled([
            get(ref(db, `users/${user.uid}`)),
            get(ref(db, `subscriptions/${user.uid}`))
        ]);
        if (current !== version) return;
        if (profileResult.status === "fulfilled" && profileResult.value.exists()) profile = profileResult.value.val() || {};
        if (subscriptionResult.status === "fulfilled" && subscriptionResult.value.exists()) subscription = subscriptionResult.value.val();

        const name = resolveDisplayName(user, profile);
        const photo = user.photoURL || profile.photoURL || "";
        paintAvatar(els.avatar, name, photo);
        paintAvatar(els.menuAvatar, name, photo);
        if (els.name) els.name.textContent = name;
        if (els.email) els.email.textContent = user.email || "";
        planLabel = resolvePlanLabel(subscription);
        paintPlan();
        avatarBtn.setAttribute("aria-label", `Account menu for ${name}`);
    });
}
