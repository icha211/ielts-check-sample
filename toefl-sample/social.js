import { subscribeCommunity, subscribePostActivity, savePost, removePost, setPostLike, addComment, deleteComment, reportCommunityContent, setCommunityBlock, loadPrivateMedia, recordExploreInteraction } from "./js/community.js?v=20261104-explore-ranking";
import { getExploreFeed } from "./js/explore-service.js?v=20261104-learning-setup";
import { GROUPS, CATEGORIES, selectPosts, selectPeople, safeMediaURL, relativeTime, imageFrameLayout, imageDisplaySettings, validateMediaFile } from "./js/community-model.js?v=20261104-short-video";
import { resolveDisplayName } from "./js/account-menu.js?v=20261030-prefs";
import { db } from "./js/firebase-config.js";
import { equalTo, limitToLast, onValue, orderByChild, query, ref } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

window.QCPrefs?.addTranslations("id", {
    "Following": "Koneksi", "Global": "Global", "Recommended": "Rekomendasi",
    "Refresh recommendations": "Perbarui rekomendasi",
    "Following uses your accepted connections. Recommendations also include practice partners and published courses.": "Following menggunakan koneksi yang telah diterima. Rekomendasi juga mencakup teman latihan dan kursus yang dipublikasikan.",
    "Practice matching and privacy": "Kecocokan latihan dan privasi",
    "Edit learning preferences": "Edit preferensi belajar",
    "Learning keywords (up to 3)": "Kata kunci belajar (maksimal 3)",
    "Choose up to three topics so learners can discover your post.": "Pilih maksimal tiga topik agar pelajar dapat menemukan postingan Anda.",
    "Choose up to three distinct learning keywords.": "Pilih maksimal tiga kata kunci belajar yang berbeda.",
    "Learning goals": "Tujuan belajar", "English proficiency level": "Tingkat kemampuan bahasa Inggris",
    "Practice skills": "Keterampilan latihan", "Learning style": "Gaya belajar",
    "Save preferences": "Simpan preferensi", "Save": "Simpan", "Saved": "Tersimpan",
    "Practice partner": "Teman latihan", "Teacher or course": "Tutor atau kursus",
    "View course": "Lihat kursus", "{score}% practice match": "Kecocokan latihan {score}%",
    "Based on your selected goals, level, skills and learning style.": "Berdasarkan tujuan, tingkat, keterampilan, dan gaya belajar yang Anda pilih.",
    "Loading recommendations...": "Memuat rekomendasi...",
    "Recommendations use a recent, bounded sample. Refresh to update ranking.": "Rekomendasi menggunakan sampel terbaru yang terbatas. Perbarui untuk memperbarui urutan.",
    "Recommendations unavailable. Showing your accessible posts chronologically.": "Rekomendasi tidak tersedia. Postingan yang dapat Anda akses ditampilkan berdasarkan waktu.",
    "Wait one minute between recommendation refreshes.": "Tunggu satu menit sebelum memperbarui rekomendasi.",
    "Load recommendations before saving preferences.": "Muat rekomendasi sebelum menyimpan preferensi.",
    "Explore preferences saved.": "Preferensi Explore disimpan.",
    "Matching uses goals (40%), level (30%), skills (20%) and learning style (10%). Unanswered fields contribute zero.": "Kecocokan menggunakan tujuan (40%), tingkat (30%), keterampilan (20%), dan gaya belajar (10%). Isian kosong bernilai nol.",
    "Recommend me as a practice partner. My selected practice preferences will be shown to signed-in learners.": "Rekomendasikan saya sebagai teman latihan. Preferensi latihan saya akan ditampilkan kepada pelajar yang masuk.",
    "Personalize recommendations using posts I view for more than 10 seconds or videos I finish.": "Personalisasi rekomendasi menggunakan postingan yang saya lihat lebih dari 10 detik atau video yang saya selesaikan.",
    "Off by default. Likes, comments, saves and shares still inform recommendations. Turning this off stops viewing events and excludes previous views from your learning interests.": "Nonaktif secara bawaan. Suka, komentar, simpan, dan bagikan tetap memengaruhi rekomendasi. Menonaktifkan ini menghentikan pencatatan tampilan dan mengecualikan tampilan sebelumnya dari minat belajar Anda.",
    "Beginner": "Pemula", "Intermediate": "Menengah", "Advanced": "Mahir",
    "IELTS Preparation": "Persiapan IELTS", "TOEFL ITP Preparation": "Persiapan TOEFL ITP", "TOEFL iBT Preparation": "Persiapan TOEFL iBT",
    "Duolingo English Test Preparation": "Persiapan Duolingo English Test", "Scholarship Preparation": "Persiapan beasiswa",
    "Daily English Conversation": "Percakapan bahasa Inggris sehari-hari", "Business English": "Bahasa Inggris bisnis", "Academic English": "Bahasa Inggris akademik",
    "English for Beginners": "Bahasa Inggris untuk pemula", "Voice Call": "Panggilan suara", "Video Call": "Panggilan video",
    "Text Conversation": "Percakapan teks", "Group Discussion": "Diskusi kelompok", "One-on-One Practice": "Latihan satu lawan satu",
    "Speaking": "Berbicara", "Listening": "Mendengarkan", "Pronunciation": "Pelafalan", "Vocabulary": "Kosakata", "Grammar": "Tata bahasa", "Writing": "Menulis"
});
window.QCPrefs?.addTranslations("id", {
    "Photo": "Foto", "Photo uploads": "Unggahan foto",
    "Photo or video": "Foto atau video", "Photo and video uploads": "Unggahan foto dan video",
    "PNG, JPEG or WebP pictures up to 40 MB. Pictures over 2 MB are compressed before upload. MP4 or WebM videos up to 20 MB and 60 seconds.": "Gambar PNG, JPEG atau WebP maksimal 40 MB. Gambar di atas 2 MB dikompresi sebelum diunggah. Video MP4 atau WebM maksimal 20 MB dan 60 detik.",
    "Choose a PNG, JPEG or WebP picture or MP4/WebM video.": "Pilih gambar PNG, JPEG atau WebP, atau video MP4/WebM.",
    "Pictures must be 40 MB or smaller before compression.": "Ukuran gambar sebelum dikompresi harus maksimal 40 MB.",
    "Videos must be 20 MB or smaller.": "Ukuran video harus maksimal 20 MB.",
    "Videos must be 60 seconds or shorter.": "Durasi video harus 60 detik atau kurang.",
    "Wait for video validation to finish before posting.": "Tunggu hingga validasi video selesai sebelum mengirim postingan.",
    "Choose a PNG, JPEG or WebP picture up to 40 MB.": "Pilih gambar PNG, JPEG atau WebP maksimal 40 MB.",
    "PNG, JPEG or WebP pictures up to 40 MB. Pictures over 2 MB are automatically compressed before upload.": "Gambar PNG, JPEG atau WebP maksimal 40 MB. Gambar di atas 2 MB dikompresi otomatis sebelum diunggah.",
    "Tall photos can be cropped to 4:5 or shown whole. Shorter photos keep their natural height.": "Foto tinggi dapat dipotong menjadi 4:5 atau ditampilkan seluruhnya. Foto yang lebih pendek mempertahankan tinggi aslinya.",
    "Photos fill the width. Taller photos crop vertically; shorter photos have padding above and below.": "Foto memenuhi lebar. Foto yang lebih tinggi dipotong vertikal; foto yang lebih pendek memiliki ruang di atas dan bawah.",
    "Photos fill the width. Adjust the vertical position to choose what stays visible.": "Foto memenuhi lebar. Sesuaikan posisi vertikal untuk memilih bagian yang tetap terlihat.",
    "Upload information": "Informasi unggahan",
    "Public photos use a wide frame. Padding keeps the whole image visible when proportions differ.": "Foto publik menggunakan bingkai lebar. Ruang tambahan menjaga seluruh gambar terlihat jika proporsinya berbeda.",
    "Photo layout": "Tata letak foto", "Auto": "Otomatis", "Whole image": "Seluruh gambar",
    "Crop to fill": "Potong sesuai bingkai", "Reset": "Atur ulang",
    "Portrait": "Potret", "Square": "Persegi", "Landscape": "Lanskap",
    "All details visible. Your original stays unchanged.": "Semua detail terlihat. Gambar asli tidak berubah.",
    "Edges are cropped. Use the sliders to position your subject.": "Tepi dipotong. Gunakan penggeser untuk mengatur posisi subjek.",
    "Adjust picture": "Sesuaikan gambar", "Format": "Format", "Display": "Tampilan",
    "Automatic": "Otomatis", "Portrait (4:5)": "Potret (4:5)", "Square (1:1)": "Persegi (1:1)",
    "Landscape (1.91:1)": "Lanskap (1.91:1)", "Show whole picture": "Tampilkan seluruh gambar",
    "Fill frame (crop)": "Isi bingkai (potong)", "Horizontal position": "Posisi horizontal",
    "Vertical position": "Posisi vertikal", "Reset framing": "Atur ulang bingkai",
    "Show whole picture keeps all details visible. Fill frame crops edges; adjust the position to keep your subject in view.": "Tampilkan seluruh gambar agar semua detail terlihat. Isi bingkai memotong tepi; sesuaikan posisi agar subjek tetap terlihat.",
    "Your profile": "Profil Anda", "View your profile": "Lihat profil Anda",
    "Sign in to connect with other learners.": "Masuk untuk terhubung dengan pelajar lain.",
    "Add a bio to introduce yourself.": "Tambahkan bio untuk memperkenalkan diri.",
    "Your profile details could not load. Refresh to retry.": "Detail profil Anda tidak dapat dimuat. Muat ulang untuk mencoba lagi.",
    "Audience": "Audiens",
    "Public": "Publik",
    "Friends only": "Hanya teman",
    "Sign in to read public posts and participate.": "Masuk untuk membaca postingan publik dan berpartisipasi.",
    "Report": "Laporkan", "Block account": "Blokir akun", "Unblock": "Buka blokir",
    "Manage blocked accounts": "Kelola akun yang diblokir", "Blocked accounts": "Akun yang diblokir",
    "You have not blocked any accounts.": "Anda belum memblokir akun apa pun.",
    "Report community content": "Laporkan konten komunitas",
    "Choose the reason that best describes the issue.": "Pilih alasan yang paling sesuai dengan masalah.",
    "Reason": "Alasan", "Spam": "Spam", "Harassment or bullying": "Pelecehan atau perundungan",
    "Inappropriate content": "Konten tidak pantas", "Scam or misleading content": "Penipuan atau konten menyesatkan",
    "Other": "Lainnya", "Send report": "Kirim laporan", "Report submitted for moderator review.": "Laporan dikirim untuk ditinjau moderator.",
    "You have already reported this content.": "Anda sudah melaporkan konten ini.",
    "Block this account?": "Blokir akun ini?",
    "Their posts will be hidden from your community feed, and neither of you can interact with the other's content.": "Postingan mereka akan disembunyikan dari komunitas Anda, dan kalian tidak dapat berinteraksi dengan konten satu sama lain.",
    "Account blocked.": "Akun diblokir.", "Account unblocked.": "Blokir akun dibuka.",
    "This account is blocked.": "Akun ini diblokir.",
    "Community reports": "Laporan komunitas", "Latest 100 open reports": "100 laporan terbuka terbaru",
    "No open reports.": "Tidak ada laporan terbuka.", "Dismiss": "Abaikan",
    "Remove reported content": "Hapus konten yang dilaporkan", "Dismiss this report?": "Abaikan laporan ini?",
    "Remove reported content?": "Hapus konten yang dilaporkan?",
    "This action cannot be undone.": "Tindakan ini tidak dapat dibatalkan.",
    "Report queue could not load. Refresh to retry.": "Antrean laporan tidak dapat dimuat. Muat ulang untuk mencoba lagi.",
    "Moderation action could not be completed.": "Tindakan moderasi tidak dapat diselesaikan.",
    "Reported account: {name}": "Akun yang dilaporkan: {name}",
    "Report resolved.": "Laporan diselesaikan.",
    "Only you and friends with accepted message connections can read this post.": "Hanya Anda dan teman dengan koneksi pesan yang diterima dapat membaca postingan ini.",
    "Audience cannot be changed after publishing. Create a new post instead.": "Audiens tidak dapat diubah setelah diterbitkan. Buat postingan baru.",
    "Posting to everyone": "Posting untuk semua orang",
    "Posting to {group}": "Posting ke {group}",
    "Groups organize posts, not who can see or reply to them.": "Grup mengatur postingan, bukan siapa yang dapat melihat atau membalasnya.",
    "Become a Tutor": "Jadi Tutor",
    "Share Your Knowledge, Earn Income": "Bagikan Pengetahuan, Dapatkan Penghasilan",
    "Join our platform and start teaching what you love.": "Bergabunglah dan mulai mengajar bidang yang Anda sukai.",
    "Tutor registration is not available yet.": "Pendaftaran tutor belum tersedia.",
    "Welcome to Quick Check Explore!": "Selamat datang di Jelajahi Quick Check!",
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
    "Ask a Question": "Ajukan Pertanyaan", "Create a Post": "Buat Postingan",
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
    "Recommendations use a recent sample. Other sorts show up to 100 posts.": "Rekomendasi menggunakan sampel terbaru. Urutan lain menampilkan hingga 100 postingan.",
    "Showing the latest 100 comments.": "Menampilkan 100 komentar terbaru.",
    "Show all groups": "Tampilkan semua grup", "Open this group to read and share posts.": "Buka grup untuk membaca dan berbagi postingan.",
    "You left the group.": "Anda keluar dari grup.", "You joined the group.": "Anda bergabung dengan grup.",
    "Comment posted.": "Komentar dikirim.", "Comment removed.": "Komentar dihapus.", "Post removed.": "Postingan dihapus.",
    "Post link shared.": "Tautan postingan dibagikan.", "Remove attachment": "Hapus lampiran",
    "Community post attachment": "Lampiran postingan komunitas", "Attachment preview": "Pratinjau lampiran",
    "This attachment could not load.": "Lampiran tidak dapat dimuat.",
    "Compressing picture...": "Mengompresi gambar...",
    "This picture could not be compressed. Choose another picture and try again.": "Gambar ini tidak dapat dikompresi. Pilih gambar lain dan coba lagi.",
    "Sign in and connect before posting.": "Masuk dan hubungkan sebelum mengirim postingan."
});
const $ = (id) => document.getElementById(id);
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
        reportHeight();
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
let state = { uid: null, user: null, loading: true, connected: false, profile: {}, profiles: {}, posts: {}, members: {}, blocks: {} };
let developer = false;
let authVersion = 0;
let category = "all";
let groupId = "";
let composerCategory = "tips";
let composerGroupId = "";
let peopleMode = "buddies";
let editingId = null;
let deleteId = null;
let reportTarget = null;
let blockTarget = null;
let moderationTarget = null;
let moderationStop = null;
let moderationUid = null;
let file = null;
let previewURL = "";
let mediaValidationPending = false;
let publishing = false;
let syncError = false;
let exploreMode = "global", exploreData = null, exploreBusy = false, exploreRequest = 0, lastExploreRefresh = 0;
const viewedPosts = new Set(), visiblePosts = new Map();
const viewObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
        const id = entry.target.dataset.viewPost;
        if (entry.isIntersecting && entry.intersectionRatio >= .5 && !document.hidden) visiblePosts.set(id, performance.now());
        else visiblePosts.delete(id);
    }
}, { threshold: [.5] });
async function recordView(id, details) {
    if (!exploreData?.preferences.viewTracking || viewedPosts.has(id) || !state.connected || document.hidden || !document.hasFocus()) return;
    viewedPosts.add(id);
    const version = authVersion;
    try { await recordExploreInteraction(id, "view", true, details); }
    catch (error) {
        if (version !== authVersion) return;
        viewedPosts.delete(id);
        showError(error, $("exploreError"));
    }
}
const viewClock = setInterval(() => {
    if (document.hidden || !document.hasFocus() || !exploreData?.preferences.viewTracking) { visiblePosts.clear(); return; }
    for (const [id, started] of visiblePosts) if (performance.now() - started > 10000) {
        visiblePosts.delete(id);
        recordView(id, { visibleMs: performance.now() - started });
    }
}, 1000);
document.addEventListener("visibilitychange", () => {
    visiblePosts.clear();
    if (!document.hidden) cards.forEach(entry => { viewObserver.unobserve(entry.node); viewObserver.observe(entry.node); });
});
window.addEventListener("focus", () => cards.forEach(entry => { viewObserver.unobserve(entry.node); viewObserver.observe(entry.node); }));
window.addEventListener("blur", () => visiblePosts.clear());
const activity = new Map();
const cards = new Map();
const openedComments = new Set();
const commentDrafts = new Map();
const expandedPosts = new Set();
const pending = new Set();
const privateMedia = new Map();
function fillExplorePreferences() {
    const selected = [...$("postKeywords").selectedOptions].map(option => option.value);
    $("postKeywords").replaceChildren(...exploreData.keywords.map(value => {
        const option = element("option", "", value);
        option.value = value;
        option.selected = selected.includes(value);
        return option;
    }));
}
function setExploreBusy(busy) {
    exploreBusy = busy;
    $("refreshExplore").disabled = busy;
    document.querySelectorAll("[data-explore-mode]").forEach(button => { button.disabled = busy; });
}
async function loadExplore(force = false) {
    if (!state.uid || embeddedProfile || exploreBusy) return;
    if (!force && Date.now() - lastExploreRefresh < 60000) return;
    const version = authVersion, request = ++exploreRequest;
    setExploreBusy(true);
    $("exploreError").hidden = true;
    $("exploreStatus").textContent = tr("Loading recommendations...");
    try {
        const data = await getExploreFeed(exploreMode);
        if (version !== authVersion || request !== exploreRequest) return;
        if (!data || !Array.isArray(data.items) || !Array.isArray(data.keywords) || !data.preferences || !data.practiceOptions || !data.actions) throw new Error("Explore returned an invalid response. Retry recommendations.");
        exploreData = data;
        lastExploreRefresh = Date.now();
        fillExplorePreferences();
        $("exploreStatus").textContent = tr("Recommendations use a recent, bounded sample. Refresh to update ranking.");
        visiblePosts.clear();
        cards.forEach(entry => { viewObserver.unobserve(entry.node); entry.node.remove(); });
        cards.clear();
        renderFeed();
    } catch (error) {
        if (version !== authVersion || request !== exploreRequest) return;
        exploreData = null;
        $("exploreStatus").textContent = tr("Recommendations unavailable. Showing your accessible posts chronologically.");
        showError(error, $("exploreError"));
        renderFeed();
    } finally {
        if (version === authVersion && request === exploreRequest) {
            setExploreBusy(false);
        }
    }
}
function releasePrivateMedia(id) {
    const entry = privateMedia.get(id);
    if (!entry) return;
    entry.controller.abort();
    if (entry.url) URL.revokeObjectURL(entry.url);
    privateMedia.delete(id);
}

