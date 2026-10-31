import { subscribeCommunity, subscribePostActivity, savePost, removePost, setPostLike, addComment, deleteComment, loadPrivateMedia } from "./js/community.js?v=20261031-post-privacy";
import { GROUPS, CATEGORIES, selectPosts, selectPeople, safeMediaURL, relativeTime } from "./js/community-model.js";
import { resolveDisplayName } from "./js/account-menu.js?v=20261030-prefs";

window.QCPrefs?.addTranslations("id", {
    "Audience": "Audiens",
    "Public": "Publik",
    "Friends only": "Hanya teman",
    "Anyone can read public posts, including signed-out visitors.": "Siapa pun dapat membaca postingan publik, termasuk pengunjung yang belum masuk.",
    "Only you and friends with accepted message connections can read this post.": "Hanya Anda dan teman dengan koneksi pesan yang diterima dapat membaca postingan ini.",
    "Audience cannot be changed after publishing. Create a new post instead.": "Audiens tidak dapat diubah setelah diterbitkan. Buat postingan baru.",
    "Posting to everyone": "Posting untuk semua orang",
    "Posting to {group}": "Posting ke {group}",
    "Groups organize posts, not who can see or reply to them.": "Grup mengatur postingan, bukan siapa yang dapat melihat atau membalasnya.",
    "Become a Tutor": "Jadi Tutor",
    "Share Your Knowledge, Earn Income": "Bagikan Pengetahuan, Dapatkan Penghasilan",
    "Join our platform and start teaching what you love.": "Bergabunglah dan mulai mengajar bidang yang Anda sukai.",
    "Tutor registration is not available yet.": "Pendaftaran tutor belum tersedia.",
    "Welcome to Quick Check Community!": "Selamat datang di Komunitas Quick Check!",
    "Welcome, {name}!": "Selamat datang, {name}!",
    "Share your progress, ask questions, and connect with learners on the same journey.": "Bagikan progres, ajukan pertanyaan, dan terhubung dengan sesama pelajar.",
    "Connect, share, and grow together with other English learners. Ask questions, get tips, and find your study buddies!": "Terhubung, berbagi, dan berkembang bersama pelajar bahasa Inggris lainnya. Ajukan pertanyaan, dapatkan tips, dan temukan teman belajar!",
    "Ask & Answer": "Tanya & Jawab", "Share Tips": "Bagikan Tips",
    "Find Study Buddies": "Temukan Teman Belajar", "Join Discussions": "Ikuti Diskusi",
    "Share something with the community": "Bagikan sesuatu dengan komunitas",
    "Share something with the community...": "Bagikan sesuatu dengan komunitas...",
    "What would you like to share, {name}?": "Apa yang ingin Anda bagikan, {name}?",
    "Post title": "Judul postingan", "Give your post a title": "Beri judul postingan Anda",
    "Category": "Kategori", "Community group": "Grup komunitas", "Everyone": "Semua orang",
    "Tips & Resources": "Tips & Sumber Belajar", "Questions": "Pertanyaan",
    "Study Buddies": "Teman Belajar", "Announcements": "Pengumuman",
    "Photo/Video": "Foto/Video", "Ask a Question": "Ajukan Pertanyaan", "Create a Post": "Buat Postingan",
    "Post": "Kirim", "All Posts": "Semua Postingan", "Sort posts": "Urutkan postingan",
    "Latest": "Terbaru", "Most liked": "Paling disukai", "Oldest": "Terlama",
    "Community Groups": "Grup Komunitas", "View All": "Lihat Semua", "Show Less": "Lihat Lebih Sedikit",
    "English General Discussion": "Diskusi Umum Bahasa Inggris", "Speaking Practice": "Latihan Speaking",
    "Writing Support": "Bantuan Writing", "Listening Tips": "Tips Listening", "Reading Strategies": "Strategi Reading",
    "People Online": "Pelajar Online", "Study Buddy Match": "Pencocokan Teman Belajar",
    "Find Study Buddy": "Cari Teman Belajar", "English learner": "Pelajar bahasa Inggris",
    "Community learner": "Pelajar komunitas", "Level {level}": "Level {level}",
    "{count} members": "{count} anggota", "{count} member": "{count} anggota",
    "Join": "Gabung", "Joined": "Bergabung", "Leave": "Keluar", "Online": "Online",
    "Sign in to join": "Masuk untuk bergabung", "Sign in to see online learners.": "Masuk untuk melihat pelajar online.",
    "Loading online learners...": "Memuat pelajar online...",
    "No other learners are online right now. Find a study buddy to connect later.": "Belum ada pelajar lain yang online. Cari teman belajar untuk dihubungi nanti.",
    "Find the perfect study buddy based on your goals and learning level.": "Temukan teman belajar sesuai tujuan dan level Anda.",
    "Find learners at level {level} and plan your next practice session together.": "Temukan pelajar di level {level} dan rencanakan latihan bersama.",
    "Search learners": "Cari pelajar", "Name, country, or learning level": "Nama, negara, atau level belajar",
    "Message a learner to connect and plan your next practice session.": "Kirim pesan untuk terhubung dan merencanakan latihan bersama.",
    "Learners at your level appear first. Send a message request to start practicing together.": "Pelajar dengan level yang sama ditampilkan lebih dulu. Kirim permintaan pesan untuk mulai berlatih bersama.",
    "No learners match your search. Try a different name or level.": "Tidak ada pelajar yang cocok. Coba nama atau level lain.",
    "Sign in to take part in the community.": "Masuk untuk berpartisipasi dalam komunitas.",
    "Sign in to find study buddies.": "Masuk untuk mencari teman belajar.",
    "Loading your community...": "Memuat komunitas Anda...", "You're connected to the community.": "Anda terhubung ke komunitas.",
    "You are offline. Reconnect before making changes.": "Anda sedang offline. Hubungkan kembali sebelum membuat perubahan.",
    "Community sync failed. Refresh to retry.": "Sinkronisasi komunitas gagal. Muat ulang untuk mencoba lagi.",
    "Your community starts here": "Komunitas Anda dimulai di sini",
    "Sign in to share posts, join groups, and find real study buddies.": "Masuk untuk berbagi postingan, bergabung dengan grup, dan mencari teman belajar.",
    "Start the conversation": "Mulai percakapan",
    "No posts here yet. Share a question, a useful tip, or your study goals.": "Belum ada postingan. Bagikan pertanyaan, tips, atau tujuan belajar Anda.",
    "See more": "Lihat selengkapnya", "Share": "Bagikan", "Link copied": "Tautan disalin",
    "Like post": "Sukai postingan", "Unlike post": "Batalkan suka", "Comments": "Komentar",
    "Add a comment": "Tambahkan komentar", "Write a comment...": "Tulis komentar...", "Reply": "Balas",
    "Remove": "Hapus", "Edit": "Edit", "edited": "diedit", "Post actions": "Tindakan postingan",
    "Remove this post?": "Hapus postingan ini?", "Remove post": "Hapus postingan", "Cancel": "Batal",
    "It will no longer appear in the community feed. This cannot be undone.": "Postingan tidak lagi muncul di komunitas. Tindakan ini tidak dapat dibatalkan.",
    "Saving...": "Menyimpan...", "Save changes": "Simpan perubahan", "Your post has been saved.": "Postingan Anda telah disimpan.",
    "Showing the latest 100 community posts.": "Menampilkan 100 postingan komunitas terbaru.",
    "Showing the latest 100 comments.": "Menampilkan 100 komentar terbaru.",
    "Show all groups": "Tampilkan semua grup", "Open this group to read and share posts.": "Buka grup untuk membaca dan berbagi postingan.",
    "You left the group.": "Anda keluar dari grup.", "You joined the group.": "Anda bergabung dengan grup.",
    "Comment posted.": "Komentar dikirim.", "Comment removed.": "Komentar dihapus.", "Post removed.": "Postingan dihapus.",
    "Post link shared.": "Tautan postingan dibagikan.", "Remove attachment": "Hapus lampiran",
    "Community post attachment": "Lampiran postingan komunitas", "Attachment preview": "Pratinjau lampiran",
    "This attachment could not load.": "Lampiran tidak dapat dimuat.",
    "Choose a PNG, JPEG, WebP, MP4, or WebM file of 20 MB or smaller.": "Pilih file PNG, JPEG, WebP, MP4, atau WebM berukuran maksimal 20 MB.",
    "Sign in and connect before posting.": "Masuk dan hubungkan sebelum mengirim postingan."
});
const $ = (id) => document.getElementById(id);
const tutorPromotion = document.querySelector(".tutor-promotion");
const tutorCopy = document.querySelector(".tutor-promotion-copy");
const welcome = document.querySelector(".welcome");
const desktopLayout = window.matchMedia("(min-width: 1024px)");
function alignTutorPromotion() {
    if (!desktopLayout.matches) {
        tutorPromotion.style.removeProperty("--tutor-promotion-height");
        return;
    }
    const height = $("postForm").getBoundingClientRect().bottom - welcome.getBoundingClientRect().top;
    tutorPromotion.style.setProperty("--tutor-promotion-height", `${Math.max(height, tutorCopy.offsetHeight + 123)}px`);
}
const tutorLayoutObserver = new ResizeObserver(alignTutorPromotion);
[welcome, $("communityStatus"), $("postForm"), tutorCopy].forEach((node) => tutorLayoutObserver.observe(node));
desktopLayout.addEventListener("change", alignTutorPromotion);
window.addEventListener("resize", alignTutorPromotion);
alignTutorPromotion();
const tr = (text, vars) => window.QCPrefs?.t(text, vars) || text;
const locale = () => window.QCPrefs?.locale() || "en";
const profileAuthor = new URLSearchParams(location.search).get("profile");
const embeddedProfile = new URLSearchParams(location.search).get("embedded") === "1" && Boolean(profileAuthor);
if (embeddedProfile) {
    document.documentElement.classList.add("profile-embedded");
    document.querySelector(".welcome").hidden = true;
    document.querySelector(".community-sidebar").hidden = true;
    document.querySelector(".feed-toolbar").hidden = true;
    document.querySelector(".feed-limit").hidden = true;
    const reportHeight = () => window.parent.postMessage({ type: "qc:profile-feed-height", height: document.querySelector(".community-page").getBoundingClientRect().height + 2 }, location.origin);
    new ResizeObserver(reportHeight).observe(document.querySelector(".community-page"));
    window.addEventListener("message", (event) => {
        if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== "qc:profile-theme") return;
        if (["light", "dark"].includes(event.data.theme)) document.documentElement.dataset.theme = event.data.theme;
    });
}
const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};
const icon = (name) => {
    const node = element("i", `ti ti-${name}`);
    node.setAttribute("aria-hidden", "true");
    return node;
};
const button = (text, className, action) => {
    const node = element("button", className, text);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
};
let state = { uid: null, user: null, loading: true, connected: false, profile: {}, profiles: {}, posts: {}, members: {} };
let developer = false;
let authVersion = 0;
let category = "all";
let groupId = "";
let composerCategory = "tips";
let composerGroupId = "";
let peopleMode = "buddies";
let editingId = null;
let deleteId = null;
let file = null;
let previewURL = "";
let publishing = false;
let syncError = false;
const activity = new Map();
const cards = new Map();
const openedComments = new Set();
const commentDrafts = new Map();
const expandedPosts = new Set();
const pending = new Set();
const privateMedia = new Map();
function releasePrivateMedia(id) {
    const entry = privateMedia.get(id);
    if (!entry) return;
    entry.controller.abort();
    if (entry.url) URL.revokeObjectURL(entry.url);
    privateMedia.delete(id);
}

