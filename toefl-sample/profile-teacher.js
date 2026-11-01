import { db } from "./js/firebase-config.js";
import { onValue, ref } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { watchTeachingRole, watchTeachingProfile, watchCatalog, watchReviews, saveTeachingProfile, toggleLibrary } from "./js/tutor-service.js?v=20261101-teacher";
import { teachingSummary, courseStats, TUTOR_CATEGORIES, TUTOR_TYPES, rupiah } from "./js/tutor-model.js?v=20261101-teacher";
import { safeMediaURL } from "./js/community-model.js";

const $ = id => document.getElementById(id);
const tr = text => window.QCPrefs?.t(text) || text;
window.QCPrefs?.addTranslations("id", {
    "Teacher": "Pengajar", "Teacher profile": "Profil pengajar", "Overview": "Ringkasan",
    "Courses": "Kursus", "Reviews": "Ulasan", "Teaching background": "Latar belakang mengajar",
    "Book a class": "Pesan kelas", "Manage your courses": "Kelola kursus Anda",
    "Choose a course": "Pilih kursus", "Open teacher studio": "Buka studio pengajar",
    "No payment is collected here.": "Tidak ada pembayaran yang diproses di sini.",
    "No reviews yet": "Belum ada ulasan", "My teaching approach": "Pendekatan mengajar saya",
    "Years exp.": "Tahun mengajar", "Rating": "Penilaian", "self-reported": "Dilaporkan sendiri",
    "Save": "Simpan", "Saved": "Tersimpan", "Courses from": "Harga kursus mulai dari",
    "Teaching profile saved.": "Profil pengajar disimpan.",
    "Loading teacher information...": "Memuat informasi pengajar...",
    "No courses are available for booking right now.": "Belum ada kursus yang dapat dipesan.",
    "Experience not shared yet.": "Pengalaman belum dibagikan.",
    "No qualification shared yet.": "Kualifikasi belum dibagikan."
});
const node = (tag, className = "", text = "") => {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
};
export function createTeacherProfile(onChange) {
    let uid = "", viewer = "", epoch = 0, isTeacher = false, ready = false;
    let background = {}, courses = {}, reviews = {}, favorites = {}, stops = [], teacherStops = [];
    let selected = "teacherOverview", context;
    const bioCard = $("profileBio").closest(".profile-card");
    const bioParent = bioCard.parentElement;
    const fail = err => {
        console.error("[TeacherProfile]", err);
        $("teacherStatus").textContent = tr(`Teacher information could not sync. Refresh to retry. ${err.message}`);
        $("teacherStatus").dataset.error = "true";
        $("profileSocialStatus").textContent = $("teacherStatus").textContent;
        $("profileSocialStatus").dataset.error = "true";
    };
    function chooseTab(id, focus = false) {
        selected = id;
        document.querySelectorAll("[data-teacher-tab]").forEach(tab => {
            const active = tab.dataset.teacherTab === id;
            tab.setAttribute("aria-selected", String(active));
            tab.tabIndex = active ? 0 : -1;
            $(tab.dataset.teacherTab).hidden = !active;
            if (active && focus) tab.focus();
        });
        $("teacherContent").hidden = id === "communityProfileLayout";
    }
    const tabs = [...document.querySelectorAll("[data-teacher-tab]")];
    tabs.forEach((tab, index) => {
        tab.addEventListener("click", () => chooseTab(tab.dataset.teacherTab));
        tab.addEventListener("keydown", event => {
            let next;
            if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
            if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
            if (event.key === "Home") next = 0;
            if (event.key === "End") next = tabs.length - 1;
            if (next !== undefined) { event.preventDefault(); chooseTab(tabs[next].dataset.teacherTab, true); }
        });
    });
    $("teacherViewCourses").addEventListener("click", () => chooseTab("teacherCourses", true));
    $("teacherEdit").addEventListener("click", () => {
        const form = $("teacherForm");
        for (const key of ["experience", "qualification", "about", "imageURL"]) form.elements.namedItem(key).value = background[key] ?? (key === "experience" ? 0 : "");
        $("teacherFormError").hidden = true;
        form.hidden = false;
        form.elements.namedItem("experience").focus();
    });
    $("teacherCancel").addEventListener("click", () => { $("teacherForm").hidden = true; $("teacherEdit").focus(); });
    $("teacherForm").addEventListener("submit", async event => {
        event.preventDefault();
        const form = $("teacherForm"), current = epoch;
        if (!isTeacher || uid !== viewer) { fail(new Error("You can only edit your own teaching profile.")); return; }
        const input = Object.fromEntries(new FormData(form));
        input.experience = Number(input.experience);
        const fields = [...form.elements];
        fields.forEach(field => field.disabled = true);
        $("teacherFormError").hidden = true;
        try {
            await saveTeachingProfile(input);
            if (current !== epoch) return;
            form.hidden = true;
            $("teacherStatus").textContent = tr("Teaching profile saved.");
            $("teacherEdit").focus();
        } catch (err) {
            if (current === epoch) {
                console.error("[TeacherProfile]", err);
                $("teacherFormError").textContent = tr(err.message);
                $("teacherFormError").hidden = false;
            }
        } finally { fields.forEach(field => field.disabled = false); }
    });
    function courseLink(course) { return `tutor-check.html?teacher=${encodeURIComponent(uid)}&course=${encodeURIComponent(course.id)}`; }
    function courseCard(course) {
        const article = node("article", "profile-card teacher-course");
        const url = safeMediaURL(course.coverURL);
        const cover = node(url ? "img" : "div", "teacher-course-cover");
        if (url) {
            cover.src = url; cover.alt = `${course.title} course cover`; cover.loading = "lazy";
            cover.addEventListener("error", () => cover.replaceWith(node("div", "teacher-course-cover", tr("Course image unavailable"))), { once: true });
        } else {
            const icon = node("i", `ti ti-${TUTOR_CATEGORIES.find(([id]) => id === course.category)?.[2] || "book"}`);
            icon.setAttribute("aria-hidden", "true"); cover.append(icon);
        }
        const copy = node("div", "teacher-course-copy");
        const stats = courseStats(reviews[course.id]);
        const price = node("p", "teacher-course-price", rupiah(course.price));
        if (course.originalPrice > course.price) price.append(node("del", "", rupiah(course.originalPrice)));
        const link = node("a", "profile-button", tr("View details →"));
        link.href = courseLink(course);
        copy.append(node("h3", "", course.title), node("span", "teacher-course-rating", stats.count ? `★ ${stats.rating.toFixed(1)} · ${stats.count} ${tr(stats.count === 1 ? "review" : "reviews")}` : tr("Not yet rated")),
            node("p", "profile-muted", TUTOR_TYPES[course.type]), price);
        const actions = node("div", "teacher-course-actions");
        const save = node("button", "profile-button teacher-save");
        const saveIcon = node("i", `ti ti-${favorites[course.id] ? "heart-filled" : "heart"}`);
        saveIcon.setAttribute("aria-hidden", "true");
        save.append(saveIcon);
        save.dataset.course = course.id;
        save.type = "button";
        save.setAttribute("aria-label", `${favorites[course.id] ? "Unsave" : "Save"} ${course.title}`);
        save.setAttribute("aria-pressed", String(Boolean(favorites[course.id])));
        save.addEventListener("click", async () => {
            if (!viewer) { fail(new Error("Sign in to save courses.")); return; }
            const current = epoch;
            save.disabled = true;
            try { await toggleLibrary("favorites", course.id, !favorites[course.id]); }
            catch (err) { if (current === epoch) fail(err); }
            finally { save.disabled = false; }
        });
        actions.append(link, save);
        copy.append(actions); article.append(cover, copy);
        return article;
    }
    function render(next) {
        context = next;
        const own = uid === viewer;
        $("teacherProfile").hidden = !isTeacher;
        $("teacherHeadline").hidden = !isTeacher;
        $("teacherMetrics").hidden = !isTeacher;
        $("studentProfileStats").hidden = isTeacher;
        document.querySelector(".profile-page").classList.toggle("teacher-profile", isTeacher);
        document.body.classList.toggle("teacher-profile-view", isTeacher);
        $("profileBack").href = isTeacher ? "tutor-check.html" : "social.html";
        $("profileBack").textContent = tr(isTeacher ? "← Marketplace" : "← Explore");
        if (!isTeacher) {
            if (bioCard.parentElement !== bioParent) bioParent.prepend(bioCard);
            $("communityProfileLayout").hidden = false;
            return;
        }
        $("teacherBioSlot").append(bioCard);
        chooseTab(selected);
        if (!ready) {
            $("teacherContent").hidden = true;
            $("teacherHeadline").hidden = true;
            $("teacherMetrics").hidden = true;
            return;
        }
        $("teacherForm").hidden = $("teacherForm").hidden || !own;
        $("teacherEdit").hidden = !own;
        $("teacherEdit").disabled = !ready;
        $("teacherStudioLink").hidden = !own;
        $("profileLevel").textContent = tr("Teacher");
        const summary = teachingSummary(courses, reviews, uid);
        if (!viewer) $("profileDisplayName").textContent = summary.courses[0]?.teacherName || tr("Teacher profile");
        const headline = $("teacherHeadline");
        headline.replaceChildren(node("p", "teacher-headline-rating", summary.rating === null ? tr("No reviews yet") : `★ ${summary.rating.toFixed(1)} · ${summary.reviews.length} ${tr(summary.reviews.length === 1 ? "review" : "reviews")}`));
        if (background.qualification) headline.prepend(node("p", "profile-muted", `${background.qualification} · ${tr("self-reported")}`));
        const tags = node("div", "profile-tags");
        const categories = new Set(summary.courses.map(course => course.category));
        categories.forEach(id => tags.append(node("span", "profile-tag", TUTOR_CATEGORIES.find(([key]) => key === id)?.[1] || id)));
        headline.append(tags);
        $("teacherMetrics").replaceChildren(...[
            [background.experience ?? "—", tr("Years exp.")],
            [summary.courses.length, tr("Courses")],
            [summary.rating === null ? "—" : summary.rating.toFixed(1), tr("Rating")]
        ].map(([value, label]) => {
            const metric = node("div"); metric.append(node("strong", "", value), node("span", "", label)); return metric;
        }));
        const introduction = $("teacherIntroduction"), copy = node("div");
        copy.append(node("h2", "", tr("My teaching approach")), node("p", "teacher-copy", background.about || tr("This teacher has not added a teaching introduction yet.")));
        introduction.replaceChildren(copy);
        const imageURL = safeMediaURL(background.imageURL);
        if (imageURL) {
            const image = node("img"); image.src = imageURL; image.alt = `${next.profile.displayName} teaching introduction`;
            image.addEventListener("error", () => image.replaceWith(node("p", "profile-muted", tr("Introduction image unavailable"))), { once: true });
            introduction.append(image);
        }
        const all = $("teacherCourseList"), preview = $("teacherCoursePreview");
        const focusedSave = document.activeElement?.closest(".teacher-save");
        const focusedList = focusedSave?.closest(".teacher-course-grid");
        const focusedCourse = focusedSave?.dataset.course;
        all.replaceChildren(...summary.courses.map(courseCard));
        preview.replaceChildren(...summary.courses.slice(0, 3).map(courseCard));
        if (focusedCourse) [...focusedList.querySelectorAll(".teacher-save")].find(button => button.dataset.course === focusedCourse)?.focus();
        if (!summary.courses.length) {
            for (const target of [all, preview]) target.append(node("p", "teacher-empty", tr(own ? "No published courses yet. Create a course in your teacher studio." : "This teacher has no courses open for enrollment yet.")));
        }
        const reviewList = $("teacherReviewList");
        reviewList.replaceChildren(...summary.reviews.map(review => {
            const row = node("article", "teacher-review");
            row.append(node("strong", "", `${review.studentName} · ${review.rating}/5`), node("p", "profile-muted", review.courseTitle), node("p", "", review.text));
            return row;
        }));
        if (!summary.reviews.length) reviewList.append(node("p", "profile-muted", tr("Reviews will appear after accepted learners share feedback.")));
        $("teacherTrust").replaceChildren(node("p", "", `${summary.reviewers} ${tr(summary.reviewers === 1 ? "learner has shared a review." : "learners have shared reviews.")}`),
            node("p", "profile-muted", tr("Reviewer count is not a total enrollment count.")));
        $("teacherBackground").replaceChildren(
            node("p", "", background.experience === undefined ? tr("Experience not shared yet.") : `${background.experience} ${tr("years of teaching experience (self-reported)")}`),
            node("p", "", background.qualification ? `${background.qualification} · ${tr("self-reported")}` : tr("No qualification shared yet.")),
            node("p", "teacher-copy", background.about || next.details.bio || tr("No teaching background shared yet.")));
        const booking = $("teacherBooking");
        $("teacherBookingTitle").textContent = tr(own ? "Manage your courses" : "Book a class");
        booking.replaceChildren();
        if (own) {
            const link = node("a", "profile-button profile-button-primary teacher-booking-link", tr("Open teacher studio"));
            link.href = "tutor-check.html?studio=1";
            booking.append(node("p", "", tr("Publish courses and respond to enrollment requests.")), link);
        } else if (summary.courses.length) {
            const cheapest = [...summary.courses].sort((a, b) => a.price - b.price)[0];
            const link = node("a", "profile-button profile-button-primary teacher-booking-link", tr("Choose a course"));
            link.href = `tutor-check.html?teacher=${encodeURIComponent(uid)}`;
            booking.append(node("p", "profile-muted", tr("Courses from")), node("strong", "teacher-price", rupiah(cheapest.price)),
                node("p", "", tr("Choose a course to request enrollment. The teacher confirms the schedule.")), link);
        } else booking.append(node("p", "profile-muted", tr("No courses are available for booking right now.")));
        booking.append(node("p", "profile-muted", tr("No payment is collected here.")));
    }
    function setTarget(target, currentViewer) {
        stops.forEach(stop => stop()); teacherStops.forEach(stop => stop());
        uid = target; viewer = currentViewer || ""; epoch++; isTeacher = false; ready = false;
        background = {}; courses = {}; reviews = {}; favorites = {}; selected = "teacherOverview";
        $("teacherForm").hidden = true;
        $("teacherStatus").textContent = tr("Loading teacher information...");
        $("teacherStatus").dataset.error = "false";
        const current = epoch;
        const guarded = fn => data => { if (current === epoch) { fn(data); onChange(); } };
        const guardedError = err => { if (current === epoch) fail(err); };
        stops = [watchTeachingRole(uid, guarded(value => {
            isTeacher = value;
            teacherStops.forEach(stop => stop()); teacherStops = [];
            if (!value) return;
            ready = false;
            const loaded = new Set();
            const loadedPart = part => {
                loaded.add(part);
                ready = loaded.size === 3;
                if (ready && $("teacherStatus").dataset.error !== "true") $("teacherStatus").textContent = "";
            };
            teacherStops = [
                watchTeachingProfile(uid, guarded(data => { background = data; loadedPart("profile"); }), guardedError),
                watchCatalog(guarded(data => { courses = data; loadedPart("courses"); }), guardedError),
                watchReviews(guarded(data => { reviews = data; loadedPart("reviews"); }), guardedError)
            ];
            if (viewer) teacherStops.push(onValue(ref(db, `tutor_library/${viewer}/favorites`), snap => {
                if (current !== epoch) return;
                favorites = snap.val() || {};
                if (context) render(context);
            }, guardedError));
        }), guardedError)];
    }
    return { render, setTarget, destroy() { epoch++; stops.forEach(stop => stop()); teacherStops.forEach(stop => stop()); } };
}