for (const root of [document.querySelector(".community-page"), ...document.querySelectorAll("dialog")].filter(Boolean)) {
    root.querySelectorAll("button, label, legend, h1, h2, p, option").forEach((node) => {
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
        const people = selectPeople(state.profiles, state.uid, { onlineOnly: true }).filter((profile) => !state.blocks?.[profile.id]);
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
    }).filter((profile) => !state.blocks?.[profile.id]);
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
        if (embeddedProfile) link.target = "_top";
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
    let posts = selectPosts(state.posts, { category, groupId, sort: $("postSort").value, likes }).filter((post) => !profileAuthor || post.authorId === profileAuthor).slice(0, 100);
    const recommended = !profileAuthor && category === "all" && !groupId && $("postSort").value === "recommended" && exploreData;
    let items = posts.map(post => ({ type: "post", id: post.id }));
    if (recommended) {
        items = exploreData.items.filter(item => item.type === "post" ? state.posts[item.id] && !state.posts[item.id].deletedAt :
            !state.blocks[item.type === "partner" ? item.id : item.course.teacherId]);
        posts = items.filter(item => item.type === "post").map(item => ({ ...state.posts[item.id], id: item.id }));
    }
    $("postFeed").setAttribute("aria-busy", "false");
    $("postFeed").querySelectorAll(".skeleton, .empty-feed, .explore-recommendation").forEach((node) => node.remove());
    const visible = new Set(posts.map((post) => post.id));
    cards.forEach((entry, id) => { if (!visible.has(id)) { viewObserver.unobserve(entry.node); visiblePosts.delete(id); entry.node.remove(); releasePrivateMedia(id); cards.delete(id); } });
    if (!items.length) {
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
            node.dataset.viewPost = post.id;
            if (entry) { viewObserver.unobserve(entry.node); entry.node.replaceWith(node); }
            entry = { node, signature };
            cards.set(post.id, entry);
            viewObserver.observe(node);
            node.querySelector("video")?.addEventListener("ended", event => {
                const video = event.target;
                let played = 0;
                for (let index = 0; index < video.played.length; index++) played += video.played.end(index) - video.played.start(index);
                if (video.duration > 0 && played >= video.duration * .95) recordView(post.id, { completed: true });
            });
        }
        const index = items.findIndex(item => item.type === "post" && item.id === post.id);
        if ($("postFeed").children[index] !== entry.node) $("postFeed").insertBefore(entry.node, $("postFeed").children[index] || null);
        paintActivity(post.id);
    });
    items.forEach((item, index) => {
        if (item.type === "post") return;
        const node = element("article", "card explore-recommendation");
        node.dataset.recommendation = item.type;
        if (item.type === "partner") {
            node.append(element("p", "recommendation-label", tr("Practice partner")), element("h2", "", item.profile.displayName),
                element("p", "", tr("{score}% practice match", { score: item.matchingScore })),
                element("p", "helper", [...(item.practice?.goals || []), item.practice?.level, ...(item.practice?.skills || []), ...(item.practice?.styles || [])].filter(Boolean).map(value => tr(value)).join(", ")),
                element("p", "helper", tr("Based on your selected goals, level, skills and learning style.")),
                personRow({ ...item.profile, id: item.id }, true));
        } else {
            const link = element("a", "secondary-button", tr("View course"));
            link.href = `tutor-check.html?course=${encodeURIComponent(item.id)}`;
            node.append(element("p", "recommendation-label", tr("Teacher or course")), element("h2", "", item.course.title),
                element("p", "helper", item.course.summary),
                element("p", "", new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(item.course.price)), link);
        }
        $("postFeed").insertBefore(node, $("postFeed").children[index] || null);
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
    if (state.uid) {
        const menu = element("details", "post-menu");
        const summary = element("summary");
        summary.setAttribute("aria-label", tr("Post actions"));
        summary.append(icon("dots-vertical"));
        const actions = element("div", "post-menu-content");
        if (post.authorId === state.uid) actions.append(button(tr("Edit"), "", () => editPost(post)));
        else {
            actions.append(button(tr("Report"), "", () => reportContent(post.id, "post", post.id)));
            const blocked = state.blocks?.[post.authorId] === true;
            actions.append(button(tr(blocked ? "Unblock" : "Block account"), "", () => {
                if (blocked) updateBlock(post.authorId, false);
                else confirmBlock(post.authorId);
            }));
        }
        if (post.authorId === state.uid || (developer && post.visibility !== "friends")) actions.append(button(tr("Remove"), "", () => {
            deleteId = post.id;
            $("deleteError").hidden = true;
            $("deleteDialog").showModal();
        }));
        menu.append(summary, actions);
        header.append(menu);
    }
    node.append(header);
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
        if (post.mediaType !== "video") formatFeedImage(media, post);
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
        if (post.mediaType === "video") { media.controls = true; media.preload = "metadata"; media.playsInline = true; }
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
    const actionKey = post.visibility === "friends" ? `private:${post.authorId}:${post.id}` : post.id;
    const saved = Boolean(exploreData?.actions[actionKey]?.save);
    const save = button(tr(saved ? "Saved" : "Save"), "", () => perform(save, async () => {
        if (!exploreData) throw new Error(tr("Load recommendations before saving preferences."));
        const enabled = !exploreData?.actions[actionKey]?.save, version = authVersion;
        await recordExploreInteraction(post.id, "save", enabled);
        if (version !== authVersion || !exploreData) return;
        (exploreData.actions[actionKey] ||= {}).save = enabled;
        save.textContent = tr(enabled ? "Saved" : "Save");
        save.setAttribute("aria-pressed", String(enabled));
    }));
    save.setAttribute("aria-pressed", String(saved));
    save.disabled = !state.uid || !exploreData;
    save.prepend(icon("bookmark"));
    if (post.keywords?.length) node.append(element("p", "post-keywords", post.keywords.join(", ")));
    actions.append(like, comments, save, share);
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
    const liked = Boolean(data.likes[state.uid]);
    like.replaceChildren(icon(liked ? "thumb-up-filled" : "thumb-up"), document.createTextNode(String(Object.keys(data.likes).length)));
    like.setAttribute("aria-pressed", String(liked));
    like.setAttribute("aria-label", tr(liked ? "Unlike post" : "Like post"));
    const toggle = entry.node.querySelector("[data-comments]");
    toggle.replaceChildren(icon("message-circle"), document.createTextNode(String(Object.keys(data.comments).length)));
    toggle.setAttribute("aria-label", tr("Comments"));
    const list = entry.node.querySelector(".comment-list");
    const signature = JSON.stringify([data.comments, state.profiles, state.profile, state.blocks, locale()]);
    if (list.dataset.signature === signature) return;
    list.dataset.signature = signature;
    list.replaceChildren();
    Object.entries(data.comments).filter(([, comment]) => !state.blocks?.[comment.authorId])
        .sort((a, b) => a[1].createdAt - b[1].createdAt).forEach(([commentId, comment]) => {
        const row = element("div", "comment");
        const copy = element("div", "comment-copy");
        copy.append(element("strong", "", person(comment.authorId).displayName), element("p", "", comment.body), element("small", "post-time", relativeTime(comment.createdAt, Date.now(), locale())));
        row.append(avatar(person(comment.authorId)), copy);
        const controls = element("div", "comment-controls");
        if (comment.authorId !== state.uid && state.uid) {
            controls.append(button(tr("Report"), "text-button", () => reportContent(id, "comment", commentId)));
            const blocked = state.blocks?.[comment.authorId] === true;
            controls.append(button(tr(blocked ? "Unblock" : "Block account"), "text-button", () => {
                if (blocked) updateBlock(comment.authorId, false);
                else confirmBlock(comment.authorId);
            }));
        }
        if (comment.authorId === state.uid || developer) {
            const remove = button(tr("Remove"), "text-button", () => perform(remove, () => deleteComment(id, commentId), tr("Comment removed.")));
            controls.append(remove);
        }
        if (controls.childElementCount) row.append(controls);
        list.append(row);
    });
}
async function sharePost(post, target) {
    const url = new URL(embeddedProfile ? "social.html" : location.href, location.href);
    url.hash = `post-${post.id}`;
    try {
        if (navigator.share) await navigator.share({ title: post.title, url: url.href });
        else {
            await navigator.clipboard.writeText(url.href);
            target.textContent = tr("Link copied");
            setTimeout(() => { target.replaceChildren(icon("share-3"), document.createTextNode(tr("Share"))); }, 2000);
        }
        $("liveStatus").textContent = tr("Post link shared.");
        await recordExploreInteraction(post.id, "share");
    } catch (error) { if (error.name !== "AbortError") showError(error); }
}
function startComposer(value) {
    if (publishing) return;
    if (!state.uid) return showError(new Error(tr("Sign in to take part in the community.")));
    if (value === "announcements" && !developer) value = "tips";
    if (!editingId) composerCategory = value;
    $("postBody").focus();
}
function clearPreview() {
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = "";
    file = null;
    mediaValidationPending = false;
    $("mediaInput").value = "";
    $("mediaPreview").replaceChildren();
    $("mediaPreview").hidden = true;
    $("imageFraming").hidden = true;
    resetImageFraming();
}
function updatePublishAvailability() {
    $("publishButton").disabled = !state.uid || state.loading || !state.connected || publishing || mediaValidationPending;
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
            : "Sign in to read public posts and participate.");
    updatePublishAvailability();
}
function resetComposer() {
    $("postForm").reset();
    editingId = null;
    clearPreview();
    $("editingHint").hidden = true;
    $("composerError").hidden = true;
    $("publishButton").textContent = tr("Post");
    composerCategory = "tips";
    composerGroupId = "";
    [...$("postKeywords").options].forEach(option => { option.selected = false; });
    $("attachButton").disabled = !state.uid;
    updateComposerUI();
}
function editPost(post) {
    if (publishing) return;
    resetComposer();
    editingId = post.id;
    $("postBody").value = post.body;
    composerCategory = post.category;
    composerGroupId = post.groupId || "";
    $("postVisibility").value = post.visibility || "public";
    for (const value of post.keywords || []) {
        if ([...$("postKeywords").options].some(option => option.value === value)) continue;
        const option = element("option", "", value);
        option.value = value;
        $("postKeywords").append(option);
    }
    [...$("postKeywords").options].forEach(option => { option.selected = (post.keywords || []).includes(option.value); });
    if (post.mediaType === "image" && post.mediaURL) {
        $("imageFit").value = post.imageFit || "cover";
        $("imageY").value = post.imageY ?? 50;
        $("imageFraming").hidden = false;
        const existing = document.getElementById(`post-${post.id}`)?.querySelector("img.post-media");
        if (existing) {
            const preview = element("img");
            preview.alt = tr("Attachment preview");
            formatFeedImage(preview, post);
            const show = () => {
                if (editingId !== post.id || !existing.getAttribute("src")) return;
                preview.src = existing.src;
                $("mediaPreview").replaceChildren(preview);
                $("mediaPreview").hidden = false;
            };
            show();
            existing.addEventListener("load", show, { once: true });
        }
        updateImageFraming();
    }
    $("editingHint").hidden = false;
    $("attachButton").disabled = true;
    $("publishButton").textContent = tr("Save changes");
    startComposer(post.category);
    updateComposerUI();
    $("postForm").scrollIntoView({ block: "center", behavior: "instant" });
}
const subscriptions = new Map();
let stopProfileDetails;
let profileDetails = {};
function renderProfileCard() {
    if (embeddedProfile) return;
    const signedIn = Boolean(state.uid);
    const profile = person(state.uid);
    const name = signedIn ? resolveDisplayName(state.user, state.profile) : tr("Your profile");
    const href = signedIn ? "profile.html" : "signup.html";
    const portrait = $("exploreProfileAvatar");
    portrait.replaceChildren(avatar(signedIn ? profile : { displayName: tr("Your profile"), photoURL: "" }));
    portrait.href = href;
    portrait.setAttribute("aria-label", tr(signedIn ? "View your profile" : "Sign in"));
    const nameLink = $("exploreProfileName");
    nameLink.textContent = name;
    nameLink.title = name;
    nameLink.href = href;
    $("exploreProfileBio").textContent = signedIn ? profileDetails.bio || tr("Add a bio to introduce yourself.") : tr("Sign in to connect with other learners.");
    const location = signedIn ? profileDetails.location || state.profiles[state.uid]?.nationality || "" : "";
    $("exploreProfileLocation").textContent = location;
    $("exploreProfileLocation").hidden = !location;
    const level = $("exploreProfileLevel");
    level.replaceChildren();
    level.hidden = !signedIn || !profile.level;
    if (!level.hidden) level.append(icon("school"), element("span", "", tr("Level {level}", { level: profile.level })));
    $("exploreProfileLink").href = href;
    $("exploreProfileLink").textContent = tr(signedIn ? "View your profile" : "Sign in");
    $("manageBlocks").hidden = !signedIn || embeddedProfile;
}
function reportContent(postId, targetType, targetId) {
    if (!state.uid) return showError(new Error(tr("Sign in to take part in the community.")));
    if (!state.connected) return showError(new Error(tr("You are offline. Reconnect before making changes.")));
    reportTarget = { postId, targetType, targetId };
    $("reportError").hidden = true;
    $("reportReason").value = "spam";
    $("reportDialog").showModal();
}
async function updateBlock(uid, blocked) {
    if (!state.uid) return showError(new Error(tr("Sign in to take part in the community.")));
    if (!state.user?.emailVerified) return showError(new Error(tr("Verify your email before participating.")));
    if (!state.connected) return showError(new Error(tr("You are offline. Reconnect before making changes.")));
    try {
        await setCommunityBlock(uid, blocked);
        $("liveStatus").textContent = tr(blocked ? "Account blocked." : "Account unblocked.");
        $("blockDialog").close();
    } catch (error) { showError(error, $("blockError")); }
}
function confirmBlock(uid) {
    if (uid === state.uid) return;
    blockTarget = uid;
    $("blockTitle").textContent = tr("Block this account?");
    $("blockDescription").textContent = tr("Their posts will be hidden from your community feed, and neither of you can interact with the other's content.");
    $("blockError").hidden = true;
    $("confirmBlock").textContent = tr("Block account");
    $("blockDialog").showModal();
}
function renderBlockedAccounts() {
    const list = $("blockedAccounts");
    if (!list) return;
    const uids = Object.keys(state.blocks || {}).filter((uid) => state.blocks[uid] === true);
    list.replaceChildren(...uids.map((uid) => {
        const row = element("div", "blocked-account-row");
        row.append(element("span", "", person(uid).displayName));
        row.append(button(tr("Unblock"), "secondary-button", () => updateBlock(uid, false)));
        return row;
    }));
    $("blockedEmpty").hidden = uids.length > 0;
}
function renderModerationQueue(reports) {
    const queue = $("moderationReports");
    const entries = Object.entries(reports || {}).filter(([, report]) => report?.status === "open")
        .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
    queue.replaceChildren(...entries.map(([reportId, report]) => {
        const card = element("article", "moderation-report");
        const heading = element("div", "moderation-report-heading");
        heading.append(element("strong", "", tr(report.targetType === "comment" ? "Comment" : "Post")));
        const reasonLabel = ({ spam: "Spam", harassment: "Harassment or bullying", inappropriate: "Inappropriate content", scam: "Scam or misleading content", other: "Other" })[report.reason] || "Other";
        heading.append(element("span", "category-badge", tr(reasonLabel)));
        const excerpt = element("p", "", report.excerpt || "");
        const meta = element("p", "helper", tr("Reported account: {name}", { name: person(report.targetAuthorId).displayName }));
        const actions = element("div", "moderation-actions");
        actions.append(button(tr("Dismiss"), "secondary-button", () => resolveReport(reportId, "dismiss")));
        actions.append(button(tr("Remove reported content"), "text-button", () => {
            moderationTarget = reportId;
            $("moderationDialog").showModal();
        }));
        card.append(heading, excerpt, meta, actions);
        return card;
    }));
    $("moderationEmpty").hidden = entries.length > 0;
    $("moderationError").hidden = true;
}
async function resolveReport(reportId, action) {
    if (!state.user || !developer) return;
    const buttonNode = $("confirmModeration");
    if (action === "remove") buttonNode.disabled = true;
    try {
        const functions = getFunctions(state.user.app, "asia-southeast1");
        await httpsCallable(functions, "moderateCommunityReport")({ reportId, action });
        if (action === "remove") $("moderationDialog").close();
        $("liveStatus").textContent = tr("Report resolved.");
    } catch (error) {
        $("moderationError").textContent = `${tr("Moderation action could not be completed.")} ${error.message || ""}`;
        $("moderationError").hidden = false;
    } finally {
        if (action === "remove") buttonNode.disabled = false;
    }
}
function syncModerationQueue() {
    const shouldSubscribe = Boolean(state.uid && developer && !embeddedProfile);
    if (!shouldSubscribe) {
        moderationStop?.();
        moderationStop = null;
        moderationUid = null;
        $("moderationQueue").hidden = true;
        $("moderationReports").replaceChildren();
        return;
    }
    if (moderationStop && moderationUid === state.uid) return;
    moderationStop?.();
    moderationUid = state.uid;
    $("moderationQueue").hidden = false;
    $("moderationError").hidden = true;
    moderationStop = onValue(query(ref(db, "community_reports"), orderByChild("status"), equalTo("open"), limitToLast(100)), (snapshot) => {
        renderModerationQueue(snapshot.val() || {});
    }, (error) => {
        $("moderationError").textContent = `${tr("Report queue could not load. Refresh to retry.")} ${error.message || ""}`;
        $("moderationError").hidden = false;
    });
}
function renderIdentity() {
    renderProfileCard();
    if (profileAuthor) {
        $("postForm").hidden = state.uid !== profileAuthor;
        if (embeddedProfile) $("communityStatus").hidden = true;
    }
    const name = state.uid ? resolveDisplayName(state.user, state.profile) : "";
    $("welcomeTitle").textContent = name ? tr("Welcome, {name}!", { name }) : tr("Welcome to Quick Check Explore!");
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
        exploreRequest++; exploreData = null; setExploreBusy(false); lastExploreRefresh = 0;
        viewedPosts.clear(); visiblePosts.clear(); viewObserver.disconnect();
        $("postKeywords").replaceChildren();
        $("exploreControls").hidden = embeddedProfile || !next.uid;
        stopProfileDetails?.();
        stopProfileDetails = null;
        profileDetails = {};
        $("exploreProfileError").hidden = true;
        if (next.uid && !embeddedProfile) {
            stopProfileDetails = onValue(ref(db, `community_profiles/${next.uid}`), (snapshot) => {
                if (version !== authVersion) return;
                profileDetails = snapshot.val() || {};
                renderProfileCard();
            }, (error) => {
                if (version !== authVersion) return;
                profileDetails = {};
                console.error("[Community] Profile card could not sync:", error);
                $("exploreProfileError").textContent = tr("Your profile details could not load. Refresh to retry.");
                $("exploreProfileError").hidden = false;
                renderProfileCard();
            });
        }
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
    renderBlockedAccounts();
    syncModerationQueue();
    updatePublishAvailability();
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
    if (accountChanged && next.uid && !embeddedProfile) loadExplore(true);
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
document.querySelectorAll("[data-explore-mode]").forEach(node => node.addEventListener("click", async () => {
    if (exploreBusy || node.dataset.exploreMode === exploreMode) return;
    exploreMode = node.dataset.exploreMode;
    exploreData = null;
    document.querySelectorAll("[data-explore-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.exploreMode === exploreMode)));
    await loadExplore(true);
}));
$("refreshExplore").addEventListener("click", () => {
    if (Date.now() - lastExploreRefresh < 60000) {
        $("exploreStatus").textContent = tr("Wait one minute between recommendation refreshes.");
        return;
    }
    loadExplore();
});
$("postKeywords").addEventListener("change", () => {
    if ($("postKeywords").selectedOptions.length > 3) {
        showError(new Error(tr("Choose up to three distinct learning keywords.")), $("composerError"));
    } else $("composerError").hidden = true;
});
document.querySelectorAll("[data-compose]").forEach((node) => node.addEventListener("click", () => startComposer(node.dataset.compose)));
$("postBody").addEventListener("focus", updateComposerUI);
$("postBody").addEventListener("input", updateComposerUI);
$("postVisibility").addEventListener("change", () => {
    updateComposerUI();
    updateImageFraming();
});
$("postSort").addEventListener("change", renderFeed);
$("clearGroup").addEventListener("click", () => { groupId = ""; renderFilters(); renderFeed(); });
$("viewPeople").addEventListener("click", () => openPeople("online"));
$("findBuddy").addEventListener("click", () => openPeople("buddies"));
$("manageBlocks").addEventListener("click", () => {
    renderBlockedAccounts();
    $("blockedDialog").showModal();
});
$("reportForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!reportTarget) return;
    const submit = $("submitReport");
    submit.disabled = true;
    $("reportError").hidden = true;
    try {
        await reportCommunityContent(reportTarget.postId, reportTarget.targetType, reportTarget.targetId, $("reportReason").value);
        $("reportDialog").close();
        $("liveStatus").textContent = tr("Report submitted for moderator review.");
    } catch (error) { showError(error, $("reportError")); }
    finally { submit.disabled = false; }
});
$("confirmBlock").addEventListener("click", () => {
    if (blockTarget) updateBlock(blockTarget, true);
});
$("confirmModeration").addEventListener("click", () => {
    if (moderationTarget) resolveReport(moderationTarget, "remove");
});
$("reportDialog").addEventListener("close", () => { reportTarget = null; });
$("blockDialog").addEventListener("close", () => { blockTarget = null; });
$("moderationDialog").addEventListener("close", () => { moderationTarget = null; });
$("peopleSearch").addEventListener("input", renderPeopleResults);
$("cancelEdit").addEventListener("click", resetComposer);
$("attachButton").addEventListener("click", () => $("mediaInput").click());
function closeUploadInfo() {
    $("uploadInfoPopup").hidden = true;
    $("uploadInfoButton").setAttribute("aria-expanded", "false");
}
$("uploadInfoButton").addEventListener("click", () => {
    const open = $("uploadInfoPopup").hidden;
    $("uploadInfoPopup").hidden = !open;
    $("uploadInfoButton").setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", event => {
    if (!event.target.closest(".upload-info")) closeUploadInfo();
});
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !$("uploadInfoPopup").hidden) {
        closeUploadInfo();
        $("uploadInfoButton").focus();
    }
});
function formatFeedImage(image, settings = {}) {
    settings = imageDisplaySettings(settings);
    image.dataset.feedFormat = settings.imageFormat;
    image.style.objectFit = settings.imageFit;
    image.style.objectPosition = `50% ${settings.imageY}%`;
    const sizeFrame = () => {
        applyImageLayout(image, settings);
        if (image.parentElement === $("mediaPreview")) updateImageFraming();
    };
    image.addEventListener("load", sizeFrame);
    if (image.naturalWidth && image.naturalHeight) sizeFrame();
}
function applyImageLayout(image, settings) {
    const layout = imageFrameLayout(image.naturalWidth, image.naturalHeight, settings);
    image.style.aspectRatio = String(layout.ratio);
    image.style.objectFit = layout.fit;
    image.style.objectPosition = layout.fit === "contain" ? "50% 50%" : `50% ${settings.imageY}%`;
    return layout;
}
function framingSettings() {
    return imageDisplaySettings({ imageFit: $("imageFit").value, imageY: Number($("imageY").value) });
}
function updateImageFraming() {
    const settings = framingSettings();
    $("imageYValue").textContent = `${settings.imageY}%`;
    $("imageFramingHint").textContent = tr("Tall photos can be cropped to 4:5 or shown whole. Shorter photos keep their natural height.");
    document.querySelectorAll("[data-image-fit]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.imageFit === settings.imageFit)));
    const preview = $("mediaPreview").querySelector("img");
    if (!preview?.naturalWidth) return;
    const layout = applyImageLayout(preview, settings);
    $("imageFitChoices").hidden = !layout.tall;
    $("imagePosition").hidden = !layout.tall || layout.fit !== "cover";
    $("resetImageFraming").hidden = !layout.tall;
}
function resetImageFraming() {
    $("imageFit").value = "cover";
    $("imageY").value = "50";
    updateImageFraming();
}
$("imageY").addEventListener("input", updateImageFraming);
document.querySelectorAll("[data-image-fit]").forEach(button => button.addEventListener("click", () => {
    $("imageFit").value = button.dataset.imageFit;
    updateImageFraming();
}));
$("resetImageFraming").addEventListener("click", resetImageFraming);
$("mediaInput").addEventListener("change", () => {
    const selected = $("mediaInput").files[0];
    if (!selected) return;
    clearPreview();
    let mediaKind;
    try { mediaKind = validateMediaFile(selected); }
    catch (error) {
        showError(new Error(tr(error.message)), $("composerError"));
        return;
    }
    file = selected;
    mediaValidationPending = mediaKind === "video";
    previewURL = URL.createObjectURL(selected);
    const preview = element(mediaKind === "video" ? "video" : "img");
    if (mediaKind === "video") {
        preview.controls = true;
        preview.preload = "metadata";
        preview.playsInline = true;
        preview.addEventListener("loadedmetadata", () => {
            if (file !== selected) return;
            try {
                validateMediaFile(selected, preview.duration);
                mediaValidationPending = false;
                updatePublishAvailability();
                $("composerError").hidden = true;
            } catch (error) {
                clearPreview();
                showError(new Error(tr(error.message)), $("composerError"));
            }
        }, { once: true });
    } else {
        formatFeedImage(preview, { visibility: $("postVisibility").value });
        $("imageFraming").hidden = false;
    }
    preview.addEventListener("error", () => {
        if (file !== selected) return;
        clearPreview();
        showError(new Error(tr("This attachment could not load.")), $("composerError"));
    }, { once: true });
    preview.src = previewURL;
    if (mediaKind === "image") preview.alt = tr("Attachment preview");
    $("mediaPreview").append(preview, button(tr("Remove attachment"), "text-button", clearPreview));
    $("mediaPreview").hidden = false;
    if (mediaKind === "image") updateImageFraming();
    updatePublishAvailability();
    $("composerError").hidden = true;
});
$("postForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (publishing) return;
    if (mediaValidationPending) return showError(new Error(tr("Wait for video validation to finish before posting.")), $("composerError"));
    if (!state.uid || !state.connected) return showError(new Error(tr("Sign in and connect before posting.")), $("composerError"));
    publishing = true;
    const version = authVersion;
    const submit = $("publishButton");
    submit.disabled = true;
    submit.textContent = tr(file?.type.startsWith("image/") && file.size > 2 * 1024 * 1024 ? "Compressing picture..." : "Saving...");
    $("composerError").hidden = true;
    const fields = [...$("postForm").querySelectorAll("input, textarea, select, button")];
    const disabled = fields.map((field) => field.disabled);
    const input = { title: $("postBody").value.trim().slice(0, 80).split("\n")[0], body: $("postBody").value, category: composerCategory, groupId: composerGroupId, visibility: $("postVisibility").value, keywords: [...$("postKeywords").selectedOptions].map(option => option.value), ...framingSettings() };
    closeUploadInfo();
    fields.forEach((field) => { field.disabled = true; });
    try {
        const id = await savePost(input, file, developer, editingId);
        if (version !== authVersion) return;
        resetComposer();
        category = "all";
        groupId = "";
        renderFilters();
        renderFeed();
        lastExploreRefresh = 0;
        await loadExplore(true);
        $("liveStatus").textContent = tr("Your post has been saved.");
        document.getElementById(`post-${id}`)?.scrollIntoView({ block: "center", behavior: "instant" });
    } catch (error) { if (version === authVersion) showError(error, $("composerError")); }
    finally {
        publishing = false;
        fields.forEach((field, index) => { field.disabled = disabled[index]; });
        $("attachButton").disabled = !state.uid || Boolean(editingId);
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
    clearInterval(viewClock);
    viewObserver.disconnect();
    visiblePosts.clear();
    clearInterval(clock);
    stopProfileDetails?.();
    moderationStop?.();
    privateMedia.forEach((_, id) => releasePrivateMedia(id));
    unsubscribe();
    subscriptions.forEach((stop) => stop());
    clearPreview();
});