for (const root of [document.querySelector(".community-page"), ...document.querySelectorAll("dialog")].filter(Boolean)) {
    root.querySelectorAll("button, label, h1, h2, p, option").forEach((node) => {
        if (node.tagName === "OPTION") {
            node.setAttribute("data-i18n", node.textContent.trim());
            return;
        }
        [...node.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim()).forEach((child) => {
            const span = element("span", "", child.textContent);
            span.setAttribute("data-i18n", child.textContent.trim());
            child.replaceWith(span);
        });
    });
    root.querySelectorAll("input[placeholder]").forEach((node) => node.setAttribute("data-i18n-attr", "placeholder"));
}
window.QCPrefs?.apply();

function showError(error, target = $("communityStatus")) {
    console.error("[Community]", error);
    target.textContent = error.message || tr("Something went wrong. Please try again.");
    target.hidden = false;
    target.dataset.state = "error";
}
async function perform(target, action, success = "") {
    if (!state.uid) {
        showError(new Error(tr("Sign in to take part in the community.")));
        return;
    }
    if (!state.connected) {
        showError(new Error(tr("You are offline. Reconnect before making changes.")));
        return;
    }
    if (target.disabled || pending.has(target)) return;
    pending.add(target);
    target.disabled = true;
    try {
        await action();
        if (success) $("liveStatus").textContent = success;
    } catch (error) { showError(error); }
    finally { pending.delete(target); target.disabled = false; }
}
function person(id) {
    if (id === state.uid) return { displayName: resolveDisplayName(state.user, state.profile), photoURL: state.user?.photoURL || state.profile.photoURL || "", level: state.profile.cefrLevel || state.profile.cefr_level || "" };
    return state.profiles[id] || { displayName: tr("Community learner"), photoURL: "", level: "" };
}
function avatar(profile) {
    const name = profile.displayName || tr("Community learner");
    const node = element("span", "avatar", name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase());
    const url = safeMediaURL(profile.photoURL);
    if (url) {
        const image = element("img");
        image.src = url;
        image.alt = "";
        image.loading = "lazy";
        image.addEventListener("error", () => image.remove(), { once: true });
        node.append(image);
    }
    return node;
}
function personRow(profile, showMessage = false) {
    const row = element("a", "person-row");
    row.href = `message.html?to=${encodeURIComponent(profile.id)}`;
    row.setAttribute("aria-label", `${tr("Message")} ${profile.displayName}`);
    const copy = element("span", "person-copy");
    copy.append(element("strong", "", profile.displayName));
    copy.append(element("small", "", [profile.level ? tr("Level {level}", { level: profile.level }) : tr("English learner"), profile.nationality].filter(Boolean).join(" \u00b7 ")));
    row.append(avatar(profile), copy);
    if (showMessage) row.append(element("span", "secondary-button", tr("Message")));
    else {
        const dot = element("span", "online-dot");
        dot.setAttribute("aria-label", tr("Online"));
        row.append(dot);
    }
    return row;
}
function renderPeople() {
    const list = $("onlineList");
    list.replaceChildren();
    if (!state.uid || state.loading) {
        list.append(element("p", "helper", tr(state.loading ? "Loading online learners..." : "Sign in to see online learners.")));
    } else {
        const people = selectPeople(state.profiles, state.uid, { onlineOnly: true });
        if (!people.length) list.append(element("p", "helper", tr("No other learners are online right now. Find a study buddy to connect later.")));
        people.slice(0, 5).forEach((profile) => list.append(personRow(profile)));
    }
    if ($("peopleDialog").open) renderPeopleResults();
}
function renderPeopleResults() {
    const people = selectPeople(state.profiles, state.uid, {
        onlineOnly: peopleMode === "online",
        search: $("peopleSearch").value,
        level: person(state.uid).level
    });
    $("peopleResults").replaceChildren(...people.map((profile) => personRow(profile, true)));
    if (!people.length) $("peopleResults").append(element("p", "helper", tr("No learners match your search. Try a different name or level.")));
}
function openPeople(mode) {
    if (!state.uid) {
        showError(new Error(tr("Sign in to find study buddies.")));
        return;
    }
    peopleMode = mode;
    $("peopleTitle").textContent = tr(mode === "online" ? "People Online" : "Find Study Buddies");
    $("peopleDescription").textContent = tr(person(state.uid).level && mode !== "online"
        ? "Learners at your level appear first. Send a message request to start practicing together."
        : "Message a learner to connect and plan your next practice session.");
    $("peopleSearch").value = "";
    renderPeopleResults();
    $("peopleDialog").showModal();
}
function chooseGroup(id) {
    groupId = id;
    category = "all";
    renderFilters();
    renderFeed();
    $("postFeed").scrollIntoView({ block: "start", behavior: "instant" });
}
function renderFilters() {
    document.querySelectorAll("[data-filter]").forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.filter === category)));
    $("groupFilter").hidden = !groupId;
    $("groupFilterLabel").textContent = tr(GROUPS.find((group) => group.id === groupId)?.name || "");
}
function emptyFeed(title, copy) {
    const node = element("div", "card empty-feed");
    node.append(icon("messages"), element("h2", "", tr(title)), element("p", "helper", tr(copy)));
    if (!state.uid) {
        const link = element("a", "primary-button", tr("Sign in"));
        link.href = "signup.html";
        node.append(link);
    } else node.append(button(tr("Create a Post"), "secondary-button", () => startComposer(category === "all" ? "tips" : category)));
    return node;
}
function renderFeed() {
    if (syncError && state.uid && !Object.keys(state.posts).length) {
        const errorPanel = element("div", "card empty-feed");
        errorPanel.append(element("p", "form-error", tr("Community sync failed. Refresh to retry.")), button(tr("Retry"), "secondary-button", () => location.reload()));
        $("postFeed").replaceChildren(errorPanel);
        $("postFeed").setAttribute("aria-busy", "false");
        return;
    }
    if (state.loading && !Object.keys(state.posts).length) return;
    const likes = Object.fromEntries([...activity].map(([id, value]) => [id, value.likes]));
    const posts = selectPosts(state.posts, { category, groupId, sort: $("postSort").value, likes }).filter((post) => !profileAuthor || post.authorId === profileAuthor);
    $("postFeed").setAttribute("aria-busy", "false");
    $("postFeed").querySelectorAll(".skeleton, .empty-feed").forEach((node) => node.remove());
    const visible = new Set(posts.map((post) => post.id));
    cards.forEach((entry, id) => { if (!visible.has(id)) { entry.node.remove(); releasePrivateMedia(id); cards.delete(id); } });
    if (!posts.length) {
        $("postFeed").append(emptyFeed("Start the conversation", "No posts here yet. Share a question, a useful tip, or your study goals."));
        return;
    }
    posts.forEach((post) => {
        const author = person(post.authorId);
        const signature = JSON.stringify([post, author.displayName, author.photoURL, author.level, developer, locale()]);
        let entry = cards.get(post.id);
        if (!entry || entry.signature !== signature) {
            releasePrivateMedia(post.id);
            const node = makePost(post);
            if (entry) entry.node.replaceWith(node);
            entry = { node, signature };
            cards.set(post.id, entry);
        }
        const index = posts.indexOf(post);
        if ($("postFeed").children[index] !== entry.node) $("postFeed").insertBefore(entry.node, $("postFeed").children[index] || null);
        paintActivity(post.id);
    });
}
function makePost(post) {
    const node = element("article", "card post-card");
    node.id = `post-${post.id}`;
    const header = element("header", "post-header");
    const author = person(post.authorId);
    const copy = element("div", "post-author");
    const authorName = element("div", "post-author-name");
    const authorLink = element("a", "", author.displayName);
    authorLink.href = `profile.html?uid=${encodeURIComponent(post.authorId)}`;
    if (embeddedProfile) authorLink.target = "_top";
    authorName.append(authorLink);
    authorName.append(element("span", "learner-badge", author.level ? tr("Level {level}", { level: author.level }) : tr("English learner")));
    const time = element("time", "post-time", relativeTime(post.createdAt, Date.now(), locale()));
    if (Number.isFinite(post.createdAt)) time.dateTime = new Date(post.createdAt).toISOString();
    if (post.updatedAt) time.append(document.createTextNode(` (${tr("edited")})`));
    copy.append(authorName, time);
    copy.append(element("span", "post-audience", tr(post.visibility === "friends" ? "Friends only" : "Public")));
    header.append(avatar(author), copy, element("span", `category-badge category-${post.category}`, tr(CATEGORIES[post.category] || "Post")));
    if (post.authorId === state.uid || (developer && post.visibility !== "friends")) {
        const menu = element("details", "post-menu");
        const summary = element("summary");
        summary.setAttribute("aria-label", tr("Post actions"));
        summary.append(icon("dots-vertical"));
        const actions = element("div", "post-menu-content");
        if (post.authorId === state.uid) actions.append(button(tr("Edit"), "", () => editPost(post)));
        actions.append(button(tr("Remove"), "", () => {
            deleteId = post.id;
            $("deleteError").hidden = true;
            $("deleteDialog").showModal();
        }));
        menu.append(summary, actions);
        header.append(menu);
    }
    node.append(header, element("h3", "", post.title));
    const body = element("p", "post-body");
    const full = post.body || "";
    const expanded = expandedPosts.has(post.id);
    body.textContent = expanded || full.length <= 240 ? full : `${full.slice(0, 240)}...`;
    node.append(body);
    if (full.length > 240) {
        const more = button(tr(expanded ? "Show Less" : "See more"), "text-button", () => {
            const wasExpanded = expandedPosts.has(post.id);
            if (wasExpanded) expandedPosts.delete(post.id); else expandedPosts.add(post.id);
            body.textContent = wasExpanded ? `${full.slice(0, 240)}...` : full;
            more.textContent = tr(wasExpanded ? "See more" : "Show Less");
            more.setAttribute("aria-expanded", String(!wasExpanded));
        });
        more.setAttribute("aria-expanded", String(expanded));
        node.append(more);
    }
    if (post.groupId) node.append(button(tr(GROUPS.find((group) => group.id === post.groupId)?.name || ""), "text-button post-group-link", () => chooseGroup(post.groupId)));
    const url = safeMediaURL(post.mediaURL);
    if (url) {
        const media = element(post.mediaType === "video" ? "video" : "img", "post-media");
        if (post.visibility === "friends") {
            const entry = { controller: new AbortController(), url: "" };
            privateMedia.set(post.id, entry);
            loadPrivateMedia(post, entry.controller.signal).then((blob) => {
                if (privateMedia.get(post.id) !== entry) return;
                entry.url = URL.createObjectURL(blob);
                media.src = entry.url;
            }).catch((error) => {
                if (error.name === "AbortError") return;
                media.replaceWith(element("p", "form-error", tr("This attachment could not load.")));
                console.error("[Community] Private attachment failed:", error);
            });
        } else media.src = url;
        if (post.mediaType === "video") { media.controls = true; media.preload = "metadata"; }
        else { media.alt = tr("Community post attachment"); media.loading = "lazy"; }
        media.addEventListener("error", () => {
            media.replaceWith(element("p", "form-error", tr("This attachment could not load.")));
        }, { once: true });
        node.append(media);
    }
    const actions = element("div", "post-actions");
    const like = button("", "", () => perform(like, () => setPostLike(post.id, !activity.get(post.id)?.likes[state.uid])));
    like.dataset.like = post.id;
    like.setAttribute("aria-label", tr("Like post"));
    const comments = button("", "", () => {
        if (openedComments.has(post.id)) openedComments.delete(post.id); else openedComments.add(post.id);
        panel.hidden = !openedComments.has(post.id);
        comments.setAttribute("aria-expanded", String(!panel.hidden));
        if (!panel.hidden) panel.querySelector("input").focus();
    });
    comments.dataset.comments = post.id;
    comments.setAttribute("aria-expanded", String(openedComments.has(post.id)));
    const share = button(tr("Share"), "", () => sharePost(post, share));
    share.prepend(icon("share-3"));
    actions.append(like, comments, share);
    const panel = element("section", "comments");
    panel.hidden = !openedComments.has(post.id);
    panel.setAttribute("aria-label", tr("Comments"));
    panel.append(element("div", "comment-list"));
    const form = element("form", "comment-form");
    const input = element("input");
    input.id = `comment-${post.id}`;
    input.maxLength = 2000;
    input.required = true;
    input.value = commentDrafts.get(post.id) || "";
    input.placeholder = tr("Write a comment...");
    input.addEventListener("input", () => commentDrafts.set(post.id, input.value));
    const label = element("label", "", tr("Add a comment"));
    label.htmlFor = input.id;
    const send = element("button", "secondary-button", tr("Reply"));
    send.type = "submit";
    const errorNode = element("p", "form-error");
    errorNode.setAttribute("role", "alert");
    errorNode.hidden = true;
    form.append(label, input, send, errorNode);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!state.uid) return showError(new Error(tr("Sign in to take part in the community.")), errorNode);
        if (!state.connected || pending.has(post.id)) return showError(new Error(tr("You are offline or a reply is still sending.")), errorNode);
        pending.add(post.id);
        send.disabled = true;
        errorNode.hidden = true;
        try {
            await addComment(post.id, input.value);
            input.value = "";
            commentDrafts.delete(post.id);
            $("liveStatus").textContent = tr("Comment posted.");
        } catch (error) { showError(error, errorNode); }
        finally { pending.delete(post.id); send.disabled = false; }
    });
    panel.append(form, element("p", "helper", tr("Showing the latest 100 comments.")));
    node.append(actions, panel);
    return node;
}
function paintActivity(id) {
    const entry = cards.get(id);
    if (!entry) return;
    const data = activity.get(id) || { likes: {}, comments: {} };
    const like = entry.node.querySelector("[data-like]");
    const liked = data.likes[state.uid] === true;
    like.replaceChildren(icon(liked ? "thumb-up-filled" : "thumb-up"), document.createTextNode(String(Object.keys(data.likes).length)));
    like.setAttribute("aria-pressed", String(liked));
    like.setAttribute("aria-label", tr(liked ? "Unlike post" : "Like post"));
    const toggle = entry.node.querySelector("[data-comments]");
    toggle.replaceChildren(icon("message-circle"), document.createTextNode(String(Object.keys(data.comments).length)));
    toggle.setAttribute("aria-label", tr("Comments"));
    const list = entry.node.querySelector(".comment-list");
    const signature = JSON.stringify([data.comments, state.profiles, state.profile, locale()]);
    if (list.dataset.signature === signature) return;
    list.dataset.signature = signature;
    list.replaceChildren();
    Object.entries(data.comments).sort((a, b) => a[1].createdAt - b[1].createdAt).forEach(([commentId, comment]) => {
        const row = element("div", "comment");
        const copy = element("div", "comment-copy");
        copy.append(element("strong", "", person(comment.authorId).displayName), element("p", "", comment.body), element("small", "post-time", relativeTime(comment.createdAt, Date.now(), locale())));
        row.append(avatar(person(comment.authorId)), copy);
        if (comment.authorId === state.uid || developer) {
            const remove = button(tr("Remove"), "text-button", () => perform(remove, () => deleteComment(id, commentId), tr("Comment removed.")));
            row.append(remove);
        }
        list.append(row);
    });
}
async function sharePost(post, target) {
    const url = new URL(location.href);
    url.hash = `post-${post.id}`;
    try {
        if (navigator.share) await navigator.share({ title: post.title, url: url.href });
        else {
            await navigator.clipboard.writeText(url.href);
            target.textContent = tr("Link copied");
            setTimeout(() => { target.replaceChildren(icon("share-3"), document.createTextNode(tr("Share"))); }, 2000);
        }
        $("liveStatus").textContent = tr("Post link shared.");
    } catch (error) { if (error.name !== "AbortError") showError(error); }
}
function startComposer(value) {
    if (publishing) return;
    if (!state.uid) return showError(new Error(tr("Sign in to take part in the community.")));
    if (value === "announcements" && !developer) value = "tips";
    $("composerDetails").hidden = false;
    if (!editingId) composerCategory = value;
    $("postBody").focus();
}
function clearPreview() {
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = "";
    file = null;
    $("mediaInput").value = "";
    $("mediaPreview").replaceChildren();
    $("mediaPreview").hidden = true;
}
function updateComposerUI() {
    const body = $("postBody");
    $("composerCount").textContent = `${body.value.length} / ${body.maxLength}`;
    $("composerCount").dataset.limit = body.value.length >= body.maxLength * .9 ? "near" : "";
    $("postVisibility").disabled = !state.uid || publishing || Boolean(editingId);
    $("postVisibilityIcon").className = `ti ti-${$("postVisibility").value === "friends" ? "lock" : "world"}`;
    document.querySelectorAll(".composer-tools button[data-tooltip]").forEach((tool) => {
        tool.dataset.tooltip = tr(tool.querySelector("[data-i18n]").dataset.i18n);
    });
    $("postVisibilityHint").textContent = tr(editingId
        ? "Audience cannot be changed after publishing. Create a new post instead."
        : $("postVisibility").value === "friends"
            ? "Only you and friends with accepted message connections can read this post."
            : "Anyone can read public posts, including signed-out visitors.");
}
function resetComposer() {
    $("postForm").reset();
    editingId = null;
    clearPreview();
    $("editingHint").hidden = true;
    $("composerDetails").hidden = true;
    $("composerError").hidden = true;
    $("publishButton").textContent = tr("Post");
    composerCategory = "tips";
    composerGroupId = "";
    $("attachButton").disabled = !state.uid;
    updateComposerUI();
}
function editPost(post) {
    if (publishing) return;
    resetComposer();
    editingId = post.id;
    $("postBody").value = post.body;
    $("postTitle").value = post.title;
    composerCategory = post.category;
    composerGroupId = post.groupId || "";
    $("postVisibility").value = post.visibility || "public";
    $("editingHint").hidden = false;
    $("attachButton").disabled = true;
    $("publishButton").textContent = tr("Save changes");
    startComposer(post.category);
    updateComposerUI();
    $("postForm").scrollIntoView({ block: "center", behavior: "instant" });
}
const subscriptions = new Map();
function renderIdentity() {
    if (profileAuthor) {
        $("postForm").hidden = state.uid !== profileAuthor;
        if (embeddedProfile) $("communityStatus").hidden = true;
    }
    const name = state.uid ? resolveDisplayName(state.user, state.profile) : "";
    $("welcomeTitle").textContent = name ? tr("Welcome, {name}!", { name }) : tr("Welcome to Quick Check Community!");
    $("welcomeCopy").textContent = state.uid
        ? tr("Share your progress, ask questions, and connect with learners on the same journey.")
        : tr("Connect, share, and grow together with other English learners. Ask questions, get tips, and find your study buddies!");
    $("composerAvatar").replaceWith(Object.assign(avatar(person(state.uid)), { id: "composerAvatar" }));
    $("postBody").placeholder = name ? tr("What would you like to share, {name}?", { name }) : tr("Share something with the community...");
    const level = person(state.uid).level;
    $("buddyCopy").textContent = level
        ? tr("Find learners at level {level} and plan your next practice session together.", { level })
        : tr("Find the perfect study buddy based on your goals and learning level.");
    if (!publishing) $("publishButton").textContent = tr(editingId ? "Save changes" : "Post");
    updateComposerUI();
    if (!syncError) {
        $("communityStatus").textContent = tr(!state.uid ? "Sign in to take part in the community." : state.loading ? "Loading your community..." : state.connected ? "You're connected to the community." : "You are offline. Reconnect before making changes.");
        $("communityStatus").dataset.state = state.connected || !state.uid ? "" : "error";
    }
}
const unsubscribe = subscribeCommunity(async (next) => {
    const accountChanged = state.uid !== next.uid;
    state = next;
    if (accountChanged) {
        syncError = false;
        const version = ++authVersion;
        subscriptions.forEach((stop) => stop());
        subscriptions.clear();
        activity.clear();
        privateMedia.forEach((_, id) => releasePrivateMedia(id));
        cards.clear();
        $("postFeed").replaceChildren();
        openedComments.clear();
        commentDrafts.clear();
        expandedPosts.clear();
        resetComposer();
        developer = false;
        if (next.user) {
            try {
                const token = await next.user.getIdTokenResult();
                if (version !== authVersion) return;
                developer = token.claims.role === "developer" && next.user.email === "quickcheck.edu@gmail.com" && next.user.emailVerified;
            } catch (error) { showError(error); }
        }
    }
    renderIdentity();
    $("publishButton").disabled = !state.uid || state.loading || !state.connected || publishing;
    $("postBody").disabled = !state.uid;
    $("attachButton").disabled = !state.uid || Boolean(editingId) || publishing;
    Object.entries(state.posts).forEach(([id, post]) => {
        if (post.deletedAt || subscriptions.has(id)) return;
        const version = authVersion;
        subscriptions.set(id, subscribePostActivity(id, (data) => {
            if (version !== authVersion) return;
            activity.set(id, data);
            paintActivity(id);
            if ($("postSort").value === "popular") renderFeed();
        }, showError));
    });
    subscriptions.forEach((stop, id) => {
        if (!state.posts[id] || state.posts[id].deletedAt) {
            stop();
            subscriptions.delete(id);
            activity.delete(id);
            cards.get(id)?.node.remove();
            releasePrivateMedia(id);
            cards.delete(id);
        }
    });
    renderPeople();
    renderFeed();
    const linked = document.getElementById(location.hash.slice(1));
    if (linked?.classList.contains("post-card") && !linked.dataset.linkOpened) {
        linked.dataset.linkOpened = "true";
        linked.scrollIntoView({ block: "center", behavior: "instant" });
    }
}, (error) => {
    syncError = true;
    showError(new Error(`${tr("Community sync failed. Refresh to retry.")} ${error.message || ""}`));
    $("postFeed").setAttribute("aria-busy", "false");
    renderFeed();
});

