import { db } from "./js/firebase-config.js";
import { subscribeCommunity } from "./js/community.js?v=20261031-post-privacy";
import { subscribeContacts, requestConnection, acceptConnection, removeConnection } from "./js/messaging.js?v=20261031-social-profile";
import { onValue, ref, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { resolveDisplayName } from "./js/account-menu.js?v=20261030-prefs";
import { safeMediaURL, relativeTime } from "./js/community-model.js";
import { profileSummary, validateCommunityProfile } from "./js/profile-model.js";

const $ = (id) => document.getElementById(id);
const requestedUid = new URLSearchParams(location.search).get("uid");
const tr = (text) => window.QCPrefs?.t(text) || text;
window.QCPrefs?.addTranslations("id", {
    "Community profile": "Profil komunitas", "English learner": "Pelajar bahasa Inggris",
    "Location not shared": "Lokasi tidak dibagikan", "Recent posts": "Postingan terbaru",
    "Connections": "Koneksi", "Mutual connections": "Koneksi bersama", "Connect": "Hubungkan",
    "Connected": "Terhubung", "Request sent": "Permintaan terkirim", "Accept request": "Terima permintaan",
    "Message": "Pesan", "Account settings": "Pengaturan akun", "Community": "Komunitas",
    "Posts": "Postingan", "About": "Tentang", "Activity": "Aktivitas", "Achievements": "Pencapaian",
    "Recent activity": "Aktivitas terbaru", "Community achievements": "Pencapaian komunitas",
    "Milestones based on posts and connections visible to you.": "Pencapaian berdasarkan postingan dan koneksi yang terlihat oleh Anda.",
    "About me": "Tentang saya", "Edit": "Edit", "Bio": "Bio",
    "Location (optional)": "Lokasi (opsional)", "Interests (comma separated, up to 8)": "Minat (pisahkan dengan koma, maksimal 8)",
    "Share my connections on my profile": "Bagikan koneksi saya di profil",
    "These details are public. Do not include your email or other private information.": "Informasi ini bersifat publik. Jangan sertakan email atau informasi pribadi lainnya.",
    "Save": "Simpan", "Cancel": "Batal", "Connection requests": "Permintaan koneksi",
    "View all": "Lihat semua", "No pending requests.": "Tidak ada permintaan tertunda.",
    "No approved connections yet.": "Belum ada koneksi yang disetujui.",
    "Connections are not shared on this profile.": "Koneksi tidak dibagikan di profil ini.",
    "No connections to show yet.": "Belum ada koneksi untuk ditampilkan.",
    "Your connections": "Koneksi Anda", "Accept": "Terima", "Decline": "Tolak",
    "No bio shared yet.": "Belum ada bio yang dibagikan.",
    "Learning English, one practice session at a time.": "Belajar bahasa Inggris melalui latihan.",
    "No recent activity visible to you.": "Tidak ada aktivitas terbaru yang terlihat oleh Anda.",
    "Share a post or make a connection to reach your first milestone.": "Bagikan postingan atau buat koneksi untuk pencapaian pertama Anda.",
    "First contribution": "Kontribusi pertama", "Curious learner": "Pelajar yang ingin tahu",
    "Learning together": "Belajar bersama", "Regular contributor": "Kontributor aktif",
    "Shared a post with the community.": "Membagikan postingan ke komunitas.",
    "Asked the community a question.": "Mengajukan pertanyaan ke komunitas.",
    "Made an approved connection.": "Membuat koneksi yang disetujui.",
    "At least 10 posts in the recent feed.": "Minimal 10 postingan di feed terbaru.",
    "Profile updated.": "Profil diperbarui.", "Public": "Publik", "Friends only": "Hanya teman"
});
document.querySelectorAll(".profile-page button, .profile-page label, .profile-page a, .profile-page h1, .profile-page h2, .profile-page p, .profile-stats span").forEach((el) => {
    [...el.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim()).forEach((child) => {
        const span = document.createElement("span");
        span.textContent = child.textContent;
        span.dataset.i18n = child.textContent.trim();
        child.replaceWith(span);
    });
});
window.QCPrefs?.apply();
const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
};
let state = { uid: null, posts: {}, profiles: {}, profile: {} };
let targetUid = "";
let details = {};
let contacts = {};
let connections = {};
let stopDetails;
let stopContacts;
let stopConnections;
let stopOwnIndex;
let generation = 0;
let shareIndex = false;
let connectionBusy = false;
let profileReady = false;
let contactsReady = false;
let ownIndex = null;
let lastIndexAttempt = "";
const report = (error) => {
    console.error("[CommunityProfile]", error);
    $("profileSocialStatus").textContent = tr(error.message || "Profile could not load. Refresh to retry.");
    $("profileSocialStatus").dataset.error = "true";
};
function text(id, value) { $(id).textContent = value; }
function person(uid) {
    if (uid === state.uid) return { ...state.profiles[uid], displayName: resolveDisplayName(state.user, state.profile), photoURL: state.user?.photoURL || state.profile.photoURL || "" };
    return state.profiles[uid] || { displayName: tr("Community learner") };
}
function avatar(uid, className = "profile-mini-avatar") {
    const profile = person(uid);
    const url = safeMediaURL(profile.photoURL);
    const el = node(url ? "img" : "span", className, url ? undefined : profile.displayName.slice(0, 1).toUpperCase());
    if (url) {
        el.src = url;
        el.alt = "";
        el.addEventListener("error", () => el.replaceWith(node("span", className, profile.displayName.slice(0, 1).toUpperCase())), { once: true });
    }
    return el;
}
function tags(id) {
    $(id).replaceChildren(...String(details.interests || "").split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => node("span", "profile-tag", tag)));
}
function action(label, fn, primary = false) {
    const button = node("button", `profile-button profile-button-small${primary ? " profile-button-primary" : ""}`, tr(label));
    button.type = "button";
    button.addEventListener("click", async () => {
        button.disabled = true;
        try { await fn(); } catch (error) { report(error); } finally { button.disabled = false; }
    });
    return button;
}
function personRow(uid, request = false) {
    const row = node("div", "profile-person");
    const copy = node("div");
    const link = node("a", "", person(uid).displayName);
    link.href = `profile.html?uid=${encodeURIComponent(uid)}`;
    copy.append(link);
    if (request) {
        const actions = node("div", "profile-actions");
        actions.append(action("Accept", () => acceptConnection(uid), true), action("Decline", () => removeConnection(uid)));
        copy.append(actions);
    }
    row.append(avatar(uid), copy);
    return row;
}
function showTab(id, focus = false) {
    document.querySelectorAll("[data-profile-tab]").forEach((tab) => {
        const selected = tab.dataset.profileTab === id;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        $(tab.dataset.profileTab).hidden = !selected;
        if (selected && focus) tab.focus();
    });
}
function render() {
    if (!targetUid) return;
    const own = targetUid === state.uid;
    const profile = person(targetUid);
    const summary = profileSummary(state.posts, targetUid, own ? Object.fromEntries(Object.entries(contacts).filter(([, contact]) => contact.status === "connected").map(([uid]) => [uid, true])) : connections, contacts);
    text("profileDisplayName", profile.displayName);
    text("profileLevel", profile.level ? `Level ${profile.level}` : tr("English learner"));
    text("profileLocation", details.location || profile.nationality || tr("Location not shared"));
    text("profileIntro", details.bio || tr("Learning English, one practice session at a time."));
    text("profileBio", details.bio || tr("No bio shared yet."));
    text("profileAboutText", details.bio || tr("No bio shared yet."));
    tags("profileInterests");
    tags("profileAboutInterests");
    const portrait = $("profilePortrait");
    const image = avatar(targetUid, "");
    portrait.replaceChildren(image);
    portrait.dataset.online = String(Object.values(profile.presence || {}).some((value) => value === true));
    portrait.setAttribute("title", tr(portrait.dataset.online === "true" ? "Online" : "Offline"));
    text("profilePostCount", summary.recent.length);
    text("profileConnectionCount", !own && !details.shareConnections ? "\u2014" : summary.peers.length);
    text("profileMutualCount", own || !details.shareConnections ? "\u2014" : summary.mutual.length);
    $("profileSettings").hidden = !own;
    $("profileEditAbout").hidden = !own || !profileReady;
    $("acctPage").hidden = !own;
    $("profileRequestsCard").hidden = !own;
    $("profileMessage").hidden = own || !state.uid;
    $("profileMessage").href = `message.html?to=${encodeURIComponent(targetUid)}`;
    const status = contacts[targetUid]?.status;
    $("profileConnect").hidden = own || !state.uid;
    $("profileConnect").disabled = connectionBusy || status === "connected" || status === "outgoing";
    text("profileConnect", tr(status === "connected" ? "Connected" : status === "outgoing" ? "Request sent" : status === "incoming" ? "Accept request" : "Connect"));
    $("profileConnect").prepend(node("i", `ti ti-${status === "connected" ? "user-check" : "user-plus"}`));
    const incoming = Object.entries(contacts).filter(([, contact]) => contact.status === "incoming").map(([uid]) => uid);
    text("profileRequestCount", incoming.length);
    $("profileRequests").replaceChildren(...(incoming.length ? incoming.slice(0, 3).map((uid) => personRow(uid, true)) : [node("p", "profile-muted", tr("No pending requests."))]));
    $("profileConnectionList").replaceChildren(...(summary.peers.length ? summary.peers.map((uid) => personRow(uid)) : [node("p", "profile-muted", tr(!own && !details.shareConnections ? "Connections are not shared on this profile." : "No approved connections yet."))]));
    text("profileMutualHeading", tr(own ? "Your connections" : "Mutual connections"));
    const mutual = own ? summary.peers : summary.mutual;
    $("profileMutualList").replaceChildren(...(mutual.length ? mutual.slice(0, 4).map((uid) => personRow(uid)) : [node("p", "profile-muted", tr(!own && !details.shareConnections ? "Connections are not shared on this profile." : "No connections to show yet."))]));
    $("profileActivityList").replaceChildren(...(summary.recent.length ? summary.recent.slice(0, 20).map((post) => {
        const row = node("div", "profile-activity");
        const copy = node("div");
        const link = node("a", "", post.title);
        link.href = `social.html#post-${post.id}`;
        const time = node("time", "", relativeTime(post.createdAt, Date.now(), window.QCPrefs?.locale() || "en"));
        copy.append(link, time, node("span", "profile-muted", tr(post.visibility === "friends" ? "Friends only" : "Public")));
        row.append(node("i", "ti ti-edit"), copy);
        return row;
    }) : [node("p", "profile-muted", tr("No recent activity visible to you."))]));
    $("profileAchievementList").replaceChildren(...(summary.achievements.length ? summary.achievements.map((achievement) => {
        const row = node("div", "profile-activity");
        const copy = node("div");
        copy.append(node("strong", "", tr(achievement.title)), node("p", "profile-muted", tr(achievement.description)));
        row.append(node("i", `ti ti-${achievement.icon}`), copy);
        return row;
    }) : [node("p", "profile-muted", tr("Share a post or make a connection to reach your first milestone."))]));
}
function listenConnections() {
    const allowed = state.uid && targetUid && targetUid !== state.uid && details.shareConnections === true;
    if (Boolean(allowed) === shareIndex) return;
    stopConnections?.();
    connections = {};
    shareIndex = Boolean(allowed);
    if (allowed) stopConnections = onValue(ref(db, `community_connections/${targetUid}`), (snapshot) => { connections = snapshot.val() || {}; render(); }, report);
}
async function syncConnectionIndex(version) {
    if (!contactsReady || ownIndex === null || !state.uid || version !== generation) return;
    const changes = {};
    for (const [uid, contact] of Object.entries(contacts)) if (contact.status === "connected" && ownIndex[uid] !== true) changes[uid] = true;
    for (const uid of Object.keys(ownIndex)) if (contacts[uid]?.status !== "connected") changes[uid] = null;
    if (!Object.keys(changes).length) return;
    const signature = JSON.stringify(changes);
    if (signature === lastIndexAttempt) return;
    lastIndexAttempt = signature;
    try { await update(ref(db, `community_connections/${state.uid}`), changes); } catch (error) { if (version === generation) report(error); }
}
const stopCommunity = subscribeCommunity((next) => {
    const changed = state.uid !== next.uid || !targetUid;
    state = next;
    if (requestedUid && /[.#$/\[\]]/.test(requestedUid)) { report(new Error("Invalid profile link.")); return; }
    if (changed) {
        const version = ++generation;
        stopDetails?.(); stopContacts?.(); stopConnections?.(); stopOwnIndex?.();
        shareIndex = false;
        contacts = {}; connections = {}; details = {}; profileReady = false;
        contactsReady = false; ownIndex = null; lastIndexAttempt = "";
        targetUid = requestedUid || next.uid || "";
        if (!targetUid) { report(new Error("Sign in to view your profile.")); return; }
        const src = `social.html?profile=${encodeURIComponent(targetUid)}&embedded=1`;
        if ($("profileFeed").getAttribute("src") !== src) $("profileFeed").src = src;
        stopDetails = onValue(ref(db, `community_profiles/${targetUid}`), (snapshot) => {
            if (version !== generation) return;
            details = snapshot.val() || {};
            profileReady = true;
            listenConnections();
            render();
        }, report);
        if (next.uid) {
            stopContacts = subscribeContacts(next.uid, (value) => {
                if (version !== generation) return;
                contacts = value;
                contactsReady = true;
                syncConnectionIndex(version);
                render();
            }, report);
            // Backfill only this user's existing approved connections; rules verify both sides.
            stopOwnIndex = onValue(ref(db, `community_connections/${next.uid}`), (snapshot) => {
                if (version !== generation) return;
                ownIndex = snapshot.val() || {};
                syncConnectionIndex(version);
            }, report);
        }
    }
    render();
}, report);
$("profileConnect").addEventListener("click", async () => {
    if (connectionBusy || !state.uid) return;
    connectionBusy = true; render();
    try { await (contacts[targetUid]?.status === "incoming" ? acceptConnection(targetUid) : requestConnection(targetUid)); } catch (error) { report(error); } finally { connectionBusy = false; render(); }
});
$("profileSettings").addEventListener("click", () => $("acctPage").scrollIntoView({ block: "start", behavior: "instant" }));
$("profileViewConnections").addEventListener("click", () => showTab("profileConnections", true));
const tabs = [...document.querySelectorAll("[data-profile-tab]")];
tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => showTab(tab.dataset.profileTab));
    tab.addEventListener("keydown", (event) => {
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        if (next !== undefined) { event.preventDefault(); showTab(tabs[next].dataset.profileTab, true); }
    });
});
$("profileEditAbout").addEventListener("click", () => {
    $("profileBioInput").value = details.bio || "";
    $("profileLocationInput").value = details.location || "";
    $("profileInterestsInput").value = details.interests || "";
    $("profileShareConnections").checked = details.shareConnections === true;
    $("profileBioForm").hidden = false;
    $("profileBioInput").focus();
});
$("profileBioCancel").addEventListener("click", () => { $("profileBioForm").hidden = true; });
$("profileBioForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.uid || state.uid !== targetUid) { report(new Error("You can only edit your own profile.")); return; }
    $("profileBioSave").disabled = true;
    try {
        const value = validateCommunityProfile({ bio: $("profileBioInput").value, location: $("profileLocationInput").value, interests: $("profileInterestsInput").value, shareConnections: $("profileShareConnections").checked });
        await update(ref(db, `community_profiles/${state.uid}`), value);
        $("profileBioForm").hidden = true;
        text("profileSocialStatus", tr("Profile updated."));
        $("profileSocialStatus").dataset.error = "false";
    } catch (error) { report(error); } finally { $("profileBioSave").disabled = false; }
});
window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== $("profileFeed").contentWindow || event.data?.type !== "qc:profile-feed-height") return;
    if (Number.isFinite(event.data.height) && event.data.height > 0 && event.data.height < 100000) $("profileFeed").style.height = `${Math.ceil(event.data.height)}px`;
});
function sendTheme() { $("profileFeed").contentWindow?.postMessage({ type: "qc:profile-theme", theme: document.documentElement.dataset.theme || "light" }, location.origin); }
$("profileFeed").addEventListener("load", sendTheme);
const themeObserver = new MutationObserver(sendTheme);
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
window.addEventListener("qc:langchange", render);
window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    generation++;
    stopCommunity(); stopDetails?.(); stopContacts?.(); stopConnections?.(); stopOwnIndex?.(); themeObserver.disconnect();
});
