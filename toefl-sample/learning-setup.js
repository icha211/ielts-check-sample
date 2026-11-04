import { auth } from "./js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getExploreSetup, saveExplorePreferences } from "./js/explore-service.js?v=20261104-learning-setup";

window.QCPrefs?.addTranslations("id", {
    "Account settings": "Pengaturan akun", "Your learning journey": "Perjalanan belajar Anda",
    "Make room for your next goal.": "Mulai langkah menuju tujuan Anda.",
    "Tell us how you like to learn. We will use your choices to match you with practice partners.": "Ceritakan cara belajar Anda. Pilihan Anda digunakan untuk mencari teman latihan yang cocok.",
    "For students and teachers. Optional, private by default, and editable in account settings.": "Untuk pelajar dan tutor. Opsional, pribadi secara bawaan, dan dapat diubah di pengaturan akun.",
    "Loading your preferences...": "Memuat preferensi Anda...", "Retry": "Coba lagi",
    "Back": "Kembali", "Continue": "Lanjut", "Save preferences": "Simpan preferensi", "Saving...": "Menyimpan...",
    "Skip for now": "Lewati dulu", "Cancel changes": "Batalkan perubahan",
    "Answer this later": "Jawab nanti",
    "Skipping leaves your saved preferences unchanged. You can finish later in account settings.": "Melewati tidak mengubah preferensi tersimpan. Anda dapat menyelesaikannya di pengaturan akun.",
    "Goals": "Tujuan", "Level": "Tingkat", "Skills": "Keterampilan", "Learning style": "Gaya belajar", "Privacy": "Privasi",
    "What are you working toward?": "Apa tujuan belajar Anda?",
    "Choose the goals that matter to you. Choose more than one if you like.": "Pilih tujuan yang penting bagi Anda. Anda boleh memilih lebih dari satu.",
    "Where are you starting?": "Bagaimana kemampuan Anda saat ini?",
    "Choose the level that best describes your English today. This is not a test.": "Pilih tingkat bahasa Inggris Anda saat ini. Ini bukan tes.",
    "What would you like to practice?": "Apa yang ingin Anda latih?",
    "Choose the skills you want to build with a practice partner.": "Pilih keterampilan yang ingin Anda latih bersama teman.",
    "How do you like to learn?": "Bagaimana Anda suka belajar?",
    "Choose the ways you feel comfortable practicing.": "Pilih cara berlatih yang membuat Anda nyaman.",
    "You decide what to share.": "Anda menentukan apa yang dibagikan.",
    "Both options are optional. Your preferences stay private unless you choose partner discovery.": "Kedua pilihan opsional. Preferensi tetap pribadi kecuali Anda mengaktifkan penemuan teman latihan.",
    "Recommend me as a practice partner. My selected practice preferences will be shown to signed-in learners.": "Rekomendasikan saya sebagai teman latihan. Preferensi latihan saya ditampilkan kepada pelajar yang masuk.",
    "Personalize recommendations using posts I view for more than 10 seconds or videos I finish.": "Personalisasi rekomendasi dari postingan yang saya lihat lebih dari 10 detik atau video yang saya selesaikan.",
    "Off by default. Likes, comments, saves and shares still inform recommendations. Turning this off stops viewing events and excludes previous views from your learning interests.": "Nonaktif secara bawaan. Suka, komentar, simpan, dan bagikan tetap memengaruhi rekomendasi. Menonaktifkan ini menghentikan pencatatan tampilan dan mengecualikan tampilan sebelumnya dari minat belajar Anda.",
    "Step {step} of {total}": "Langkah {step} dari {total}", "{count} selected": "{count} dipilih",
    "Choose at least one option to continue, or skip setup.": "Pilih setidaknya satu opsi untuk melanjutkan, atau lewati pengaturan.",
    "Not selected": "Belum dipilih", "Your choices": "Pilihan Anda",
    "Beginner": "Pemula", "Intermediate": "Menengah", "Advanced": "Mahir",
    "IELTS Preparation": "Persiapan IELTS", "TOEFL ITP Preparation": "Persiapan TOEFL ITP", "TOEFL iBT Preparation": "Persiapan TOEFL iBT",
    "Duolingo English Test Preparation": "Persiapan Duolingo English Test", "Scholarship Preparation": "Persiapan beasiswa",
    "Daily English Conversation": "Percakapan bahasa Inggris sehari-hari", "Business English": "Bahasa Inggris bisnis", "Academic English": "Bahasa Inggris akademik",
    "English for Beginners": "Bahasa Inggris untuk pemula", "Voice Call": "Panggilan suara", "Video Call": "Panggilan video",
    "Text Conversation": "Percakapan teks", "Group Discussion": "Diskusi kelompok", "One-on-One Practice": "Latihan satu lawan satu",
    "Speaking": "Berbicara", "Listening": "Mendengarkan", "Pronunciation": "Pelafalan", "Vocabulary": "Kosakata", "Grammar": "Tata bahasa", "Writing": "Menulis",
    "Could not load your preferences. Retry before making changes.": "Preferensi tidak dapat dimuat. Coba lagi sebelum mengubahnya.",
    "Could not save your preferences. Your selections are still here. Please retry.": "Preferensi tidak dapat disimpan. Pilihan Anda tetap tersedia. Coba lagi."
});
const $ = id => document.getElementById(id);
const tr = (text, vars) => window.QCPrefs?.t(text, vars) || text.replace(/\{(\w+)\}/g, (_, key) => vars?.[key] ?? "");
const steps = [
    { key: "goals", label: "Goals", title: "What are you working toward?", help: "Choose the goals that matter to you. Choose more than one if you like." },
    { key: "level", label: "Level", title: "Where are you starting?", help: "Choose the level that best describes your English today. This is not a test." },
    { key: "skills", label: "Skills", title: "What would you like to practice?", help: "Choose the skills you want to build with a practice partner." },
    { key: "styles", label: "Learning style", title: "How do you like to learn?", help: "Choose the ways you feel comfortable practicing." },
    { key: "privacy", label: "Privacy", title: "You decide what to share.", help: "Both options are optional. Your preferences stay private unless you choose partner discovery." }
];
let currentUser, generation = 0, step = 0, data = null, values = null, busy = false;
const params = new URLSearchParams(location.search);
const destination = () => params.get("from") === "profile" ? "profile.html" : params.get("from") === "explore" ? "social.html#community" :
    data.role === "teacher" ? "tutor-check.html?studio=1" : "index.html";