document.querySelectorAll("[data-filter]").forEach((node) => node.addEventListener("click", () => {
    category = node.dataset.filter;
    renderFilters();
    renderFeed();
}));
document.querySelectorAll("[data-compose]").forEach((node) => node.addEventListener("click", () => startComposer(node.dataset.compose)));
$("postBody").addEventListener("focus", () => { $("composerDetails").hidden = false; updateComposerUI(); });
$("postBody").addEventListener("input", updateComposerUI);
$("postVisibility").addEventListener("change", updateComposerUI);
$("postSort").addEventListener("change", renderFeed);
$("clearGroup").addEventListener("click", () => { groupId = ""; renderFilters(); renderFeed(); });
$("viewPeople").addEventListener("click", () => openPeople("online"));
$("findBuddy").addEventListener("click", () => openPeople("buddies"));
$("peopleSearch").addEventListener("input", renderPeopleResults);
$("cancelEdit").addEventListener("click", resetComposer);
$("attachButton").addEventListener("click", () => $("mediaInput").click());
$("mediaInput").addEventListener("change", () => {
    const selected = $("mediaInput").files[0];
    if (!selected) return;
    clearPreview();
    if (!["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"].includes(selected.type) || selected.size > 20 * 1024 * 1024) {
        showError(new Error(tr("Choose a PNG, JPEG, WebP, MP4, or WebM file of 20 MB or smaller.")), $("composerError"));
        return;
    }
    file = selected;
    previewURL = URL.createObjectURL(selected);
    const preview = element(selected.type.startsWith("video/") ? "video" : "img");
    preview.src = previewURL;
    if (selected.type.startsWith("video/")) preview.controls = true;
    else preview.alt = tr("Attachment preview");
    $("mediaPreview").append(preview, button(tr("Remove attachment"), "text-button", clearPreview));
    $("mediaPreview").hidden = false;
    $("composerError").hidden = true;
});
$("postForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (publishing) return;
    if (!state.uid || !state.connected) return showError(new Error(tr("Sign in and connect before posting.")), $("composerError"));
    publishing = true;
    const version = authVersion;
    const submit = $("publishButton");
    submit.disabled = true;
    submit.textContent = tr("Saving...");
    $("composerError").hidden = true;
    const fields = [...$("postForm").querySelectorAll("input, textarea, select, button")];
    const disabled = fields.map((field) => field.disabled);
    const input = { title: $("postTitle").value || $("postBody").value.trim().slice(0, 80).split("\n")[0], body: $("postBody").value, category: composerCategory, groupId: composerGroupId, visibility: $("postVisibility").value };
    fields.forEach((field) => { field.disabled = true; });
    try {
        const id = await savePost(input, file, developer, editingId);
        if (version !== authVersion) return;
        resetComposer();
        category = "all";
        groupId = "";
        renderFilters();
        renderFeed();
        $("liveStatus").textContent = tr("Your post has been saved.");
        document.getElementById(`post-${id}`)?.scrollIntoView({ block: "center", behavior: "instant" });
    } catch (error) { if (version === authVersion) showError(error, $("composerError")); }
    finally {
        publishing = false;
        fields.forEach((field, index) => { field.disabled = disabled[index]; });
        $("attachButton").disabled = !state.uid || Boolean(editingId);
        submit.disabled = !state.uid || !state.connected;
        submit.textContent = tr(editingId ? "Save changes" : "Post");
        updateComposerUI();
    }
});
$("confirmDelete").addEventListener("click", async () => {
    const target = $("confirmDelete");
    if (!state.connected) return showError(new Error(tr("You are offline. Reconnect before making changes.")), $("deleteError"));
    target.disabled = true;
    try {
        await removePost(deleteId);
        $("deleteDialog").close();
        $("liveStatus").textContent = tr("Post removed.");
        if (editingId === deleteId) resetComposer();
    } catch (error) { showError(error, $("deleteError")); }
    finally { target.disabled = false; }
});
document.querySelectorAll("[data-close-dialog]").forEach((node) => node.addEventListener("click", () => node.closest("dialog").close()));
window.addEventListener("toefl-partner-directory-error", (event) => showError(new Error(event.detail.message)));
window.addEventListener("qc:langchange", () => { cards.clear(); $("postFeed").replaceChildren(); renderIdentity(); renderPeople(); renderFeed(); });
const clock = setInterval(() => {
    document.querySelectorAll(".post-card").forEach((node) => {
        const post = state.posts[node.id.slice(5)];
        if (!post) return;
        node.querySelector("time").textContent = `${relativeTime(post.createdAt, Date.now(), locale())}${post.updatedAt ? ` (${tr("edited")})` : ""}`;
    });
}, 60000);
window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    clearInterval(clock);
    privateMedia.forEach((_, id) => releasePrivateMedia(id));
    unsubscribe();
    subscriptions.forEach((stop) => stop());
    clearPreview();
});