function node(tag, text = "", className = "") {
    const result = document.createElement(tag);
    result.textContent = text;
    result.className = className;
    return result;
}
function showError(message, error) {
    console.error("[LearningSetup]", error);
    $("setupError").textContent = tr(message);
    $("setupError").hidden = false;
}
function validData(result) {
    return result && ["teacher", "student"].includes(result.role) && result.preferences &&
        typeof result.preferences.viewTracking === "boolean" && typeof result.preferences.discoverable === "boolean" &&
        ["goals", "skills", "styles"].every(key => Array.isArray(result.preferences[key])) &&
        typeof result.preferences.level === "string" &&
        steps.slice(0, 4).every(({ key }) => Array.isArray(result.practiceOptions?.[key]) && result.practiceOptions[key].every(value => typeof value === "string"));
}
function setBusy(value) {
    busy = value;
    $("stepChoices").disabled = value;
    $("setupBack").disabled = value || step === 0;
    $("setupSkip").disabled = value;
    $("setupLater").disabled = value;
    updateNext();
}
function updateNext() {
    const key = steps[step].key;
    const count = key === "privacy" ? 0 : key === "level" ? Number(Boolean(values?.level)) : values?.[key].length || 0;
    $("setupNext").disabled = busy || !values || (key !== "privacy" && count === 0);
    $("setupNextLabel").textContent = tr(busy ? "Saving..." : step === 4 ? "Save preferences" : "Continue");
    $("selectionHint").textContent = key === "privacy" ? "" : count ? tr("{count} selected", { count }) : tr("Choose at least one option to continue, or skip setup.");
}
function render(focus = true) {
    const current = steps[step];
    $("stepTitle").textContent = tr(current.title);
    $("stepHelp").textContent = tr(current.help);
    $("stepCount").textContent = tr("Step {step} of {total}", { step: step + 1, total: 5 });
    $("stepFraction").textContent = `${String(step + 1).padStart(2, "0")} / 05`;
    $("stepMeter").style.transform = `scaleX(${(step + 1) / 5})`;
    $("setupForm").dataset.step = current.key;
    $("setupProgress").replaceChildren(...steps.map((entry, index) => {
        const item = node("li");
        if (index === step) item.setAttribute("aria-current", "step");
        item.append(node("span", String(index + 1), "progress-number"), node("span", tr(entry.label), "progress-label"));
        return item;
    }));
    const choices = $("stepChoices");
    choices.replaceChildren();
    const options = current.key === "privacy" ? [
        ["discoverable", "Recommend me as a practice partner. My selected practice preferences will be shown to signed-in learners."],
        ["viewTracking", "Personalize recommendations using posts I view for more than 10 seconds or videos I finish."]
    ] : data.practiceOptions[current.key].map(value => [value, value]);
    for (const [value, text] of options) {
        const shell = node("div", "", "setup-choice-shell");
        const label = node("label", "", "setup-choice");
        const input = document.createElement("input");
        input.type = current.key === "level" ? "radio" : "checkbox";
        input.name = current.key === "privacy" ? value : current.key;
        input.value = value;
        input.checked = current.key === "privacy" ? values[value] : current.key === "level" ? values.level === value : values[current.key].includes(value);
        input.addEventListener("change", () => {
            if (current.key === "privacy") values[value] = input.checked;
            else if (current.key === "level") values.level = value;
            else values[current.key] = [...choices.querySelectorAll("input:checked")].map(option => option.value);
            updateNext();
        });
        label.append(input, node("span", tr(text)));
        shell.append(label);
        choices.append(shell);
    }
    const review = $("setupReview");
    review.hidden = step !== 4;
    review.replaceChildren();
    if (step === 4) {
        choices.append(node("p", tr("Off by default. Likes, comments, saves and shares still inform recommendations. Turning this off stops viewing events and excludes previous views from your learning interests."), "setup-note"));
        review.append(node("h3", tr("Your choices")));
        for (const entry of steps.slice(0, 4)) {
            const selected = entry.key === "level" ? [values.level].filter(Boolean) : values[entry.key];
            review.append(node("p", `${tr(entry.label)}: ${selected.length ? selected.map(value => tr(value)).join(", ") : tr("Not selected")}`));
        }
    }
    $("setupBack").disabled = step === 0;
    $("setupLater").hidden = step === 4;
    $("setupSkip").textContent = tr(params.has("from") ? "Cancel changes" : "Skip for now");
    setBusy(false);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        $("setupForm").getAnimations().forEach(animation => animation.cancel());
        $("setupForm").animate([
            { opacity: 0, transform: "translateY(14px)" },
            { opacity: 1, transform: "translateY(0)" }
        ], { duration: 420, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
    }
    if (focus) $("stepTitle").focus();
}
async function load() {
    const version = generation;
    $("setupMain").setAttribute("aria-busy", "true");
    $("setupLoading").hidden = false;
    $("setupForm").hidden = true;
    $("setupRetry").hidden = true;
    $("setupError").hidden = true;
    try {
        const result = await getExploreSetup();
        if (version !== generation) return;
        if (!validData(result)) throw new Error("Invalid learning setup response.");
        data = result;
        values = { ...result.preferences, goals: [...result.preferences.goals], skills: [...result.preferences.skills], styles: [...result.preferences.styles] };
        step = 0;
        $("setupForm").hidden = false;
        render(false);
    } catch (error) {
        if (version !== generation) return;
        showError("Could not load your preferences. Retry before making changes.", error);
        $("setupRetry").hidden = false;
    } finally {
        if (version === generation) {
            $("setupLoading").hidden = true;
            $("setupMain").setAttribute("aria-busy", "false");
        }
    }
}
onAuthStateChanged(auth, user => {
    generation++;
    currentUser = user;
    data = null;
    values = null;
    if (!user || user.isAnonymous) { location.replace("signup.html"); return; }
    if (!user.emailVerified) { location.replace("signup.html?verify=required"); return; }
    load();
});
$("setupRetry").addEventListener("click", load);
$("setupBack").addEventListener("click", () => { if (!busy && step > 0) { step--; render(); } });
$("setupLater").addEventListener("click", () => { if (!busy && step < 4) { step++; render(); } });
$("setupSkip").addEventListener("click", () => { if (!busy && data) location.assign(destination()); });
$("setupForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !values || $("setupNext").disabled) return;
    if (step < 4) { step++; render(); return; }
    const version = generation;
    setBusy(true);
    $("setupError").hidden = true;
    try {
        const result = await saveExplorePreferences({
            goals: values.goals, level: values.level, skills: values.skills, styles: values.styles,
            discoverable: values.discoverable, viewTracking: values.viewTracking
        });
        if (version !== generation || !currentUser) return;
        if (!result?.preferences || typeof result.preferences.viewTracking !== "boolean") throw new Error("Invalid preference save response.");
        location.assign(destination());
    } catch (error) {
        if (version === generation) showError("Could not save your preferences. Your selections are still here. Please retry.", error);
    } finally {
        if (version === generation) setBusy(false);
    }
});
window.addEventListener("qc:langchange", () => { if (values && !busy) render(false); });
window.QCPrefs?.apply();
