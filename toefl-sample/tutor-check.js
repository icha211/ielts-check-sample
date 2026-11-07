import { auth } from "./js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, getBlob, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { TUTOR_CATEGORIES, TUTOR_TYPES, selectCourses, courseStats, teachingSummary, rupiah, validateCourse } from "./js/tutor-model.js?v=20261108-course-card";
import { watchCatalog, watchReviews, watchTeachingProfile, watchTeacherIdentity, watchCourseStats, watchAccount, saveCourse, saveCourseDraft, deleteCourseDraft, saveTeachingProfile, setCourseState, toggleLibrary, requestEnrollment, changeRequest, submitReview, requestTutorVerification, getTutorVerificationStatus, listTutorVerificationRequests, reviewTutorVerification } from "./js/tutor-service.js?v=20261108-capacity";

const $ = id => document.getElementById(id);
$("editorFieldBank").append($("courseEditorFields").content.cloneNode(true));
let courses = {}, reviews = {}, library = {}, requests = {}, inbox = {};
let drafts = {}, editingDraftId = "";
const editorSource = () => drafts[editingDraftId] || courses[editingId];
let uid = "", role = "student", roleReady = false, authReady = false, version = 0, accountStop = () => {};
let category = "", editingId = "", detailId = "";
let studioCourseFilter = "all";
let selectedTeacher = new URLSearchParams(location.search).get("teacher") || "";
let detailProfile = {}, detailProfileReady = false, detailProfileStop = () => {};
let catalogReady = false, reviewsReady = false, checkoutBusy = false;
let catalogFailure = "", reviewsFailure = "";
const pendingEnrollments = new Set();
let verificationStatus = { status: "loading" }, verificationLoading = false, verificationBusy = false, isMarketplaceModerator = false;
const teacherIdentities = {}, publicStudents = {}, publicReserved = {};
const teacherIdentityStops = new Map(), courseStudentStops = new Map();
const filterPanel = document.querySelector(".filter-panel");
const filterSidebar = elSidebarFilters();
function elSidebarFilters() {
    const container = document.createElement("div");
    container.id = "marketplaceSidebarFilters";
    $("qcnavSidebar").append(container);
    return container;
}
function courseTeacher(course) {
    return teacherIdentities[course.teacherId]?.displayName || course.teacherName;
}
function reviewedBadge(uid) {
    if (teacherIdentities[uid]?.verified !== true) return null;
    const badge = el("span", "verified-badge", "Profile reviewed");
    badge.title = "A Quick Check moderator reviewed this tutor profile; it is not a guarantee of course quality.";
    return badge;
}
function syncPublicCourseData() {
    const teacherIds = new Set(Object.values(courses).map(course => course.teacherId));
    for (const [id, stop] of teacherIdentityStops) {
        if (!teacherIds.has(id)) { stop(); teacherIdentityStops.delete(id); delete teacherIdentities[id]; }
    }
    for (const id of teacherIds) {
        if (teacherIdentityStops.has(id)) continue;
        teacherIdentityStops.set(id, watchTeacherIdentity(id, profile => {
            teacherIdentities[id] = profile;
            renderCatalog();
            if (!$("coursePage").hidden) renderDetail();
        }, failure => {
            console.error("[TutorCheck] Public teacher sync failed:", failure);
            error("Some course details could not sync. You can still browse courses. Refresh to retry.");
        }));
    }
    for (const [id, stop] of courseStudentStops) {
        if (!(id in courses)) { stop(); courseStudentStops.delete(id); delete publicStudents[id]; delete publicReserved[id]; }
    }
    for (const id of Object.keys(courses)) {
        if (courseStudentStops.has(id)) continue;
        courseStudentStops.set(id, watchCourseStats(id, stats => {
            publicStudents[id] = Number.isSafeInteger(stats.students) && stats.students >= 0 ? stats.students : null;
            publicReserved[id] = Number.isSafeInteger(stats.reserved) && stats.reserved >= 0 ? stats.reserved : null;
            renderCatalog();
            if (!$("coursePage").hidden) renderDetail();
        }, failure => {
            publicStudents[id] = null;
            publicReserved[id] = null;
            renderCatalog();
            console.error("[TutorCheck] Public student totals sync failed:", failure);
            error("Some course details could not sync. You can still browse courses. Refresh to retry.");
        }));
    }
}
const pageParams = new URLSearchParams(location.search);
let initialCourse = pageParams.get("course") || "";
let initialStudio = pageParams.get("studio") === "1";
let initialCreate = pageParams.get("create") === "1";
let initialClasses = pageParams.get("classes") === "1";
let classesView = false, requestsReady = false;
let archiveId = "";
let editorDirty = false, editorBusy = false, editorReturnCourse = "";
let teacherEditDirty = false, teacherEditBusy = false;
let editorProfileStop = () => {};
let removedPreview = false;
let pendingEditorExit = null;
const editorLabels = [...$("editorFieldBank").querySelectorAll("label, :scope > p, #mediaPreview")];
const storage = getStorage(auth.app);
async function updateCourseState(id, state) {
    const current = version;
    await setCourseState(id, state);
    if (current === version) $("marketStatus").textContent = `Course ${state}. Existing learner records are unchanged.`;
}
async function sendEnrollment(course) {
    if (pendingEnrollments.has(course.id)) throw new Error("This enrollment request is already being sent.");
    const current = version;
    pendingEnrollments.add(course.id);
    if (detailId === course.id && !$("coursePage").hidden) renderDetail();
    try {
        await requestEnrollment(course);
    } finally {
        if (current === version) {
            pendingEnrollments.delete(course.id);
            if (detailId === course.id && !$("coursePage").hidden) renderDetail();
        }
    }
}
$("teacherEnrollmentFilter").addEventListener("change", renderStudio);
$("teacherMobileHome").addEventListener("click", () => setStudioView(true));
$("teacherMobileCourses").addEventListener("click", () => {
    const show = () => { setStudioView(true); $("ownCourses").scrollIntoView({ block: "start" }); };
    if ($("courseEditor").hidden) show();
    else requestEditorExit(show);
});
$("teacherMobileCreate").addEventListener("click", () => openEditor());
$("teacherMobileLearners").addEventListener("click", () => {
    if ($("courseEditor").hidden) showClasses(false);
    else requestEditorExit(() => showClasses(false));
});
$("studioCourseFilters").addEventListener("click", event => {
    const button = event.target.closest("[data-studio-filter]");
    if (!button) return;
    studioCourseFilter = button.dataset.studioFilter;
    renderStudio();
    $("studioCourseFilters").querySelector(`[data-studio-filter="${studioCourseFilter}"]`).focus();
});
$("requestVerificationButton").addEventListener("click", async event => {
    if (verificationBusy || verificationLoading) return;
    const current = version;
    verificationBusy = true;
    renderVerificationStatus();
    $("verificationError").hidden = true;
    try {
        const result = await requestTutorVerification();
        if (current !== version) return;
        verificationStatus = { ...verificationStatus, ...result, requestedAt: Date.now() };
    } catch (failure) {
        if (current !== version) return;
        console.error("[TutorCheck] Tutor profile review request failed:", failure);
        $("verificationError").textContent = failure.message || "Your review request could not be sent.";
        $("verificationError").hidden = false;
    } finally {
        if (current === version) {
            verificationBusy = false;
            renderVerificationStatus();
        }
    }
});
$("refreshVerificationButton").addEventListener("click", () => loadTutorVerificationStatus(version));
$("refreshModeratorQueue").addEventListener("click", () => loadModeratorVerificationQueue(version));
$("archiveCancel").addEventListener("click", () => $("archiveDialog").close());
$("archiveConfirm").addEventListener("click", async () => {
    const current = version, id = archiveId;
    $("archiveConfirm").disabled = true;
    try {
        await updateCourseState(id, "archived");
        if (current === version) {
            $("archiveDialog").close();
            if (!$("courseEditor").hidden && editingId === id) { closeEditor(); setStudioView(true); }
        }
    }
    catch (err) { if (current === version) error(err, $("archiveError")); }
    finally { $("archiveConfirm").disabled = false; }
});
const el = (tag, className = "", text = "") => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
};
function icon(name) { const node = el("i", `ti ti-${name}`); node.setAttribute("aria-hidden", "true"); return node; }
function error(message, target = ($("cartDialog")?.open && $("cartError")) || ($("courseEditor")?.hidden === false && $("editorError")) || (!$("coursePage").hidden && $("detailError")) || ($("myClasses")?.hidden === false && $("browseLayout")?.hidden === false && $("classesError")) || $("marketError")) {
    console.error("[TutorCheck]", message);
    const text = message instanceof Error ? message.message : String(message);
    if (target.textContent !== text) target.textContent = text;
    target.hidden = false;
}
function action(text, className, callback, errorTarget) {
    const node = el("button", className, text);
    node.type = "button";
    node.addEventListener("click", async () => {
        const hadFocus = document.activeElement === node;
        const courseId = node.closest(".course-card")?.dataset.courseId;
        const focusKey = node.dataset.focusKey;
        node.disabled = true;
        const current = version;
        if (errorTarget) errorTarget.hidden = true;
        try { await callback(); }
        catch (failure) { if (current === version) error(failure, errorTarget); }
        finally {
            if (node.isConnected) node.disabled = false;
            if (current === version && hadFocus && courseId && focusKey && !$("browseLayout").hidden && document.activeElement === document.body) {
                const card = [...$("courseGrid").querySelectorAll(".course-card")].find(card => card.dataset.courseId === courseId);
                const control = card?.querySelector(`[data-focus-key="${focusKey}"]`);
                (control && !control.disabled ? control : $("resultCount")).focus({ preventScroll: true });
            }
        }
    });
    return node;
}
function requireLogin() {
    if (uid) return true;
    error("Sign in to save courses, use the cart or request enrollment.");
    return false;
}
function openDialog(id) {
    const dialog = $(id);
    dialog._returnFocus = document.activeElement;
    dialog.showModal();
}
document.querySelectorAll("dialog").forEach(dialog => {
    dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog._returnFocus?.focus());
    dialog.addEventListener("click", event => {
        const bounds = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
    });
});
function stats() {
    return Object.fromEntries(Object.keys(courses).map(id => {
        const courseRequests = courses[id].teacherId === uid
            ? Object.fromEntries(Object.entries(inbox).filter(([, request]) => request.courseId === id))
            : {};
        return [id, courseStats(reviews[id], courseRequests)];
    }));
}
function cover(course, detail = false) {
    const url = course.previewURL || course.coverURL;
    if (course.previewType === "video" && url) {
        if (detail) {
            const node = el("video", "course-cover detail-cover");
            node.src = url;
            node.controls = true;
            node.preload = "metadata";
            node.playsInline = true;
            if (course.coverURL) node.poster = course.coverURL;
            node.setAttribute("aria-label", `${course.title} video preview`);
            return node;
        }
        if (course.coverURL) {
            const node = el("img", "course-cover");
            node.src = course.coverURL;
            node.alt = `${course.title} video preview thumbnail`;
            node.loading = "lazy";
            node.addEventListener("error", () => node.replaceWith(el("div", "course-cover course-cover--video", "Video thumbnail unavailable")), { once: true });
            return node;
        }
        const node = el("div", "course-cover course-cover--video");
        node.append(icon("player-play"), el("span", "", "Video preview"));
        return node;
    }
    if (!url) {
        const node = el("div", `course-cover course-cover--fallback${detail ? " detail-cover" : ""}`);
        const category = TUTOR_CATEGORIES.find(([id]) => id === course.category);
        node.setAttribute("aria-label", `${course.title} course cover preview`);
        node.append(
            icon(category?.[2] || "book"),
            el("span", "fallback-category", category?.[1] || "English course"),
            el("strong", "fallback-title", course.title)
        );
        return node;
    }
    const node = el("img", `course-cover${detail ? " detail-cover" : ""}`);
    node.src = url;
    node.alt = `${course.title} course cover`;
    node.loading = "lazy";
    node.addEventListener("error", () => {
        const fallback = el("div", "course-cover muted", "Course image unavailable");
        node.replaceWith(fallback);
    }, { once: true });
    return node;
}
function price(course) {
    const node = el("p", "course-price", rupiah(course.price));
    if (course.originalPrice > course.price) {
        node.append(el("del", "", rupiah(course.originalPrice)), el("span", "discount", `${Math.round((1 - course.price / course.originalPrice) * 100)}% OFF`));
    }
    return node;
}
function card(course, statistics) {
    const node = el("article", "course-card panel");
    node.dataset.courseId = course.id;
    const artwork = el("div", "course-artwork");
    artwork.append(cover(course));
    const detail = action("", "course-open", () => showCourse(course.id));
    detail.append(icon("arrow-up-right"));
    detail.setAttribute("aria-label", `View ${course.title}`);
    detail.dataset.focusKey = "preview";
    artwork.append(detail);
    const saved = Boolean(library.favorites?.[course.id]);
    const favoriteButton = className => {
        const save = action("", className, async () => {
            if (!requireLogin()) return;
            await toggleLibrary("favorites", course.id, !saved);
            $("marketActionStatus").textContent = `${course.title} ${saved ? "removed from" : "added to"} saved courses.`;
        });
        save.append(icon(saved ? "heart-filled" : "heart"));
        save.setAttribute("aria-label", `${saved ? "Unsave" : "Save"} ${course.title}`);
        save.setAttribute("aria-pressed", String(saved));
        save.dataset.focusKey = className.includes("card-favorite") ? "favorite" : "cover-favorite";
        return save;
    };
    const courseMode = course.mode === "online" ? "Online" : course.mode === "offline" ? "Offline" : "Not specified";
    const courseModeIcon = course.mode === "online" ? "device-laptop" : course.mode === "offline" ? "map-pin" : "school";
    const courseBadge = el("span", "course-type-badge", courseMode);
    courseBadge.prepend(icon(courseModeIcon));
    const ratingBadge = el("div", "course-rating-badge");
    const hasReviews = statistics.count > 0;
    const rating = hasReviews ? statistics.rating.toFixed(1) : "0";
    ratingBadge.append(icon("star-filled"), el("strong", "", rating));
    if (hasReviews) ratingBadge.append(el("span", "", `(${statistics.count} review${statistics.count === 1 ? "" : "s"})`));
    ratingBadge.setAttribute("aria-label", hasReviews ? `${rating} average from ${statistics.count} reviews` : "0 reviews");
    artwork.append(courseBadge, ratingBadge);
    node.append(artwork);
    const content = el("div", "course-content");
    const teacherName = courseTeacher(course);
    const teacher = el("a", "teacher-name", teacherName);
    teacher.href = `profile.html?uid=${encodeURIComponent(course.teacherId)}`;
    teacher.dataset.focusKey = "teacher";
    const heading = el("h3");
    heading.append(action(course.title, "course-title", () => showCourse(course.id)));
    heading.firstElementChild.dataset.focusKey = "title";
    const teacherLine = el("div", "course-teacher-line");
    const photoURL = teacherIdentities[course.teacherId]?.photoURL;
    const avatar = photoURL ? el("img", "teacher-avatar") : el("span", "teacher-avatar", teacherName.trim().charAt(0).toUpperCase() || "T");
    if (photoURL) {
        avatar.src = photoURL;
        avatar.alt = "";
        avatar.loading = "lazy";
        avatar.addEventListener("error", () => avatar.replaceWith(el("span", "teacher-avatar", teacherName.trim().charAt(0).toUpperCase() || "T")), { once: true });
    }
    avatar.setAttribute("aria-hidden", "true");
    const teacherNameGroup = el("div", "teacher-name-wrap");
    teacherNameGroup.append(el("span", "course-fact-label", "Teacher"));
    teacherNameGroup.append(teacher);
    const badge = reviewedBadge(course.teacherId);
    if (badge) teacherNameGroup.append(badge);
    teacherLine.append(avatar, teacherNameGroup);
    const formatTime = value => String(value || "").replace(":", ".");
    const startDate = course.startDate
        ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${course.startDate}T00:00:00`))
        : "To be arranged";
    const facts = el("div", "course-facts");
    const addFact = (iconName, label, value, tone) => {
        const fact = el("div", `course-fact ${tone}`);
        const heading = el("div", "course-fact-heading");
        heading.append(el("span", "course-fact-label", label));
        const copy = el("div", "course-fact-copy");
        copy.append(el("strong", "course-fact-value", value));
        fact.append(icon(iconName), heading, copy);
        facts.append(fact);
    };
    addFact("clock", "Jam", course.startTime && course.endTime ? `${formatTime(course.startTime)} – ${formatTime(course.endTime)}` : "To be arranged", "course-fact--time");
    addFact("calendar", "Hari", course.scheduleDays || "Flexible", "course-fact--days");
    addFact("calendar-check", "Mulai", startDate, "course-fact--start");
    const learners = publicStudents[course.id] ?? statistics.students;
    const reserved = publicReserved[course.id];
    const seatsTaken = Math.max(Number.isSafeInteger(reserved) ? reserved : 0, Number.isSafeInteger(learners) ? learners : 0);
    const capacity = Number.isSafeInteger(course.maxStudents) ? course.maxStudents : 0;
    const quota = capacity ? `${Math.min(seatsTaken, capacity)} / ${capacity}` : "No limit";
    addFact("users-group", "Kuota", quota, "course-fact--quota");
    if (capacity && seatsTaken >= capacity) node.dataset.full = "true";
    content.append(heading, teacherLine, facts);
    content.append(price(course));
    const bottom = el("div", "card-bottom");
    const viewDetail = action("View Detail", "primary card-view-detail", () => showCourse(course.id));
    viewDetail.prepend(icon("file-description"));
    viewDetail.dataset.focusKey = "detail";
    bottom.append(viewDetail, favoriteButton("save-button card-favorite"));
    content.append(bottom);
    node.append(content);
    return node;
}
function renderFilterState() {
    const target = $("activeFilters");
    const focusedIndex = [...target.children].indexOf(document.activeElement);
    target.replaceChildren();
    const add = (label, clear) => {
        const button = el("button", "", `${label} ×`);
        button.type = "button";
        button.addEventListener("click", () => { clear(); renderCatalog(); });
        button.setAttribute("aria-label", `Remove filter: ${label}`);
        target.append(button);
    };
    if (selectedTeacher) {
        const course = Object.values(courses).find(course => course.teacherId === selectedTeacher);
        const teacher = course ? courseTeacher(course) : "Selected teacher";
        add(teacher, () => { selectedTeacher = ""; $("teacherFilter").value = ""; });
    }
    if (category) add(TUTOR_CATEGORIES.find(([id]) => id === category)[1], () => category = "");
    document.querySelectorAll('[name="price"]:checked').forEach(input => add(input.parentElement.innerText.trim().replace(/\s+/g, " "), () => input.checked = false));
    const rating = document.querySelector('[name="rating"]:checked');
    if (rating?.value) add(`${rating.value} stars${rating.value === "5" ? "" : " & up"}`, () => document.querySelector('[name="rating"][value=""]').checked = true);
    const search = $("courseSearch").value.trim();
    if (search) add(`Search: ${search}`, () => $("courseSearch").value = "");
    const count = target.children.length;
    target.hidden = !count;
    $("filterCount").hidden = !count;
    $("filterCount").textContent = count;
    $("resetFilters").disabled = !count && $("courseSort").value === "newest";
    $("allCategories").setAttribute("aria-pressed", String(!category));
    document.querySelectorAll("[data-category]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.category === category)));
    if (focusedIndex >= 0) {
        (target.children[Math.min(focusedIndex, count - 1)] || $("filterHeading")).focus();
    }
}
function renderCatalog() {
    $("manageButton").hidden = role !== "teacher";
    syncMarketplaceNavigation();
    $("cartCount").textContent = Object.keys(library.cart || {}).length;
    const teacherOptions = $("teacherFilter");
    const teacherSelection = selectedTeacher;
    const teacherRows = [...new Map(Object.values(courses).filter(course => course.published && !course.archived).map(course => [course.teacherId, courseTeacher(course)])).entries()]
        .sort((a, b) => a[1].localeCompare(b[1]));
    const teacherSignature = JSON.stringify(teacherRows);
    if (teacherOptions.dataset.options !== teacherSignature) {
        teacherOptions.replaceChildren(new Option("All teachers", ""));
        teacherRows.forEach(([id, name]) => teacherOptions.append(new Option(name, id)));
        teacherOptions.dataset.options = teacherSignature;
    }
    selectedTeacher = teacherRows.some(([id]) => id === teacherSelection) || (!catalogReady && !teacherRows.length) ? teacherSelection : "";
    teacherOptions.value = selectedTeacher;
    renderFilterState();
    if (!catalogReady || !reviewsReady || catalogFailure || reviewsFailure) return;
    const statistics = stats();
    const filters = { teacher: selectedTeacher, category, search: $("courseSearch").value, sort: $("courseSort").value,
        rating: document.querySelector('[name="rating"]:checked')?.value || "",
        prices: [...document.querySelectorAll('[name="price"]:checked')].map(input => input.value) };
    const displayCourses = Object.fromEntries(Object.entries(courses).map(([id, course]) => [id, { ...course, teacherName: courseTeacher(course) }]));
    let rows = selectCourses(displayCourses, filters, statistics);
    const grid = $("courseGrid");
    const focusedCard = document.activeElement?.closest(".course-card");
    const focusedCourse = focusedCard?.dataset.courseId;
    const focusKey = document.activeElement?.dataset.focusKey;
    grid.replaceChildren();
    grid.setAttribute("aria-busy", "false");
    const resultText = `${rows.length} course${rows.length === 1 ? "" : "s"}${$("filterCount").hidden ? " available" : " match your filters"}`;
    if ($("resultCount").textContent !== resultText) $("resultCount").textContent = resultText;
    if (!rows.length) {
        const empty = el("div", "empty-state");
        const noCatalog = !Object.values(courses).some(course => course.published && !course.archived);
        empty.append(icon("school"), el("h3", "", noCatalog ? "Your next course is on its way" : "No matching courses"),
            el("p", "muted", noCatalog ? "Teachers can publish their first course. New listings appear here automatically." : "Try another category, search or filter."));
        if (!noCatalog) {
            const reset = el("button", "text-button", "Clear all filters");
            reset.type = "button";
            reset.addEventListener("click", resetFilters);
            empty.append(reset);
        }
        grid.append(empty);
    } else rows.forEach(course => grid.append(card(course, statistics[course.id])));
    if (focusedCourse && focusKey && !$("browseLayout").hidden) {
        const replacement = [...grid.querySelectorAll(".course-card")].find(card => card.dataset.courseId === focusedCourse);
        const control = replacement?.querySelector(`[data-focus-key="${focusKey}"]`);
        (control && !control.disabled ? control : $("resultCount")).focus({ preventScroll: true });
    }
    document.querySelectorAll("[data-category]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.category === category)));
    renderCart();
    renderClasses();
    renderStudio();
    if (initialCourse && authReady && (!uid || roleReady)) {
        const id = initialCourse;
        initialCourse = "";
        const course = courses[id];
        const ownCourse = role === "teacher" && course?.teacherId === uid;
        if (course && !course.archived && (course.published || ownCourse) && (!selectedTeacher || course.teacherId === selectedTeacher)) showCourse(id);
        else error("This course is no longer available for enrollment.");
    }
    if (initialStudio && role === "teacher") { initialStudio = false; setStudioView(true, false); }
    if (initialCreate && role === "teacher") {
        initialCreate = false;
        setStudioView(true, false);
        openEditor();
    }
    if (initialClasses && authReady && (!uid || roleReady)) {
        initialClasses = false;
        showClasses(false);
    }
}
function currentTab(tab, active) {
    if (active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
}
function syncMarketplaceNavigation() {
    const teacher = role === "teacher";
    document.body.classList.toggle("marketplace-teacher", teacher);
    $("teacherMobileNav").hidden = !teacher;
    $("teacherMobileHome").setAttribute("aria-current", !$("teacherStudio").hidden ? "page" : "false");
    document.body.classList.toggle("tutor-home", teacher && !$("teacherStudio").hidden);
    const browsing = !$("browseLayout").hidden && $("courseEditor").hidden;
    document.body.classList.toggle("marketplace-browsing", browsing);
    document.body.classList.toggle("marketplace-classes", browsing && classesView);
    $("qcnavMarketplaceStudentSidebar").hidden = browsing || teacher;
    $("qcnavMarketplaceTeacherSidebar").hidden = browsing || !teacher;
    filterSidebar.hidden = !browsing || classesView;
    filterPanel.hidden = classesView;
    $("marketTabs").hidden = teacher || !$("courseEditor").hidden || !$("teacherStudio").hidden;
    $("cartButton").hidden = $("marketTabs").hidden;
    const classesShown = classesView && $("teacherStudio").hidden;
    currentTab($("browseTab"), !classesShown);
    currentTab($("classesTab"), classesShown);
    const params = new URLSearchParams(location.search);
    const studio = teacher && params.get("studio") === "1";
    const classes = params.get("classes") === "1";
    const homeLink = $("qcnavHomeLink");
    const currentLink = (link, active) => {
        if (!link) return;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    };
    if (homeLink) {
        homeLink.href = teacher ? "tutor-check.html?studio=1" : "index.html";
        currentLink(homeLink, studio);
    }
    currentLink(document.querySelector('.qcnav-links a[href="tutor-check.html"]'), !studio);
    const teacherLinks = $("qcnavMarketplaceTeacherSidebar");
    if (teacherLinks) {
        teacherLinks.querySelectorAll(".qcnav-item").forEach(link => currentLink(link, false));
        const hash = location.hash.slice(1);
        const activeTeacherLink = hash
            ? [...teacherLinks.querySelectorAll(".qcnav-item")].find(link => link.hash === `#${hash}`)
            : classes ? [...teacherLinks.querySelectorAll(".qcnav-item")].find(link => link.hash === "#teacherInbox")
                : studio ? teacherLinks.querySelector(".qcnav-item")
                    : [...teacherLinks.querySelectorAll(".qcnav-item")].find(link => link.getAttribute("href") === "tutor-check.html");
        currentLink(activeTeacherLink, true);
    }
}
window.addEventListener("hashchange", syncMarketplaceNavigation);
window.addEventListener("qcnav:rolechange", syncMarketplaceNavigation);
function row(title, description) {
    const node = el("div", "request-row");
    const text = el("div");
    text.append(el("h3", "", title), el("p", "muted", description));
    node.append(text);
    return node;
}
function renderCart() {
    const items = $("cartItems");
    items.replaceChildren();
    let total = 0, validCount = 0;
    Object.keys(library.cart || {}).forEach(id => {
        const course = courses[id];
        const available = course?.published && !course.archived && course.teacherId !== uid;
        const node = row(course?.title || "Unavailable course", available ? rupiah(course.price) : "No longer open for enrollment");
        if (available) { total += course.price; validCount++; }
        node.append(action("Remove", "text-button", () => toggleLibrary("cart", id, false), $("cartError")));
        items.append(node);
    });
    if (!items.children.length) items.append(el("p", "muted", "Your cart is empty. Add courses you would like to join."));
    $("cartTotal").textContent = `Total: ${rupiah(total)}`;
    $("checkoutButton").disabled = checkoutBusy || !validCount || !uid;
}
const CLASS_STATUS = {
    accepted: ["Active", "class-status--active"],
    pending: ["Waiting for teacher", "class-status--pending"],
    declined: ["Declined", "class-status--closed"],
    cancelled: ["Cancelled", "class-status--closed"]
};
function classCard(id, request) {
    const course = courses[request.courseId];
    const [label, tone] = CLASS_STATUS[request.status] || [request.status, "class-status--closed"];
    const node = el("article", "class-card");
    node.dataset.requestId = id;
    const media = el("div", "class-card-media");
    media.append(course ? cover(course) : el("div", "course-cover course-cover--fallback"));
    const body = el("div", "class-card-body");
    const top = el("div", "class-card-top");
    top.append(el("span", `class-status ${tone}`, label), el("span", "class-card-date", new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(request.createdAt || 0))));
    const teacher = course ? courseTeacher(course) : "";
    body.append(top, el("h4", "", course?.title || "Course unavailable"));
    if (teacher) body.append(el("p", "class-card-teacher", `with ${teacher}`));
    if (request.status === "accepted" && course?.schedule) {
        const schedule = el("p", "class-card-schedule");
        schedule.append(icon("calendar-event"), el("span", "", course.schedule));
        body.append(schedule);
    } else if (request.status === "pending") body.append(el("p", "class-card-note", `Requested at ${rupiah(request.price)}. No payment has been collected.`));
    const buttons = el("div", "row-actions");
    if (course) {
        const open = action(request.status === "accepted" ? "Open class" : "View course", request.status === "accepted" ? "primary" : "", () => showCourse(request.courseId));
        open.dataset.focusKey = "open";
        buttons.append(open);
    }
    if (request.status === "accepted") {
        const message = el("a", "class-card-link", "Message teacher");
        message.href = `message.html?to=${encodeURIComponent(request.teacherId)}`;
        buttons.append(message);
    } else {
        const profile = el("a", "class-card-link", "Teacher profile");
        profile.href = `profile.html?uid=${encodeURIComponent(request.teacherId)}`;
        buttons.append(profile);
    }
    if (request.status === "pending") {
        const cancel = action("Cancel request", "text-button class-card-cancel", () => changeRequest(id, "cancelled"), $("classesError"));
        cancel.dataset.focusKey = "cancel";
        buttons.append(cancel);
    }
    body.append(buttons);
    node.append(media, body);
    return node;
}
function renderClasses() {
    const rows = Object.entries(requests).sort(([, a], [, b]) => (b.createdAt || 0) - (a.createdAt || 0));
    const open = rows.filter(([, request]) => request.status === "accepted" || request.status === "pending").length;
    $("classesCount").textContent = open ? String(open) : "";
    $("classesCount").hidden = !open;
    $("classesTab").setAttribute("aria-label", open ? `My classes, ${open} open` : "My classes");
    if ($("myClasses").hidden) return;
    const content = $("classesContent");
    const focused = content.contains(document.activeElement) ? document.activeElement : null;
    const focusRequest = focused?.closest(".class-card")?.dataset.requestId;
    const focusKey = focused?.dataset.focusKey;
    content.replaceChildren();
    const emptyState = (glyph, title, text, linkText, href) => {
        const empty = el("div", "empty-state");
        empty.append(icon(glyph), el("h3", "", title), el("p", "muted", text));
        const link = el("a", "primary class-empty-action", linkText);
        link.href = href;
        if (href === "tutor-check.html") link.addEventListener("click", event => { event.preventDefault(); $("browseTab").click(); });
        empty.append(link);
        return empty;
    };
    if (authReady && !uid) {
        content.append(emptyState("lock", "Sign in to see your classes", "Your accepted classes and enrollment requests appear here after you sign in.", "Sign in", "signup.html"));
        return;
    }
    if (!authReady || !requestsReady) {
        content.setAttribute("aria-busy", "true");
        content.append(el("div", "skeleton class-skeleton"), el("div", "skeleton class-skeleton"));
        return;
    }
    content.setAttribute("aria-busy", "false");
    if (!rows.length) {
        content.append(emptyState("school", "No classes yet", "Find a course you like and send an enrollment request. Accepted classes appear here.", "Browse courses", "tutor-check.html"));
        return;
    }
    [
        ["Active classes", rows.filter(([, request]) => request.status === "accepted")],
        ["Waiting for the teacher", rows.filter(([, request]) => request.status === "pending")],
        ["Past requests", rows.filter(([, request]) => !["accepted", "pending"].includes(request.status))]
    ].forEach(([title, group]) => {
        if (!group.length) return;
        const section = el("section", "class-group");
        const heading = el("h3", "class-group-title", title);
        heading.append(el("span", "class-group-count", String(group.length)));
        const list = el("div", "class-list");
        group.forEach(([id, request]) => list.append(classCard(id, request)));
        section.append(heading, list);
        content.append(section);
    });
    if (focusRequest && focusKey) {
        const card = [...content.querySelectorAll(".class-card")].find(node => node.dataset.requestId === focusRequest);
        const control = card?.querySelector(`[data-focus-key="${focusKey}"]`);
        (control && !control.disabled ? control : $("myClassesTitle")).focus({ preventScroll: true });
    }
}
function renderStudio() {
    if (role !== "teacher") { $("teacherStudio").hidden = true; return; }
    renderVerificationStatus();
    const ownedRows = Object.entries(courses).filter(([, course]) => course.teacherId === uid);
    const ownedReviews = ownedRows.flatMap(([id]) => Object.values(reviews[id] || {}).filter(review => Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5));
    const accepted = Object.values(inbox).filter(request => request.status === "accepted");
    const pending = Object.values(inbox).filter(request => request.status === "pending");
    const averageRating = ownedReviews.length ? ownedReviews.reduce((sum, review) => sum + review.rating, 0) / ownedReviews.length : null;
    $("studioTeacherName").textContent = auth.currentUser?.displayName?.trim().split(/\s+/)[0] || "teacher";
    const today = new Date(), hour = today.getHours();
    $("studioGreeting").textContent = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    $("studioDate").dateTime = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    $("studioDate").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(today);
    const metrics = $("studioMetrics");
    metrics.replaceChildren();
    [
        ["Active courses", ownedRows.filter(([, course]) => course.published && !course.archived).length, "Published listings", "book-2"],
        ["Total students", new Set(accepted.map(request => request.studentId)).size, `${pending.length} pending request${pending.length === 1 ? "" : "s"}`, "users"],
        ["Monthly earnings", "Not tracked", "No payments collected here", "wallet"],
        ["Average rating", averageRating === null ? "No reviews" : `${averageRating.toFixed(1)} / 5`, `${ownedReviews.length} learner review${ownedReviews.length === 1 ? "" : "s"}`, "star"]
    ].forEach(([label, value, note, glyph]) => {
        const metric = el("article", "studio-metric");
        metric.dataset.metric = glyph;
        metric.append(icon(glyph), el("p", "muted", label), el("strong", "", String(value)), el("span", "muted", note));
        metrics.append(metric);
    });
    const owned = $("ownCourses");
    owned.replaceChildren();
    const visibleRows = ownedRows.filter(([, course]) => studioCourseFilter === "all"
        || studioCourseFilter === "archived" && course.archived
        || studioCourseFilter === "published" && course.published && !course.archived
        || studioCourseFilter === "draft" && !course.published && !course.archived);
    $("studioCourseFilters").querySelectorAll("[data-studio-filter]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.studioFilter === studioCourseFilter));
    });
    $("studioCourseCount").textContent = `${visibleRows.length} course${visibleRows.length === 1 ? "" : "s"}`;
    visibleRows.forEach(([id, course]) => {
        const node = el("article", "studio-course");
        node.append(cover(course));
        const content = el("div", "studio-course-copy");
        const rating = stats()[id];
        const learners = Object.values(inbox).filter(request => request.courseId === id && request.status === "accepted").length;
        content.append(
            el("span", `course-state${course.archived ? " is-archived" : course.published ? " is-published" : ""}`, course.archived ? "Archived" : course.published ? "Published" : "Draft"),
            el("h4", "", course.title),
            el("p", "muted", `${learners} student${learners === 1 ? "" : "s"} | ${rating?.rating ? `${rating.rating.toFixed(1)} / 5` : "No reviews"}`),
            price(course)
        );
        const actions = el("div", "row-actions");
        if (course.archived) actions.append(action("Restore as paused", "text-button", () => updateCourseState(id, "paused")));
        else {
            actions.append(action("Edit course", "text-button", () => openEditor(id)),
                action(course.published ? "Pause" : "Publish", "text-button", () => updateCourseState(id, course.published ? "paused" : "published")),
                action("Archive", "text-button", () => {
                    archiveId = id; $("archiveCourseName").textContent = course.title; $("archiveError").hidden = true;
                    openDialog("archiveDialog"); $("archiveCancel").focus();
                }));
        }
        content.append(actions);
        node.append(content);
        owned.append(node);
    });
    if (studioCourseFilter === "all" || studioCourseFilter === "draft") {
        Object.entries(drafts).sort(([, a], [, b]) => b.updatedAt - a.updatedAt).forEach(([id, draft]) => {
            const node = el("article", "studio-course");
            const content = el("div", "studio-course-copy");
            content.append(el("span", "course-state", "Private draft"), el("h4", "", draft.title || "Untitled course"),
                el("p", "muted", "Only you can see this saved work. Publishing requires complete course details."));
            const actions = el("div", "row-actions");
            actions.append(action("Resume draft", "text-button", () => openEditor(draft.courseId, { name: "title" }, id)),
                action("Delete draft", "text-button", async () => {
                    if (!window.confirm(`Delete the private draft "${draft.title || "Untitled course"}"? The published course will not change.`)) return;
                    const current = version;
                    await deleteCourseDraft(id);
                    if (draft.previewPath?.startsWith("tutor-drafts/")) {
                        try { await deleteObject(storageRef(storage, draft.previewPath)); }
                        catch (failure) {
                            console.error("[TutorCheck] Deleted draft media cleanup failed:", failure);
                            if (current === version) error("Draft deleted, but its private preview could not be removed from storage.");
                        }
                    }
                }));
            content.append(actions);
            node.append(content);
            owned.append(node);
        });
        const count = visibleRows.length + Object.keys(drafts).length;
        $("studioCourseCount").textContent = `${count} course${count === 1 ? "" : "s"}`;
    }
    if (!owned.children.length) {
        const empty = el("div", "studio-empty");
        empty.append(icon("book-upload"), el("h4", "", ownedRows.length ? "No courses in this view" : "Your first course starts here"),
            el("p", "muted", ownedRows.length ? "Choose another filter to see your courses." : "Use Create a course above to fill in your live course template."));
        owned.append(empty);
    }
    const classes = $("studioClasses");
    classes.replaceChildren();
    const liveCourses = ownedRows.filter(([id, course]) => course.type === "live" && !course.archived
        && accepted.some(request => request.courseId === id));
    liveCourses.slice(0, 3).forEach(([id, course]) => {
        const item = el("div", "studio-update");
        item.append(icon("calendar-event"));
        const text = el("div");
        text.append(el("strong", "", course.title), el("p", "muted", course.schedule));
        item.append(text, action("View", "text-button", () => showCourse(id)));
        classes.append(item);
    });
    if (!classes.children.length) classes.append(el("p", "studio-empty-note", "No live classes with accepted learners yet."));
    const activity = $("studioActivity");
    activity.replaceChildren();
    const events = Object.entries(inbox).map(([id, request]) => ({
        at: request.updatedAt || request.createdAt, glyph: "user-plus", courseId: request.courseId, key: id,
        text: `${request.studentName || "A learner"}: ${request.status} enrollment for ${courses[request.courseId]?.title || "a course"}.`
    }));
    ownedRows.forEach(([id, course]) => Object.entries(reviews[id] || {}).forEach(([reviewId, review]) => {
        events.push({ at: review.updatedAt, glyph: "star", courseId: id, key: `${id}_${reviewId}`,
            text: `${review.studentName || "A learner"} left a ${review.rating}-star review for ${course.title}.` });
    }));
    events.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 5).forEach(event => {
        const item = el("div", "studio-update");
        const text = el("div");
        text.append(el("p", "", event.text));
        if (Number.isFinite(event.at)) {
            const time = el("time", "muted", new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(event.at));
            time.dateTime = new Date(event.at).toISOString();
            text.append(time);
        }
        item.append(icon(event.glyph), text);
        activity.append(item);
    });
    if (!activity.children.length) activity.append(el("p", "studio-empty-note", "New requests and learner reviews will appear here."));
    const items = $("teacherInbox");
    items.replaceChildren();
    const enrollmentLabels = { "": "All enrollments", pending: "Pending requests", accepted: "Accepted learners", declined: "Declined requests", cancelled: "Cancelled requests" };
    for (const option of $("teacherEnrollmentFilter").options) {
        const count = Object.values(inbox).filter(request => !option.value || request.status === option.value).length;
        option.textContent = `${enrollmentLabels[option.value]} (${count})`;
    }
    Object.entries(inbox).sort(([, a], [, b]) => b.createdAt - a.createdAt).forEach(([id, request]) => {
        if ($("teacherEnrollmentFilter").value && request.status !== $("teacherEnrollmentFilter").value) return;
        const node = row(`${request.studentName} - ${courses[request.courseId]?.title || "Course"}`, `${request.status} | ${rupiah(request.price)}`);
        const buttons = el("div", "row-actions");
        if (request.status === "pending") {
            buttons.append(action("Accept", "primary", () => changeRequest(id, "accepted")), action("Decline", "", () => changeRequest(id, "declined")));
        }
        const contact = el("a", "", "Learner profile");
        contact.href = `profile.html?uid=${encodeURIComponent(request.studentId)}`;
        buttons.append(contact);
        const message = el("a", "", "Message learner");
        message.href = `message.html?to=${encodeURIComponent(request.studentId)}`;
        buttons.append(message);
        node.append(buttons);
        items.append(node);
    });
    if (!items.children.length) items.append(el("p", "muted", $("teacherEnrollmentFilter").value ? "No enrollments with this status." : "Enrollment requests will appear here in real time."));
}
function renderVerificationStatus() {
    const status = verificationStatus.status;
    const messages = {
        loading: "Loading your profile review status...",
        unavailable: "Profile review status is unavailable. Refresh to try again.",
        not_requested: "Your public teacher profile has not been reviewed.",
        pending: "Your request is waiting for moderator review.",
        verified: "A Quick Check moderator reviewed this tutor profile. This badge is not a guarantee of course quality or payment protection.",
        rejected: verificationStatus.reviewerNote
            ? `Review not approved: ${verificationStatus.reviewerNote}`
            : "Your profile review was not approved. Update your public teaching profile before requesting another review."
    };
    $("verificationStatus").textContent = verificationBusy ? "Sending your profile review request..." : messages[status] || "Profile review status is unavailable.";
    const cooldown = Number.isFinite(verificationStatus.requestedAt) &&
        Date.now() - verificationStatus.requestedAt < 24 * 60 * 60 * 1000;
    const canRequest = status === "not_requested" || status === "rejected" && !cooldown;
    $("requestVerificationButton").hidden = !canRequest;
    $("requestVerificationButton").disabled = verificationBusy || verificationLoading;
    $("refreshVerificationButton").disabled = verificationBusy || verificationLoading;
    if (status === "rejected" && cooldown) $("verificationStatus").textContent += " You can request another review 24 hours after your previous request.";
}
async function loadTutorVerificationStatus(expectedVersion) {
    if (verificationLoading || verificationBusy || expectedVersion !== version) return;
    verificationLoading = true;
    renderVerificationStatus();
    try {
        const status = await getTutorVerificationStatus();
        if (expectedVersion !== version) return;
        verificationStatus = status;
        $("verificationError").hidden = true;
    } catch (failure) {
        if (expectedVersion !== version) return;
        console.error("[TutorCheck] Tutor review status failed:", failure);
        $("verificationError").textContent = `Profile review status could not load. ${failure.message}`;
        $("verificationError").hidden = false;
        verificationStatus = { status: "unavailable" };
    } finally {
        if (expectedVersion === version) {
            verificationLoading = false;
            renderVerificationStatus();
        }
    }
}
async function loadModeratorVerificationQueue(expectedVersion) {
    if (expectedVersion !== version || !isMarketplaceModerator) return;
    $("refreshModeratorQueue").disabled = true;
    const queue = $("moderatorVerificationQueue");
    queue.replaceChildren(el("p", "muted", "Loading review requests…"));
    $("moderatorVerificationError").hidden = true;
    try {
        const requests = await listTutorVerificationRequests();
        if (expectedVersion !== version) return;
        queue.replaceChildren();
        if (!requests.length) {
            queue.append(el("p", "muted", "There are no pending tutor profile reviews."));
            return;
        }
        requests.forEach(request => {
            const item = el("article", "verification-queue-item");
            item.append(el("h3", "", request.displayName));
            const email = el("a", "", request.email || "No account email available");
            if (request.email) email.href = `mailto:${request.email}`;
            item.append(email);
            if (request.qualification) item.append(el("p", "muted", request.qualification));
            if (request.experience !== null) item.append(el("p", "muted", `${request.experience} years of experience (self-reported)`));
            if (request.about) item.append(el("p", "muted", request.about));
            const note = el("textarea", "verification-note");
            note.maxLength = 500;
            note.rows = 2;
            note.placeholder = "Review note (rejection reasons are shared with the tutor)";
            note.setAttribute("aria-label", `Moderator note for ${request.displayName}`);
            const actions = el("div", "row-actions");
            actions.append(
                action("Approve profile review", "primary", async () => {
                    if (expectedVersion !== version) return;
                    await reviewTutorVerification(request.uid, "verified", note.value);
                    await loadModeratorVerificationQueue(expectedVersion);
                }, $("moderatorVerificationError")),
                action("Reject", "", async () => {
                    if (expectedVersion !== version) return;
                    if (!note.value.trim()) throw new Error("Add a short reason before rejecting this request.");
                    await reviewTutorVerification(request.uid, "rejected", note.value);
                    await loadModeratorVerificationQueue(expectedVersion);
                }, $("moderatorVerificationError"))
            );
            item.append(note, actions);
            queue.append(item);
        });
    } catch (failure) {
        if (expectedVersion !== version) return;
        console.error("[TutorCheck] Tutor review queue failed:", failure);
        queue.replaceChildren();
        $("moderatorVerificationError").textContent = `Tutor review requests could not load. ${failure.message}`;
        $("moderatorVerificationError").hidden = false;
    } finally {
        if (expectedVersion === version) $("refreshModeratorQueue").disabled = false;
    }
}
async function loadModeratorAccess(user, expectedVersion) {
    try {
        const token = await user.getIdTokenResult();
        if (expectedVersion !== version) return;
        isMarketplaceModerator = token.claims.role === "developer" &&
            token.claims.email === "quickcheck.edu@gmail.com" && user.emailVerified;
        $("moderatorVerificationPanel").hidden = !isMarketplaceModerator;
        if (isMarketplaceModerator) await loadModeratorVerificationQueue(expectedVersion);
    } catch (failure) {
        if (expectedVersion !== version) return;
        console.error("[TutorCheck] Moderator access could not be checked:", failure);
        $("moderatorVerificationPanel").hidden = true;
    }
}
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
function rememberScroll() {
    history.replaceState({ ...(history.state || {}), scrollY: window.scrollY }, "");
}
function userHasFocus() {
    const active = document.activeElement;
    return Boolean(active && active !== document.body);
}
function revealView(view, heading, title, moveFocus) {
    document.title = `${title ? `${title} | ` : ""}Marketplace | Quick Check`;
    if (!reduceMotion.matches) {
        view.classList.remove("view-enter");
        void view.offsetWidth;
        view.classList.add("view-enter");
        view.addEventListener("animationend", () => view.classList.remove("view-enter"), { once: true });
    }
    if (!moveFocus || !heading || heading.closest("[hidden]")) return;
    if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
}
function showCourse(id, scroll = true) {
    if (!$("courseEditor").hidden) return requestEditorExit(() => showCourse(id, scroll));
    const moveFocus = userHasFocus() && !$("coursePage").contains(document.activeElement);
    const changing = $("coursePage").hidden || detailId !== id;
    detailProfileStop();
    if (courses[detailId]?.teacherId !== courses[id]?.teacherId) { detailProfile = {}; detailProfileReady = false; }
    detailId = id;
    const url = new URL(location.href);
    if (url.searchParams.get("course") !== id || url.searchParams.has("studio") || url.searchParams.has("classes")) {
        url.searchParams.set("course", id);
        url.searchParams.delete("studio");
        url.searchParams.delete("classes");
        rememberScroll();
        history.pushState({ marketplaceCourse: id }, "", url);
    }
    $("browseLayout").hidden = true;
    $("coursePage").hidden = false;
    $("teacherStudio").hidden = true;
    syncMarketplaceNavigation();
    renderDetail();
    if (scroll) $("coursePage").scrollIntoView({ block: "start" });
    if (changing) revealView($("coursePage"), $("coursePage").querySelector(".detail-title") || $("backToCatalog"), courses[id]?.title, moveFocus);
    else document.title = `${courses[id]?.title ? `${courses[id].title} | ` : ""}Marketplace | Quick Check`;
    const course = courses[id];
    if (course) {
        detailProfileStop = watchTeachingProfile(course.teacherId, profile => {
            if (detailId !== id) return;
            detailProfile = profile;
            detailProfileReady = true;
            if (!$("coursePage").hidden) renderDetail();
        }, err => error(`Teacher profile could not load. ${err.message}`));
    }
}
function setBrowseSection(showClassesSection) {
    classesView = showClassesSection;
    document.querySelectorAll(".course-hero,.market-search,.category-section,#catalog").forEach(node => node.hidden = showClassesSection);
    $("myClasses").hidden = !showClassesSection;
}
function showCatalog(scroll = true) {
    if (!$("courseEditor").hidden) return requestEditorExit(() => showCatalog(scroll));
    const moveFocus = userHasFocus() && !$("catalog").contains(document.activeElement) && !$("marketTabs").contains(document.activeElement);
    const wasHidden = $("browseLayout").hidden || classesView;
    detailProfileStop();
    detailProfileStop = () => {};
    detailId = "";
    $("teacherStudio").hidden = true;
    $("coursePage").hidden = true;
    $("browseLayout").hidden = false;
    setBrowseSection(false);
    syncMarketplaceNavigation();
    if (scroll) $("browseLayout").scrollIntoView({ block: "start" });
    if (wasHidden) revealView($("browseLayout"), $("marketplaceHeading"), "", moveFocus);
    else document.title = "Marketplace | Quick Check";
}
function setStudioView(show, updateHistory = true, scroll = true) {
    if (!$("courseEditor").hidden) return requestEditorExit(() => setStudioView(show, updateHistory, scroll));
    if (show && role !== "teacher") return;
    const target = $(show ? "teacherStudio" : "browseLayout");
    const moveFocus = userHasFocus() && !target.contains(document.activeElement);
    const wasHidden = target.hidden;
    if (updateHistory) {
        const url = new URL(location.href);
        url.searchParams.delete("course");
        url.searchParams.delete("classes");
        if (show) url.searchParams.set("studio", "1");
        else url.searchParams.delete("studio");
        rememberScroll();
        history.pushState({ marketplaceStudio: show }, "", url);
    }
    detailProfileStop();
    detailProfileStop = () => {};
    detailId = "";
    $("coursePage").hidden = true;
    $("browseLayout").hidden = show;
    $("teacherStudio").hidden = !show;
    if (!show) setBrowseSection(false);
    syncMarketplaceNavigation();
    if (scroll) target.scrollIntoView({ block: "start" });
    if (wasHidden) revealView(target, $(show ? "studioTitle" : "marketplaceHeading"), show ? "Teacher studio" : "", moveFocus);
}
function showClasses(updateHistory = true, scroll = true) {
    if (role === "teacher") {
        setStudioView(true, false);
        $("teacherInbox").scrollIntoView({ block: "start" });
        return;
    }
    if (!$("courseEditor").hidden) return requestEditorExit(() => showClasses(updateHistory, scroll));
    const moveFocus = userHasFocus() && !$("myClasses").contains(document.activeElement) && !$("marketTabs").contains(document.activeElement);
    const wasHidden = $("browseLayout").hidden || !classesView;
    if (updateHistory) {
        const url = new URL(location.href);
        url.searchParams.delete("course");
        url.searchParams.delete("studio");
        url.searchParams.set("classes", "1");
        rememberScroll();
        history.pushState({ marketplaceClasses: true }, "", url);
    }
    detailProfileStop();
    detailProfileStop = () => {};
    detailId = "";
    $("teacherStudio").hidden = true;
    $("coursePage").hidden = true;
    $("browseLayout").hidden = false;
    setBrowseSection(true);
    $("classesError").hidden = true;
    syncMarketplaceNavigation();
    renderClasses();
    if (scroll) $("browseLayout").scrollIntoView({ block: "start" });
    if (wasHidden) revealView($("myClasses"), $("myClassesTitle"), "My classes", moveFocus);
    else document.title = "My classes | Marketplace | Quick Check";
}
function renderDetail(target = $("courseDetail"), editorCourse = null) {
    if (!editorCourse && !$("courseEditor").hidden) return;
    const savedCourse = editorCourse || courses[detailId];
    const course = savedCourse ? { ...savedCourse, teacherName: courseTeacher(savedCourse) } : null;
    const courseId = detailId;
    const oldForm = target.querySelector("form");
    const draft = oldForm ? new FormData(oldForm) : null;
    const focused = target.contains(document.activeElement) ? document.activeElement : null;
    const focusedName = focused?.name;
    const focusedTab = focused?.dataset.detailTab;
    const sameCourse = target.dataset.courseId === detailId;
    const selectedTab = sameCourse ? target.querySelector('[data-detail-tab][aria-selected="true"]')?.dataset.detailTab || "overview" : "overview";
    const selectionStart = focused?.selectionStart, selectionEnd = focused?.selectionEnd;
    const existingVideo = target.querySelector("video.detail-cover");
    const previousFeedback = sameCourse ? target.querySelector(".detail-feedback")?.textContent || "" : "";
    const previousError = sameCourse ? target.querySelector("#detailError:not([hidden])")?.textContent || "" : "";
    target.dataset.courseId = detailId;
    target.replaceChildren();
    if (!course) { target.append(el("p", "error", "This course is unavailable.")); return; }
    if (!editorCourse) $("coursePageTitle").textContent = course.title;
    const courseStats = stats()[detailId] || courseStatsFor(detailId);
    const teacherStats = teachingSummary(courses, reviews, course.teacherId);
    const curriculumLines = String(course.curriculum || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const outcomeLines = String(course.whatYouLearn || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const teacherAvatar = () => {
        const imageURL = detailProfile.imageURL || teacherIdentities[course.teacherId]?.photoURL;
        const avatar = imageURL
            ? el("img", "teacher-profile-image")
            : el("span", "teacher-profile-image teacher-profile-initial", course.teacherName.trim().charAt(0).toUpperCase() || "T");
        if (imageURL) {
            avatar.src = imageURL;
            avatar.alt = `${course.teacherName} profile`;
            avatar.addEventListener("error", () => avatar.replaceWith(el("span", "teacher-profile-image teacher-profile-initial", course.teacherName.trim().charAt(0).toUpperCase() || "T")), { once: true });
        }
        return avatar;
    };
    const detailLayout = el("div", "detail-layout");
    const detailMain = el("div", "detail-main");
    const purchase = el("aside", "purchase-panel");
    purchase.setAttribute("aria-label", "Course enrollment");
    const intro = el("section", "detail-intro");
    const media = el("div", "detail-media");
    media.append(existingVideo?.getAttribute("src") === course.previewURL && course.previewType === "video" ? existingVideo : cover(course, true));
    const introCopy = el("div", "detail-intro-copy");
    introCopy.append(
        el("span", "course-kicker", `${TUTOR_CATEGORIES.find(([id]) => id === course.category)?.[1] || "English"} · ${TUTOR_TYPES[course.type]}`),
        el("h3", "detail-title", course.title)
    );
    const teacherLink = el("a", "detail-teacher-link", course.teacherName);
    teacherLink.href = `profile.html?uid=${encodeURIComponent(course.teacherId)}`;
    const introTeacher = el("div", "detail-intro-teacher");
    const introTeacherCopy = el("div");
    const detailBadge = reviewedBadge(course.teacherId);
    introTeacherCopy.append(teacherLink);
    if (detailBadge) introTeacherCopy.append(detailBadge);
    introTeacherCopy.append(el("p", "muted", detailProfile.qualification || "Independent English teacher"));
    introTeacher.append(teacherAvatar(), introTeacherCopy);
    introCopy.append(introTeacher);
    const ratingText = courseStats.count
        ? `${courseStats.rating.toFixed(1)} · ${courseStats.count} review${courseStats.count === 1 ? "" : "s"}`
        : "New course · No reviews yet";
    const ratingLine = el("p", "detail-rating");
    if (courseStats.count) ratingLine.append(icon("star-filled"));
    ratingLine.append(el("span", "", ratingText));
    introCopy.append(ratingLine);
    if (Number.isSafeInteger(publicStudents[detailId])) ratingLine.append(el("span", "detail-student-count", `| ${publicStudents[detailId]} students`));
    intro.append(media, introCopy);
    detailMain.append(intro);

    const courseFacts = el("section", "course-detail-facts");
    courseFacts.setAttribute("aria-label", "Course details");
    const courseFactGrid = el("div", "course-detail-fact-grid");
    const formatFactTime = value => String(value || "").replace(":", ".");
    const startDateText = course.startDate
        ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${course.startDate}T00:00:00`))
        : "To be arranged";
    const acceptedStudents = Number.isSafeInteger(publicStudents[courseId]) ? publicStudents[courseId] : courseStats.students;
    const factSeatsTaken = Math.max(acceptedStudents, Number.isSafeInteger(publicReserved[courseId]) ? publicReserved[courseId] : 0);
    const factCapacity = Number.isSafeInteger(course.maxStudents) ? course.maxStudents : 0;
    const timeValue = course.startTime && course.endTime
        ? `${formatFactTime(course.startTime)} – ${formatFactTime(course.endTime)}`
        : course.startTime ? `From ${formatFactTime(course.startTime)}`
            : course.endTime ? `Until ${formatFactTime(course.endTime)}` : "To be arranged";
    const startMinutes = course.startTime ? course.startTime.split(":").reduce((total, part) => total * 60 + Number(part), 0) : NaN;
    const endMinutes = course.endTime ? course.endTime.split(":").reduce((total, part) => total * 60 + Number(part), 0) : NaN;
    const durationMinutes = endMinutes - startMinutes;
    const durationNote = Number.isFinite(durationMinutes) && durationMinutes > 0
        ? `${Math.floor(durationMinutes / 60)}${durationMinutes % 60 ? ` jam ${durationMinutes % 60} menit` : " jam"} / sesi`
        : "Durasi belum ditentukan";
    const addCourseFact = (field, glyph, label, value, note) => {
        const fact = el("div", "course-detail-fact");
        fact.dataset.courseFact = field;
        fact.dataset.editField = field;
        const copy = el("div", "course-detail-fact-copy");
        copy.append(el("span", "course-detail-fact-label", label));
        const valueNode = el("strong", "course-detail-fact-value", value);
        if (field === "maxStudents") valueNode.dataset.currentSeats = String(factSeatsTaken);
        fact.append(icon(glyph), copy, valueNode);
        if (field === "maxStudents" && factCapacity) {
            const progress = el("div", "course-capacity-progress");
            progress.setAttribute("role", "progressbar");
            progress.setAttribute("aria-label", "Class capacity");
            progress.setAttribute("aria-valuemin", "0");
            progress.setAttribute("aria-valuemax", String(factCapacity));
            progress.setAttribute("aria-valuenow", String(Math.min(factSeatsTaken, factCapacity)));
            const fill = el("span", "course-capacity-fill");
            fill.style.width = `${Math.min(factSeatsTaken / factCapacity, 1) * 100}%`;
            progress.append(fill);
            fact.append(progress);
        }
        fact.append(el("span", "course-detail-fact-note", note));
        courseFactGrid.append(fact);
    };
    addCourseFact("scheduleDays", "calendar", "Hari", course.scheduleDays || "Flexible", course.scheduleDays ? "Jadwal kelas mingguan" : "Jadwal fleksibel");
    addCourseFact("startTime", "clock", "Jam", timeValue, durationNote);
    addCourseFact("startDate", "calendar-check", "Mulai", startDateText, course.startDate ? "Kelas akan dimulai" : "Tanggal belum ditentukan");
    addCourseFact("mode", "device-laptop", "Mode", course.mode === "online" ? "Online" : course.mode === "offline" ? "In person" : "Not specified", course.schedule || "Detail akses belum ditambahkan");
    const seatsRemaining = factCapacity ? Math.max(factCapacity - factSeatsTaken, 0) : null;
    addCourseFact("maxStudents", "users-group", "Kuota", factCapacity ? `${Math.min(factSeatsTaken, factCapacity)} / ${factCapacity}` : "No limit",
        factCapacity ? seatsRemaining ? `${seatsRemaining} kursi lagi` : "Kuota penuh" : "Pendaftaran terbuka");
    courseFacts.append(courseFactGrid);
    introCopy.append(courseFacts);

    const tabs = el("nav", "detail-tabs");
    tabs.setAttribute("aria-label", "Course information");
    tabs.setAttribute("role", "tablist");
    const tabNames = [["overview", "Overview"], ["curriculum", "Curriculum"], ["reviews", "Reviews"], ["teacher", "About teacher"], ["faq", "FAQ"]];
    tabNames.forEach(([id, label]) => {
        const button = el("button", "detail-tab", label);
        button.type = "button";
        button.dataset.detailTab = id;
        button.id = `course-tab-${id}`;
        button.setAttribute("aria-controls", `course-panel-${id}`);
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(id === selectedTab));
        button.tabIndex = id === selectedTab ? 0 : -1;
        button.addEventListener("click", () => selectDetailTab(id, false, target));
        button.addEventListener("keydown", event => {
            const index = tabNames.findIndex(([key]) => key === id);
            const next = event.key === "ArrowRight" ? (index + 1) % tabNames.length
                : event.key === "ArrowLeft" ? (index + tabNames.length - 1) % tabNames.length
                    : event.key === "Home" ? 0 : event.key === "End" ? tabNames.length - 1 : -1;
            if (next < 0) return;
            event.preventDefault();
            selectDetailTab(tabNames[next][0], false, target);
            tabs.children[next].focus();
        });
        tabs.append(button);
    });
    detailMain.append(tabs);

    const panels = el("div", "detail-panels");
    const overview = el("section", "detail-tab-panel");
    overview.id = "course-panel-overview";
    overview.setAttribute("role", "tabpanel");
    overview.setAttribute("aria-labelledby", "course-tab-overview");
    overview.dataset.detailPanel = "overview";
    overview.append(el("h3", "", "About this course"), el("p", "detail-copy", course.summary));
    overview.append(el("h3", "", "What you'll learn"));
    const outcomes = el("ul", "learning-outcomes");
    outcomeLines.forEach(line => {
        const item = el("li");
        item.append(icon("circle-check"), el("span", "", line));
        outcomes.append(item);
    });
    if (!outcomeLines.length) overview.append(el("p", "muted", "The teacher has not added learning outcomes yet."));
    overview.append(outcomes);
    const curriculumPreview = el("section", "curriculum-preview panel");
    const curriculumHeading = el("div", "detail-side-heading");
    curriculumHeading.append(el("h3", "", "Course curriculum"), el("span", "muted", `${curriculumLines.length} course items`),
        action("View detailed curriculum →", "text-link", () => selectDetailTab("curriculum", true, target)));
    const curriculumPreviewList = el("ol", "curriculum-list");
    curriculumLines.slice(0, 3).forEach((line, index) => {
        const item = el("li");
        item.append(icon("player-play"), el("span", "", line), el("span", "curriculum-index", `Lesson ${String(index + 1).padStart(2, "0")}`));
        curriculumPreviewList.append(item);
    });
    curriculumPreview.append(curriculumHeading, curriculumPreviewList);
    overview.append(curriculumPreview, el("h3", "", "Schedule and access"), el("p", "detail-copy", course.schedule));
    panels.append(overview);

    const curriculumPanel = el("section", "detail-tab-panel");
    curriculumPanel.id = "course-panel-curriculum";
    curriculumPanel.setAttribute("role", "tabpanel");
    curriculumPanel.setAttribute("aria-labelledby", "course-tab-curriculum");
    curriculumPanel.dataset.detailPanel = "curriculum";
    curriculumPanel.append(el("h3", "", "Course curriculum"), el("p", "muted", `${course.curriculum.split(/\r?\n/).filter(Boolean).length} course items`));
    const curriculumList = el("ol", "curriculum-list");
    curriculumLines.forEach((line, index) => {
        const item = el("li");
        item.append(icon("player-play"), el("span", "", line), el("span", "curriculum-index", `Lesson ${String(index + 1).padStart(2, "0")}`));
        curriculumList.append(item);
    });
    curriculumPanel.append(curriculumList);
    panels.append(curriculumPanel);

    const reviewsPanel = el("section", "detail-tab-panel");
    reviewsPanel.id = "course-panel-reviews";
    reviewsPanel.setAttribute("role", "tabpanel");
    reviewsPanel.setAttribute("aria-labelledby", "course-tab-reviews");
    reviewsPanel.dataset.detailPanel = "reviews";
    reviewsPanel.append(buildReviewSummary(detailId, courseStats));
    const courseReviews = reviews[detailId] || {};
    const reviewList = el("div", "detail-review-list");
    Object.values(courseReviews).forEach(review => {
        const reviewCard = el("article", "detail-review");
        reviewCard.append(el("strong", "", review.studentName || "Learner"), el("span", "review-stars", `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}`), el("p", "", review.text));
        reviewList.append(reviewCard);
    });
    if (!Object.keys(courseReviews).length) reviewList.append(el("p", "muted", "No learner reviews yet. Reviews appear after an accepted learner completes a course."));
    reviewsPanel.append(reviewList);
    let reviewFocus = null;
    if (!editorCourse && requests[`${detailId}_${uid}`]?.status === "accepted") {
        const form = el("form", "review-form");
        const label = el("label", "", "Your rating");
        const rating = el("select"); rating.name = "rating";
        for (let n = 5; n >= 1; n--) { const option = el("option", "", `${n} star${n === 1 ? "" : "s"}`); option.value = n; rating.append(option); }
        label.append(rating);
        const textLabel = el("label", "", "Your review");
        const text = el("textarea"); text.name = "text"; text.maxLength = 1000; text.required = true;
        textLabel.append(text);
        const save = el("button", "primary", "Save review"); save.type = "submit";
        const failure = el("p", "error"); failure.setAttribute("role", "alert"); failure.hidden = true;
        rating.value = draft?.get("rating") ?? courseReviews[uid]?.rating ?? 5;
        text.value = draft?.get("text") ?? courseReviews[uid]?.text ?? "";
        form.append(el("h4", "", "Share your experience"), label, textLabel, failure, save);
        form.addEventListener("submit", async event => {
            event.preventDefault(); save.disabled = true;
            const id = detailId, current = version;
            try { await submitReview(id, Number(rating.value), text.value); if (current === version) $("marketStatus").textContent = "Your review was saved."; }
            catch (err) { if (current === version) error(err, target.querySelector(".review-form .error") || $("marketError")); }
            finally { save.disabled = false; }
        });
        reviewsPanel.append(form);
        if (focusedName) reviewFocus = { name: focusedName, start: selectionStart, end: selectionEnd };
    }
    panels.append(reviewsPanel);

    const teacherPanel = el("section", "detail-tab-panel teacher-detail-panel");
    teacherPanel.id = "course-panel-teacher";
    teacherPanel.setAttribute("role", "tabpanel");
    teacherPanel.setAttribute("aria-labelledby", "course-tab-teacher");
    teacherPanel.dataset.detailPanel = "teacher";
    const teacherImage = teacherAvatar();
    const teacherInfo = el("div");
    teacherInfo.append(el("h3", "", course.teacherName), el("p", "muted", detailProfile.qualification || "Independent English teacher"));
    if (Number.isInteger(detailProfile.experience)) teacherInfo.append(el("p", "muted", `${detailProfile.experience} years of teaching experience`));
    teacherInfo.append(el("p", "detail-copy", detailProfile.about || "This teacher has not added an introduction yet."));
    const profileLink = el("a", "text-link", "View teacher profile");
    profileLink.href = `profile.html?uid=${encodeURIComponent(course.teacherId)}`;
    teacherInfo.append(profileLink);
    teacherPanel.append(teacherImage, teacherInfo);
    panels.append(teacherPanel);

    const faqPanel = el("section", "detail-tab-panel detail-faq");
    faqPanel.id = "course-panel-faq";
    faqPanel.setAttribute("role", "tabpanel");
    faqPanel.setAttribute("aria-labelledby", "course-tab-faq");
    faqPanel.dataset.detailPanel = "faq";
    [
        ["How do I join this course?", "Choose Book a Class to send an enrollment request. The teacher will follow up about the schedule."],
        ["Do I pay on this page?", "No. This marketplace does not process payments. Confirm payment and class arrangements directly with the teacher."],
        ["Where can I see the schedule?", course.schedule]
    ].forEach(([question, answer]) => {
        const disclosure = document.createElement("details");
        disclosure.append(el("summary", "", question), el("p", "", answer));
        faqPanel.append(disclosure);
    });
    panels.append(faqPanel);
    detailMain.append(panels);

    purchase.append(price(course));
    if (course.originalPrice > course.price) {
        const offer = el("div", "offer-note");
        offer.append(icon("tag"), el("span", "", "Course offer · Save " + rupiah(course.originalPrice - course.price)));
        purchase.append(offer);
    }
    const purchaseNotice = el("p", "purchase-note", course.archived ? "This listing is archived." : course.published ? "No payment is collected here." : "This listing is paused.");
    const capacity = Number.isSafeInteger(course.maxStudents) ? course.maxStudents : 0;
    const seatsTaken = Math.max(
        Number.isSafeInteger(publicReserved[courseId]) ? publicReserved[courseId] : 0,
        Number.isSafeInteger(publicStudents[courseId]) ? publicStudents[courseId] : 0
    );
    const courseFull = capacity > 0 && seatsTaken >= capacity;
    const add = action(courseFull ? "Course full" : library.cart?.[courseId] ? "In cart" : "Add to cart", "primary purchase-action", async () => {
        if (requireLogin()) await toggleLibrary("cart", courseId, true);
    });
    add.prepend(icon("shopping-cart"));
    add.disabled = courseFull || !course.published || course.archived || course.teacherId === uid || pendingEnrollments.has(courseId) || Boolean(requests[`${courseId}_${uid}`]);
    if (requests[`${detailId}_${uid}`]) add.textContent = "Already requested";
    purchase.append(add);
    const book = action("Book a class", "secondary purchase-action", async () => {
        if (!requireLogin()) return;
        const current = version;
        try {
            await sendEnrollment({ ...course, id: courseId });
        } catch (failure) {
            if (current === version) error(`${course.title}: ${failure.message}`, detailId === courseId ? $("detailError") : $("marketError"));
            return;
        }
        if (current !== version) return;
        $("marketStatus").textContent = "Your class request was sent. The teacher will confirm the schedule.";
        if (detailId === courseId) target.querySelector(".detail-feedback").textContent = "Request sent. The teacher will confirm the schedule.";
        renderCatalog();
    });
    book.prepend(icon("calendar-event"));
    book.disabled = courseFull || !course.published || course.archived || course.teacherId === uid || pendingEnrollments.has(courseId) || Boolean(requests[`${courseId}_${uid}`]);
    if (requests[`${detailId}_${uid}`]) book.textContent = "Request sent";
    purchase.append(book);
    const saved = Boolean(library.favorites?.[detailId]);
    const wishlist = action(saved ? "Saved to wishlist" : "Add to wishlist", "wishlist-action", async () => {
        if (requireLogin()) await toggleLibrary("favorites", detailId, !saved);
    });
    wishlist.append(icon(saved ? "heart-filled" : "heart"));
    wishlist.setAttribute("aria-pressed", String(saved));
    purchase.append(wishlist);
    const share = action("Share this course", "text-button share-action", async () => {
        const url = new URL(`tutor-check.html?course=${encodeURIComponent(detailId)}`, location.href).href;
        if (navigator.share) {
            try { await navigator.share({ title: course.title, url }); }
            catch (err) { if (err.name !== "AbortError") throw err; }
        } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            target.querySelector(".detail-feedback").textContent = "Course link copied.";
        } else {
            const feedback = target.querySelector(".detail-feedback");
            feedback.textContent = url;
        }
    });
    share.append(icon("share-3"));
    share.setAttribute("aria-label", "Share this course");
    share.title = "Share this course";
    const shareURL = new URL(`tutor-check.html?course=${encodeURIComponent(detailId)}`, location.href).href;
    const copyLink = action("", "share-icon", async () => {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareURL);
            target.querySelector(".detail-feedback").textContent = "Course link copied.";
        } else target.querySelector(".detail-feedback").textContent = shareURL;
    });
    copyLink.append(icon("link"));
    copyLink.setAttribute("aria-label", "Copy course link");
    copyLink.title = "Copy course link";
    const shareLinks = el("div", "course-share-links");
    shareLinks.append(copyLink);
    [
        ["Facebook", "brand-facebook", `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareURL)}`],
        ["X", "brand-x", `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareURL)}&text=${encodeURIComponent(course.title)}`]
    ].forEach(([label, glyph, href]) => {
        const link = el("a", "share-icon");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", `Share on ${label}`);
        link.title = `Share on ${label}`;
        link.append(icon(glyph));
        shareLinks.append(link);
    });
    shareLinks.append(share);
    const shareSection = el("div", "course-share");
    shareSection.append(el("p", "muted", "Share this course:"), shareLinks);
    purchase.append(purchaseNotice, shareSection);
    const feedback = el("p", "detail-feedback", previousFeedback);
    feedback.setAttribute("role", "status");
    purchase.append(feedback);
    const detailError = el("p", "error", previousError);
    detailError.id = "detailError";
    detailError.setAttribute("role", "alert");
    detailError.hidden = !previousError;
    purchase.append(detailError);

    const detailSidebar = el("aside", "detail-sidebar");
    detailSidebar.append(purchase);
    const teacherSummary = el("section", "detail-side-card panel");
    const teacherHeading = el("div", "detail-side-heading");
    teacherHeading.append(el("h3", "", "Meet your teacher"));
    const seeProfile = el("a", "text-link", "See profile");
    seeProfile.href = `profile.html?uid=${encodeURIComponent(course.teacherId)}`;
    teacherHeading.append(seeProfile);
    const teacherSummaryBody = el("div", "detail-side-teacher");
    const teacherCopy = el("div");
    teacherCopy.append(el("strong", "", course.teacherName), el("p", "muted", detailProfile.qualification || "Independent English teacher"));
    if (teacherStats.reviews.length) teacherCopy.append(el("p", "detail-side-rating", `★ ${teacherStats.rating.toFixed(1)} · ${teacherStats.reviews.length} review${teacherStats.reviews.length === 1 ? "" : "s"}`));
    teacherSummaryBody.append(teacherAvatar(), teacherCopy);
    teacherSummary.append(teacherHeading, teacherSummaryBody);
    teacherSummary.append(el("p", "detail-copy detail-side-about", detailProfile.about || "This teacher has not added an introduction yet."));
    detailSidebar.append(teacherSummary);

    const reviewSummaryCard = el("section", "detail-side-card panel");
    const reviewHeading = el("div", "detail-side-heading");
    reviewHeading.append(el("h3", "", "Student reviews"));
    const seeReviews = action("See all →", "text-link", () => selectDetailTab("reviews", true, target));
    reviewHeading.append(seeReviews);
    reviewSummaryCard.append(reviewHeading, buildReviewSummary(detailId, courseStats));
    detailSidebar.append(reviewSummaryCard);
    detailLayout.append(detailMain, detailSidebar);
    target.append(detailLayout);
    selectDetailTab(selectedTab, false, target);
    if (focusedTab) target.querySelector(`[data-detail-tab="${focusedTab}"]`)?.focus({ preventScroll: true });
    else if (focused?.classList.contains("detail-title")) {
        const title = target.querySelector(".detail-title");
        if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
    }
    if (reviewFocus) {
        const field = target.querySelector(".review-form")?.elements.namedItem(reviewFocus.name);
        field?.focus();
        if (reviewFocus.start != null && reviewFocus.end != null) field?.setSelectionRange(reviewFocus.start, reviewFocus.end);
    }
    if (!editorCourse && course.teacherId === uid && role === "teacher" && !course.archived) {
        addCourseEditControls(target);
    }
    if (course.teacherId === uid && role === "teacher") addTeacherEditControls(target);
}
function addTeacherEditControls(target) {
    for (const selector of [".detail-side-about", ".teacher-detail-panel .detail-copy"]) {
        const description = target.querySelector(selector);
        const pencil = editIcon("Edit teacher introduction", () => {
            if ($("courseEditor").hidden) return openEditor(detailId, { name: "teacherIntroduction", teacherPanel: selector.includes("teacher-detail-panel") });
            if (target.querySelector(".inline-teacher-editor")) return;
            const editor = el("div", "inline-teacher-editor");
            const fields = {};
            for (const [name, labelText, max] of [["qualification", "Qualification", 120], ["about", "Teacher introduction", 3000]]) {
                const label = el("label", "inline-course-field", labelText);
                const input = el("textarea");
                input.value = detailProfile[name] || "";
                input.maxLength = max;
                input.rows = name === "about" ? 4 : 2;
                label.append(input);
                editor.append(label);
                fields[name] = input;
            }
            const note = el("p", "muted", "This updates your shared teacher profile across all courses.");
            const failure = el("p", "error");
            failure.setAttribute("role", "alert");
            failure.hidden = true;
            const cancel = action("Cancel introduction changes", "text-link", () => {
                teacherEditDirty = false;
                editor.remove();
                description.querySelector("button")?.focus({ preventScroll: true });
            });
            const save = action("Save introduction", "primary", async () => {
                const current = version;
                teacherEditBusy = true;
                const controls = [...editor.querySelectorAll("textarea,button")];
                controls.forEach(control => control.disabled = true);
                failure.hidden = true;
                try {
                    const input = {
                        experience: detailProfile.experience ?? 0,
                        qualification: fields.qualification.value,
                        about: fields.about.value,
                        imageURL: detailProfile.imageURL || ""
                    };
                    await saveTeachingProfile(input);
                    if (current !== version) return;
                    detailProfile = input;
                    teacherEditDirty = false;
                    target.querySelectorAll(".detail-side-about, .teacher-detail-panel .detail-copy").forEach(node => {
                        const button = node.querySelector(".course-edit-icon");
                        node.textContent = input.about || "This teacher has not added an introduction yet.";
                        if (button) node.append(button);
                    });
                    target.querySelectorAll(".detail-intro-teacher .muted, .detail-side-teacher .muted, .teacher-detail-panel > div > .muted:not(.editor-teacher-experience)").forEach(node => {
                        node.textContent = input.qualification || "Independent English teacher";
                    });
                    editor.remove();
                } catch (err) {
                    if (current === version) error(err, failure);
                } finally {
                    teacherEditBusy = false;
                    controls.forEach(control => control.disabled = false);
                }
            });
            editor.addEventListener("input", event => { teacherEditDirty = true; event.stopPropagation(); });
            editor.append(note, failure, save, cancel);
            description.after(editor);
            fields.about.focus({ preventScroll: true });
        });
        pencil.disabled = !detailProfileReady;
        description.append(pencil);
    }
}
function editIcon(label, callback, glyph = "pencil") {
    const button = el("button", "course-edit-icon");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.append(icon(glyph));
    button.addEventListener("click", callback);
    return button;
}
function addCourseEditControls(target) {
    const edit = (name, options = {}) => openEditor(detailId, { name, ...options });
    for (const [selector, name, label] of [
        [".detail-title", "title", "course title"], [".course-kicker", "category", "category and format"],
        [".purchase-panel > .course-price", "price", "course price"],
        ['[data-detail-panel="overview"] > .detail-copy:first-of-type', "summary", "course description"],
        ['[data-detail-panel="overview"] > .detail-copy:last-of-type', "schedule", "schedule"],
        [".detail-media", "previewFile", "course preview"]
    ]) {
        const node = target.querySelector(selector);
        node.classList.add("course-editable-display");
        node.append(editIcon(`Edit ${label}`, () => edit(name)));
    }
    for (const [field, label] of [
        ["startTime", "class time"], ["scheduleDays", "class days"], ["startDate", "first class date"],
        ["mode", "class mode"], ["maxStudents", "class capacity"]
    ]) {
        const fact = target.querySelector(`[data-course-fact="${field}"]`);
        fact?.append(editIcon(`Edit ${label}`, () => edit(field)));
    }
    for (const [selector, name, noun] of [
        [".learning-outcomes", "whatYouLearn", "outcome"],
        ['[data-detail-panel="curriculum"] .curriculum-list', "curriculum", "lesson"],
        [".curriculum-preview .curriculum-list", "curriculum", "lesson"]
    ]) {
        const list = target.querySelector(selector);
        [...list.children].forEach((item, index) => {
            const controls = el("span", "course-item-tools");
            controls.append(editIcon(`Edit ${noun} ${index + 1}`, () => edit(name, { index })),
                editIcon(`Remove ${noun} ${index + 1}`, () => edit(name, { index, remove: true }), "trash"));
            item.append(controls);
        });
        list.after(action(`Add ${noun}`, "text-link course-add-item", () => edit(name, { add: true })));
    }
    const purchase = target.querySelector(".purchase-panel");
    purchase.append(action(courses[detailId].published ? "Pause course" : "Publish course", "text-button", () => edit("published")));
    purchase.append(action("Archive course", "text-button", () => {
        archiveId = detailId;
        $("archiveCourseName").textContent = courses[detailId].title;
        $("archiveError").hidden = true;
        openDialog("archiveDialog");
    }));
}
function courseStatsFor(id) {
    const course = courses[id];
    if (!course) return courseStats();
    const courseRequests = course.teacherId === uid
        ? Object.fromEntries(Object.entries(inbox).filter(([, request]) => request.courseId === id))
        : {};
    return courseStats(reviews[id], courseRequests);
}
function buildReviewSummary(id, statistics) {
    const ratings = Object.values(reviews[id] || {}).filter(review => Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5);
    const summary = el("div", "review-summary");
    const total = el("div", "review-total");
    const filledStars = statistics.count ? Math.round(statistics.rating) : 0;
    total.append(el("strong", "", statistics.count ? statistics.rating.toFixed(1) : "—"), el("span", "review-stars", statistics.count ? "★".repeat(filledStars) + "☆".repeat(5 - filledStars) : "No ratings yet"), el("span", "muted", `${statistics.count} verified learner review${statistics.count === 1 ? "" : "s"}`));
    const breakdown = el("div", "rating-breakdown");
    for (let stars = 5; stars >= 1; stars--) {
        const count = ratings.filter(review => review.rating === stars).length;
        const row = el("div", "rating-row");
        const progress = el("span", "rating-track");
        const fill = el("span", "rating-fill");
        fill.style.width = `${ratings.length ? count / ratings.length * 100 : 0}%`;
        progress.append(fill);
        row.append(el("span", "", `${stars} star${stars === 1 ? "" : "s"}`), progress, el("span", "rating-percent", `${ratings.length ? Math.round(count / ratings.length * 100) : 0}%`));
        breakdown.append(row);
    }
    summary.append(total, breakdown);
    return summary;
}
function selectDetailTab(id, navigate = false, target = $("courseDetail")) {
    target.querySelectorAll("[data-detail-tab]").forEach(button => {
        const selected = button.dataset.detailTab === id;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
    });
    target.querySelectorAll("[data-detail-panel]").forEach(panel => { panel.hidden = panel.dataset.detailPanel !== id; });
    if (navigate) {
        const tab = target.querySelector(`[data-detail-tab="${id}"]`);
        tab?.focus({ preventScroll: true });
        target.querySelector(".detail-tabs")?.scrollIntoView({ block: "start" });
    }
}
let editorPreviewURL = "";
function renderMediaPreview(file, course) {
    const target = $("mediaPreview");
    if (editorPreviewURL) URL.revokeObjectURL(editorPreviewURL);
    editorPreviewURL = "";
    target.replaceChildren();
    const savedURL = removedPreview ? "" : course?.previewURL || course?.coverURL || "";
    const url = file ? (editorPreviewURL = URL.createObjectURL(file)) : savedURL;
    const type = file ? (file.type.startsWith("video/") ? "video" : "image") : course?.previewType || (course?.coverURL ? "image" : "");
    target.hidden = false;
    if (!url) {
        target.append(cover({
            title: $("courseForm").elements.namedItem("title").value || "Your course title",
            category: $("editorCategory").value
        }, true));
        return;
    }
    const media = type === "video" ? el("video", "editor-preview-media") : el("img", "editor-preview-media");
    media.src = url;
    if (media instanceof HTMLVideoElement) {
        media.controls = true;
        media.muted = true;
        media.playsInline = true;
    } else {
        media.alt = "Course preview";
    }
    target.append(media, el("span", "muted", file?.name || "Current course preview"));
}
async function validatePreviewFile(file) {
    const allowed = ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"];
    if (!allowed.includes(file.type)) throw new Error("Choose a PNG, JPEG or WebP image, or an MP4 or WebM video.");
    if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("Course preview files must be no larger than 20 MB.");
    if (!file.type.startsWith("video/")) return;
    const previewURL = URL.createObjectURL(file);
    try {
        const duration = await new Promise((resolve, reject) => {
            const video = document.createElement("video");
            video.preload = "metadata";
            video.onloadedmetadata = () => resolve(video.duration);
            video.onerror = () => reject(new Error("This video could not be read. Choose another file."));
            video.src = previewURL;
        });
        if (!Number.isFinite(duration) || duration <= 0 || duration > 60) throw new Error("Course preview videos must be 60 seconds or shorter.");
    } finally {
        URL.revokeObjectURL(previewURL);
    }
}
function openEditor(id = "", edit = { name: "title" }, draftId = "") {
    if (role !== "teacher") return error("Register as a teacher to create courses.");
    if (id && (!courses[id] || courses[id].teacherId !== uid || courses[id].archived)) {
        return error("You can only edit your own active courses. Restore archived courses first.");
    }
    if (draftId && !drafts[draftId]) return error("This draft is no longer available. Refresh to retry.");
    if (!$("courseEditor").hidden) return requestEditorExit(() => openEditor(id, edit, draftId));
    if (id && ($("coursePage").hidden || detailId !== id)) showCourse(id);
    const activeTab = $("courseDetail").querySelector('[aria-selected="true"]')?.dataset.detailTab || "overview";
    const url = new URL(location.href);
    url.searchParams.delete("create");
    history.replaceState(history.state, "", url);
    editorReturnCourse = !$("coursePage").hidden ? detailId : "";
    detailProfileStop();
    detailProfileStop = () => {};
    editorProfileStop();
    if (!id) { detailProfile = {}; detailProfileReady = false; }
    editingId = id;
    editingDraftId = draftId;
    const form = $("courseForm");
    $("editorFieldBank").append(...editorLabels);
    form.reset();
    const course = editorSource();
    for (const key of ["title", "category", "type", "price", "originalPrice", "summary", "whatYouLearn", "curriculum", "schedule", "scheduleDays", "startTime", "endTime", "startDate", "mode", "maxStudents"]) {
        const value = course?.[key] ?? (key === "category" ? "ielts" : key === "type" ? "live" : key === "whatYouLearn" ? course?.curriculum || "" : "");
        form.elements.namedItem(key).value = key === "maxStudents" && Number(value) === 0 ? "" : value;
    }
    form.elements.namedItem("teacherName").value = auth.currentUser.displayName?.trim() || course?.teacherName || "";
    form.elements.namedItem("published").checked = draftId ? courses[id]?.published ?? true : course ? course.published : true;
    removedPreview = false;
    editorDirty = false;
    $("browseLayout").hidden = true;
    $("teacherStudio").hidden = true;
    $("coursePage").hidden = false;
    $("courseDetail").hidden = true;
    $("courseEditor").hidden = false;
    detailId = id;
    $("coursePageTitle").textContent = course?.title || "New course";
    const draft = Object.fromEntries(new FormData(form));
    draft.teacherId = uid;
    draft.teacherName = form.elements.namedItem("teacherName").value || "Your teacher profile";
    draft.title ||= "Your course title";
    draft.price = Number(draft.price);
    draft.originalPrice = Number(draft.originalPrice);
    draft.maxStudents = Number(draft.maxStudents || 0);
    draft.published = form.elements.namedItem("published").checked;
    renderDetail($("editorCanvas"), { ...course, ...draft });
    arrangeCourseEditor();
    selectDetailTab(activeTab, false, $("editorCanvas"));
    renderMediaPreview(null, course);
    $("editorError").hidden = true;
    if (course?.previewPath?.startsWith("tutor-drafts/")) {
        const current = version;
        getBlob(storageRef(storage, course.previewPath), 20 * 1024 * 1024).then(blob => {
            if (current !== version || editingDraftId !== draftId || $("courseEditor").hidden || removedPreview || form.elements.namedItem("previewFile").files?.length) return;
            renderMediaPreview(blob, course);
        }).catch(failure => {
            console.error("[TutorCheck] Private draft preview could not load:", failure);
            if (current === version && editingDraftId === draftId && !$("courseEditor").hidden) error("Your draft text was restored, but its preview could not load. Retry by reopening the draft.", $("editorError"));
        });
    }
    $("editorHeading").textContent = id ? "Unsaved course changes" : "New course";
    $("archiveEditorCourse").hidden = !id;
    updateEditorSummary();
    syncMarketplaceNavigation();
    activateCourseField(edit);
    const current = version;
    editorProfileStop = watchTeachingProfile(uid, profile => {
        if (current !== version || $("courseEditor").hidden || editingId !== id) return;
        const canvas = $("editorCanvas");
        detailProfile = profile;
        detailProfileReady = true;
        canvas.querySelectorAll('[aria-label="Edit teacher introduction"]').forEach(button => button.disabled = false);
        canvas.querySelectorAll(".detail-intro-teacher .muted, .detail-side-teacher .muted, .teacher-detail-panel > div > .muted:not(.editor-teacher-experience)").forEach(node => {
            node.textContent = profile.qualification || "Independent English teacher";
        });
        canvas.querySelectorAll(".detail-side-about, .teacher-detail-panel .detail-copy").forEach(node => {
            const button = node.querySelector(".course-edit-icon");
            node.textContent = profile.about || "Add an introduction in your teacher profile.";
            if (button) node.append(button);
        });
        const imageURL = profile.imageURL || teacherIdentities[uid]?.photoURL;
        if (imageURL) {
            canvas.querySelectorAll(".teacher-profile-image").forEach(node => {
                const image = el("img", "teacher-profile-image");
                image.src = imageURL;
                image.alt = `${draft.teacherName} profile`;
                image.addEventListener("error", () => image.replaceWith(el("span", "teacher-profile-image teacher-profile-initial", draft.teacherName.charAt(0).toUpperCase())), { once: true });
                node.replaceWith(image);
            });
        }
        const experience = canvas.querySelector(".editor-teacher-experience");
        experience.hidden = !Number.isInteger(profile.experience);
        experience.textContent = experience.hidden ? "" : `${profile.experience} years of teaching experience`;
    }, err => error(`Teacher profile could not load. ${err.message}`, $("editorError")));
}
function inlineCourseControl(names, display, labelText) {
    if (!display) throw new Error(`Cannot create inline editor for ${labelText}: display element was not found.`);
    const group = el("div", "course-inline-control");
    group.dataset.editField = names[0];
    const view = el("div", "course-inline-display");
    const fields = el("div", "course-inline-inputs");
    fields.hidden = true;
    display.replaceWith(group);
    const button = editIcon(`Edit ${labelText}`, () => {
        view.hidden = true;
        fields.hidden = false;
        fields.querySelector("input,textarea,select")?.focus({ preventScroll: true });
    });
    view.append(display, button);
    for (const name of names) {
        const label = $("courseForm").elements.namedItem(name).closest("label");
        label.classList.add("inline-course-field");
        fields.append(label);
    }
    const done = action("Done", "text-link", () => {
        const field = fields.querySelector("input,textarea,select");
        if (names[0] === "price") {
            display.replaceChildren(...price({
                price: Number(field.value || 0),
                originalPrice: Number($("courseForm").elements.namedItem("originalPrice").value || 0)
            }).childNodes);
        } else if (names[0] === "category") {
            display.textContent = `${TUTOR_CATEGORIES.find(([id]) => id === field.value)?.[1]} · ${TUTOR_TYPES[$("editorType").value]}`;
        } else if (names[0] === "published") {
            display.textContent = field.checked ? "Published and open for enrollment" : "Paused";
        } else if (names[0] === "startTime") {
            const start = $("courseForm").elements.namedItem("startTime").value;
            const end = $("courseForm").elements.namedItem("endTime").value;
            display.textContent = start && end ? `${start.replace(":", ".")} – ${end.replace(":", ".")}`
                : start ? `From ${start.replace(":", ".")}` : end ? `Until ${end.replace(":", ".")}` : "To be arranged";
        } else if (names[0] === "scheduleDays") {
            display.textContent = field.value || "Flexible";
        } else if (names[0] === "startDate") {
            display.textContent = field.value
                ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${field.value}T00:00:00`))
                : "To be arranged";
        } else if (names[0] === "mode") {
            display.textContent = field.value === "online" ? "Online" : field.value === "offline" ? "In person" : "Not specified";
        } else if (names[0] === "maxStudents") {
            const seats = Number(display.dataset.currentSeats || 0);
            const capacity = Number(field.value || 0);
            display.textContent = capacity ? `${Math.min(seats, capacity)} / ${capacity}` : "No limit";
        } else {
            display.textContent = field.value || `Add ${labelText}`;
        }
        fields.hidden = true;
        view.hidden = false;
        button.focus({ preventScroll: true });
    });
    fields.append(done);
    group.append(view, fields);
    return group;
}
function activateCourseField(edit) {
    const canvas = $("editorCanvas");
    if (edit.name === "teacherIntroduction") {
        if (edit.teacherPanel) selectDetailTab("teacher", false, canvas);
        canvas.querySelector(`${edit.teacherPanel ? ".teacher-detail-panel .detail-copy" : ".detail-side-about"} .course-edit-icon`)?.click();
        return;
    }
    const tab = edit.name === "curriculum" ? "curriculum" : ["summary", "whatYouLearn", "schedule", "startTime", "scheduleDays", "startDate", "mode", "maxStudents"].includes(edit.name) ? "overview" : null;
    if (tab) selectDetailTab(tab, false, canvas);
    if (["whatYouLearn", "curriculum"].includes(edit.name)) {
        const section = canvas.querySelector(`.editor-${edit.name}`).closest(".editor-list");
        if (edit.add) section.querySelector(".course-add-item").click();
        else {
            const row = section.querySelectorAll("li")[edit.index ?? 0];
            row?.querySelector(edit.remove ? '[data-move="remove"]' : ".course-edit-icon").click();
            if (!row) section.querySelector(".course-add-item").focus({ preventScroll: true });
        }
    } else {
        canvas.querySelector(`[data-edit-field="${edit.name}"] .course-edit-icon`)?.click();
    }
}
function arrangeCourseEditor() {
    const canvas = $("editorCanvas"), form = $("courseForm");
    const moveField = (name, target) => {
        inlineCourseControl([name], target, name === "title" ? "course title" : name === "summary" ? "course description" : "schedule");
    };
    moveField("title", canvas.querySelector(".detail-title"));
    inlineCourseControl(["category", "type"], canvas.querySelector(".course-kicker"), "category and format");
    const overview = canvas.querySelector('[data-detail-panel="overview"]');
    const copy = overview.querySelectorAll(".detail-copy");
    moveField("summary", copy[0]);
    moveField("schedule", copy[1]);
    for (const [fields, name, label] of [
        [["startTime", "endTime"], "startTime", "class time"],
        [["scheduleDays"], "scheduleDays", "class days"],
        [["startDate"], "startDate", "first class date"],
        [["mode"], "mode", "class mode"],
        [["maxStudents"], "maxStudents", "class capacity"]
    ]) {
        inlineCourseControl(fields, canvas.querySelector(`[data-course-fact="${name}"] .course-detail-fact-value`), label);
    }
    createEditorList("whatYouLearn", overview.querySelector(".learning-outcomes"), "outcome");
    createEditorList("curriculum", canvas.querySelector('[data-detail-panel="curriculum"] .curriculum-list'), "lesson");
    const emptyOutcomes = overview.querySelector(".editor-list").previousElementSibling;
    if (emptyOutcomes?.matches(".muted")) emptyOutcomes.remove();
    const curriculumShortcut = action("Edit curriculum", "text-link", () => selectDetailTab("curriculum", false, canvas));
    overview.querySelector(".curriculum-preview").append(curriculumShortcut);
    const purchase = canvas.querySelector(".purchase-panel");
    inlineCourseControl(["price", "originalPrice"], purchase.querySelector(".course-price"), "course price");
    const state = el("p", "muted", form.elements.namedItem("published").checked ? "Published and open for enrollment" : "Paused");
    purchase.append(state);
    inlineCourseControl(["published"], state, "publication status");
    const media = canvas.querySelector(".detail-media");
    const fileLabel = form.elements.namedItem("previewFile").closest("label");
    fileLabel.classList.add("inline-course-field");
    const remove = action("Remove preview", "text-button", () => {
        form.elements.namedItem("previewFile").value = "";
        removedPreview = true;
        editorDirty = true;
        renderMediaPreview(null, null);
        updateEditorSummary();
    });
    remove.id = "removeCoursePreview";
    media.replaceChildren($("mediaPreview"), fileLabel, $("editorFieldBank").querySelector("p"), remove);
    const mediaOptions = el("div", "course-media-options");
    mediaOptions.hidden = true;
    mediaOptions.append(fileLabel, media.querySelector("p"), remove);
    media.append(editIcon("Edit course preview", () => {
        mediaOptions.hidden = !mediaOptions.hidden;
        if (!mediaOptions.hidden) fileLabel.querySelector("input").focus({ preventScroll: true });
    }), mediaOptions);
    media.dataset.editField = "previewFile";
    const teacherPanel = canvas.querySelector('[data-detail-panel="teacher"]');
    const experience = el("p", "muted editor-teacher-experience");
    experience.hidden = true;
    teacherPanel.querySelector(".detail-copy").before(experience);
    teacherPanel.append(el("p", "muted", "Teacher information is shared across your courses. Reviews are written by learners and cannot be edited here."));
    const reviewForm = canvas.querySelector(".review-form");
    if (reviewForm) reviewForm.remove();
}
function createEditorList(name, target, noun) {
    const field = $("courseForm").elements.namedItem(name);
    field.required = false;
    const list = el(name === "whatYouLearn" ? "ul" : "ol", `${name === "whatYouLearn" ? "learning-outcomes" : "curriculum-list"} editor-item-list editor-${name}`);
    const section = el("div", "editor-list");
    const sync = () => {
        field.value = [...list.querySelectorAll("input")].map(input => input.value.trim()).filter(Boolean).join("\n");
        editorDirty = true;
        updateEditorSummary();
    };
    const renumber = () => {
        [...list.children].forEach((item, index) => {
            item.querySelector("input").setAttribute("aria-label", `${noun} ${index + 1}`);
            if (name !== "whatYouLearn") item.querySelector(".editor-item-number").textContent = String(index + 1).padStart(2, "0");
            item.querySelector("[data-move='up']").disabled = index === 0;
            item.querySelector("[data-move='down']").disabled = index === list.children.length - 1;
        });
    };
    const addRow = (value = "", focus = false) => {
        const item = el("li");
        const input = el("input");
        input.type = "text";
        input.value = value;
        input.maxLength = field.maxLength;
        input.placeholder = `Add a ${noun}`;
        input.hidden = !focus;
        input.addEventListener("input", sync);
        const text = el("span", "course-item-text", value || `Add a ${noun}`);
        text.hidden = focus;
        const edit = editIcon(`Edit ${noun}`, () => {
            text.hidden = true;
            input.hidden = false;
            input.focus({ preventScroll: true });
        });
        input.addEventListener("blur", () => {
            text.textContent = input.value || `Add a ${noun}`;
            text.hidden = false;
            input.hidden = true;
        });
        const controls = el("div", "row-actions");
        controls.append(edit);
        for (const [direction, glyph] of [["up", "arrow-up"], ["down", "arrow-down"], ["remove", "trash"]]) {
            const button = el("button", "text-button");
            button.type = "button";
            button.addEventListener("click", () => {
                if (direction === "remove") {
                    const next = item.nextElementSibling || item.previousElementSibling;
                    item.remove();
                    (next?.querySelector(".course-edit-icon") || add).focus({ preventScroll: true });
                } else if (direction === "up" && item.previousElementSibling) {
                    list.insertBefore(item, item.previousElementSibling);
                } else if (direction === "down" && item.nextElementSibling) {
                    list.insertBefore(item.nextElementSibling, item);
                }
                renumber();
                sync();
            });
            button.dataset.move = direction;
            button.setAttribute("aria-label", `${direction === "remove" ? "Remove" : `Move ${direction}`} ${noun}`);
            button.append(icon(glyph));
            controls.append(button);
        }
        const content = el("div", "course-item-content");
        content.append(text, input);
        const marker = el("span", "editor-item-number");
        if (name === "whatYouLearn") marker.append(icon("circle-check"));
        item.append(marker, content, controls);
        list.append(item);
        renumber();
        if (focus) input.focus();
    };
    const add = action(`Add ${noun}`, "text-link course-add-item", () => { addRow("", true); sync(); });
    field.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).forEach(value => addRow(value));
    section.append(list, add);
    target.replaceWith(section);
}
function updateEditorSummary() {
    const form = $("courseForm"), canvas = $("editorCanvas");
    const count = name => form.elements.namedItem(name).value.split(/\r?\n/).filter(line => line.trim()).length;
    const price = form.elements.namedItem("price").valueAsNumber;
    const original = form.elements.namedItem("originalPrice").valueAsNumber;
    const priceDisplay = canvas.querySelector('[data-edit-field="price"] .course-price');
    priceDisplay.textContent = rupiah(Number.isFinite(price) ? price : 0);
    if (Number.isFinite(original) && original > price) priceDisplay.append(el("del", "", rupiah(original)));
    $("editorStatus").textContent = editorDirty ? "Unsaved changes" : "Edit any field below. Nothing changes for learners until you save.";
    $("saveCourseButton").textContent = form.elements.namedItem("published").checked ? editingId ? "Save changes" : "Publish course" : "Save paused course";
    if (editingId) {
        $("coursePageTitle").textContent = form.elements.namedItem("title").value || courses[editingId].title;
    }
    const previewList = canvas.querySelector(".curriculum-preview .curriculum-list");
    previewList.replaceChildren();
    form.elements.namedItem("curriculum").value.split(/\r?\n/).filter(line => line.trim()).slice(0, 3).forEach((line, index) => {
        const item = el("li");
        item.append(icon("player-play"), el("span", "", line), el("span", "curriculum-index", `Lesson ${String(index + 1).padStart(2, "0")}`));
        previewList.append(item);
    });
    canvas.querySelector(".curriculum-preview .detail-side-heading .muted").textContent = `${count("curriculum")} course items`;
    canvas.querySelector('[data-detail-panel="curriculum"] > .muted').textContent = `${count("curriculum")} course items`;
    const faq = canvas.querySelector(".detail-faq details:last-child p");
    faq.textContent = form.elements.namedItem("schedule").value || "Add schedule and access details in Overview.";
    $("removeCoursePreview").hidden = !form.elements.namedItem("previewFile").files?.length && (removedPreview || !(editorSource()?.previewPath || editorSource()?.coverURL));
}
function closeEditor() {
    editorProfileStop();
    editorProfileStop = () => {};
    if (editorPreviewURL) URL.revokeObjectURL(editorPreviewURL);
    editorPreviewURL = "";
    editorDirty = false;
    teacherEditDirty = false;
    $("courseEditor").hidden = true;
    $("courseDetail").hidden = false;
    $("editorFieldBank").append(...editorLabels);
    $("editorCanvas").replaceChildren();
    $("courseForm").reset();
    editingId = "";
    editingDraftId = "";
}
function requestEditorExit(callback) {
    if (editorBusy || teacherEditBusy) return;
    if (!editorDirty && !teacherEditDirty) { closeEditor(); callback(); return; }
    pendingEditorExit = callback;
    openDialog("discardCourseDialog");
    $("keepCourseEdit").focus();
}
$("keepCourseEdit").addEventListener("click", () => $("discardCourseDialog").close());
$("discardCourseEdit").addEventListener("click", () => {
    const next = pendingEditorExit;
    $("discardCourseDialog").close();
    closeEditor();
    next?.();
});
$("cancelCourseEdit").addEventListener("click", () => {
    const courseId = editorReturnCourse;
    const tab = $("editorCanvas").querySelector('[aria-selected="true"]')?.dataset.detailTab;
    requestEditorExit(() => {
        if (courseId) {
            showCourse(courseId, false);
            if (tab) selectDetailTab(tab);
        } else setStudioView(true);
    });
});
$("archiveEditorCourse").addEventListener("click", () => {
    archiveId = editingId;
    $("archiveCourseName").textContent = courses[editingId].title;
    $("archiveError").hidden = true;
    openDialog("archiveDialog");
    $("archiveCancel").focus();
});
$("courseForm").addEventListener("input", () => {
    editorDirty = true;
    updateEditorSummary();
    if (!$("courseForm").elements.namedItem("previewFile").files?.length && (removedPreview || !(editorSource()?.previewPath || editorSource()?.coverURL))) renderMediaPreview(null, null);
});
$("courseForm").addEventListener("invalid", event => {
    const panel = event.target.closest("[data-detail-panel]");
    if (panel) selectDetailTab(panel.dataset.detailPanel, false, $("editorCanvas"));
    const control = event.target.closest(".course-inline-control");
    if (control) {
        control.querySelector(".course-inline-display").hidden = true;
        control.querySelector(".course-inline-inputs").hidden = false;
    }
}, true);
$("courseForm").elements.namedItem("previewFile").addEventListener("change", () => {
    removedPreview = false;
    renderMediaPreview($("courseForm").elements.namedItem("previewFile").files?.[0] || null, editorSource());
    editorDirty = true;
    updateEditorSummary();
});
window.addEventListener("beforeunload", event => {
    if (!editorDirty && !editorBusy && !teacherEditDirty && !teacherEditBusy) return;
    event.preventDefault();
    event.returnValue = "";
});
document.addEventListener("click", event => {
    const link = event.target.closest("a[href]");
    if ($("courseEditor").hidden || !link || link.target === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
    event.preventDefault();
    requestEditorExit(() => { location.href = link.href; });
});
$("courseForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (editorBusy) return;
    const savingDraft = event.submitter?.id === "saveDraftButton";
    if (teacherEditDirty || teacherEditBusy) {
        return error("Save or cancel the teacher introduction changes before saving the course.", $("editorError"));
    }
    const form = $("courseForm"), fields = [...form.elements];
    const disabledStates = fields.map(field => field.disabled);
    const data = Object.fromEntries(new FormData(form));
    data.price = Number(data.price); data.originalPrice = Number(data.originalPrice || 0); data.maxStudents = Number(data.maxStudents || 0); data.published = form.elements.namedItem("published").checked;
    let file = form.elements.namedItem("previewFile").files?.[0];
    const existing = editorSource();
    data.coverURL = removedPreview ? "" : existing?.coverURL || "";
    data.previewURL = removedPreview ? "" : existing?.previewURL || "";
    data.previewPath = removedPreview ? "" : existing?.previewPath || "";
    data.previewType = removedPreview ? "" : existing?.previewType || "";
    const current = version;
    const id = editingId;
    const draftId = editingDraftId;
    editorBusy = true;
    fields.forEach(field => field.disabled = true);
    $("editorError").hidden = true;
    let uploadedRef = null;
    try {
        if (!savingDraft && !file && data.previewPath.startsWith("tutor-drafts/")) {
            file = await getBlob(storageRef(storage, data.previewPath), 20 * 1024 * 1024);
        }
        // Private preview paths are validated as drafts until their public copy exists.
        validateCourse(data, { draft: savingDraft || data.previewPath.startsWith("tutor-drafts/") });
        if (!savingDraft) validateCourse({ ...data, previewPath: "", previewURL: "", previewType: "" });
        if (file) {
            await validatePreviewFile(file);
            if (current !== version) throw new Error("Your account changed. Reopen the course editor to continue.");
            const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm" }[file.type];
            const previewPath = `${savingDraft ? "tutor-drafts" : "tutor-courses"}/${auth.currentUser.uid}/${crypto.randomUUID()}/preview.${extension}`;
            uploadedRef = storageRef(storage, previewPath);
            await uploadBytes(uploadedRef, file, { contentType: file.type });
            data.previewURL = savingDraft ? "" : await getDownloadURL(uploadedRef);
            data.previewPath = previewPath;
            data.previewType = file.type.startsWith("video/") ? "video" : "image";
        }
        validateCourse(data, { draft: savingDraft });
        if (current !== version) throw new Error("Your account changed. Reopen the course editor to continue.");
        if (savingDraft) {
            const savedDraftId = await saveCourseDraft(data, draftId, id);
            uploadedRef = null;
            if (current !== version) return;
            drafts[savedDraftId] = { ...validateCourse(data, { draft: true }), courseId: id, teacherId: uid, updatedAt: Date.now() };
            closeEditor();
            setStudioView(true);
            $("marketStatus").textContent = "Private draft saved. Resume it from your course list, including after signing in on another device.";
            if (existing?.previewPath?.startsWith("tutor-drafts/") && existing.previewPath !== data.previewPath) {
                try { await deleteObject(storageRef(storage, existing.previewPath)); }
                catch (failure) {
                    console.error("[TutorCheck] Previous draft preview cleanup failed:", failure);
                    if (current === version) error("Draft saved, but its previous private preview could not be removed from storage.");
                }
            }
            return;
        }
        const savedId = await saveCourse(data, id, draftId);
        uploadedRef = null;
        if (current !== version) return;
        courses[savedId] = { ...courses[id], ...validateCourse(data), teacherId: uid, createdAt: courses[id]?.createdAt || Date.now(), updatedAt: Date.now() };
        const selectedTab = $("editorCanvas").querySelector('[aria-selected="true"]')?.dataset.detailTab;
        closeEditor();
        showCourse(savedId, false);
        if (selectedTab) selectDetailTab(selectedTab);
        let cleanupWarning = "";
        if (existing?.previewPath && existing.previewPath !== data.previewPath) {
            try { await deleteObject(storageRef(storage, existing.previewPath)); }
            catch (cleanupError) {
                console.error("[TutorCheck] Previous course media could not be removed:", cleanupError);
                cleanupWarning = " The previous preview could not be removed from storage.";
            }
        }
        if (current === version) {
            $("marketStatus").textContent = `Course saved. Published courses appear immediately.${cleanupWarning}`;
            if (detailId === savedId) {
                const feedback = $("courseDetail").querySelector(".detail-feedback");
                if (feedback) feedback.textContent = `Course saved.${cleanupWarning}`;
            }
        }
    } catch (err) {
        if (uploadedRef) {
            try { await deleteObject(uploadedRef); }
            catch (cleanupError) { console.error("[TutorCheck] Unused course preview could not be removed:", cleanupError); }
        }
        if (current === version) {
            error(err, $("editorError"));
            const missing = ["whatYouLearn", "curriculum"].find(name => !form.elements.namedItem(name).value.trim());
            if (missing) selectDetailTab(missing === "curriculum" ? "curriculum" : "overview", false, $("editorCanvas"));
            $("editorError").scrollIntoView({ block: "nearest" });
        }
    }
    finally { editorBusy = false; fields.forEach((field, index) => field.disabled = disabledStates[index]); }
});
$("checkoutButton").addEventListener("click", async () => {
    if (!requireLogin() || checkoutBusy) return;
    checkoutBusy = true; renderCart();
    $("cartError").hidden = true;
    $("cartStatus").textContent = "Sending enrollment requests...";
    const current = version, ids = Object.keys(library.cart || {});
    const failures = [];
    let sent = 0;
    for (const id of ids) {
        if (current !== version) break;
        const course = courses[id];
        if (!course?.published || course.archived || course.teacherId === uid) { failures.push("An unavailable course was left in your cart."); continue; }
        try {
            if (!requests[`${id}_${uid}`]) { await sendEnrollment({ ...course, id }); sent++; }
            if (current !== version) break;
            await toggleLibrary("cart", id, false);
        } catch (err) { failures.push(`${course.title}: ${err.message}`); }
    }
    checkoutBusy = false;
    if (current !== version) return;
    const message = `${sent} enrollment request${sent === 1 ? "" : "s"} sent. No payment was collected.`;
    $("marketStatus").textContent = message;
    $("cartStatus").textContent = message;
    if (failures.length) error(failures.join("\n"), $("cartError"));
    renderCart();
});
TUTOR_CATEGORIES.forEach(([id, label, glyph]) => {
    const button = action("", "", () => { category = category === id ? "" : id; renderCatalog(); });
    button.dataset.category = id; button.setAttribute("aria-pressed", "false");
    button.append(icon(glyph), el("span", "", label));
    $("categoryChoices").append(button);
    const option = el("option", "", label); option.value = id; $("editorCategory").append(option);
});
Object.entries(TUTOR_TYPES).forEach(([id, label]) => {
    const option = el("option", "", label); option.value = id; $("editorType").append(option);
});
$("courseSort").addEventListener("change", renderCatalog);
$("courseSearch").addEventListener("input", renderCatalog);
$("teacherFilter").addEventListener("change", () => { selectedTeacher = $("teacherFilter").value; renderCatalog(); });
document.querySelectorAll(".filter-panel input").forEach(input => input.addEventListener("change", () => {
    renderCatalog();
}));
const compactFilters = matchMedia("(max-width:1023px)");
function syncFilterLayout() {
    if (compactFilters.matches) document.querySelector(".browse-content").prepend(filterPanel);
    else filterSidebar.append(filterPanel);
}
syncFilterLayout();
compactFilters.addEventListener("change", syncFilterLayout);
function resetFilters() {
    const recoverFocus = document.activeElement?.closest(".empty-state");
    const resetFocused = document.activeElement === $("resetFilters");
    category = ""; selectedTeacher = "";
    $("courseSearch").value = "";
    $("courseSort").value = "newest";
    $("teacherFilter").value = "";
    document.querySelectorAll('[name="price"]').forEach(input => input.checked = false);
    document.querySelector('[name="rating"][value=""]').checked = true;
    renderCatalog();
    if (recoverFocus) $("resultCount").focus({ preventScroll: true });
    else if (resetFocused) $("filterHeading").focus({ preventScroll: true });
}
$("resetFilters").addEventListener("click", resetFilters);
$("allCategories").addEventListener("click", () => { category = ""; renderCatalog(); });
$("cartButton").addEventListener("click", () => { if (requireLogin()) { $("cartError").hidden = true; $("cartStatus").textContent = ""; renderCart(); openDialog("cartDialog"); } });
$("browseTab").addEventListener("click", event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
    event.preventDefault();
    if (!classesView && !$("browseLayout").hidden) return;
    const url = new URL(location.href);
    url.searchParams.delete("classes");
    url.searchParams.delete("course");
    rememberScroll();
    history.pushState({ marketplaceClasses: false }, "", url);
    showCatalog(false);
    window.scrollTo(0, 0);
});
$("classesTab").addEventListener("click", event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
    event.preventDefault();
    if (classesView && !$("browseLayout").hidden) return;
    showClasses(true, false);
    window.scrollTo(0, 0);
});
$("manageButton").addEventListener("click", () => setStudioView($("teacherStudio").hidden));
$("newCourse").addEventListener("click", () => openEditor());
$("backToCatalog").addEventListener("click", () => {
    if (history.state?.marketplaceCourse) history.back();
    else {
        const url = new URL(location.href);
        url.searchParams.delete("course");
        history.replaceState(null, "", url);
        showCatalog();
    }
});
window.addEventListener("popstate", () => {
    const params = new URLSearchParams(location.search);
    const courseId = params.get("course");
    const savedY = history.state?.scrollY;
    const restore = typeof savedY === "number";
    if (courseId) showCourse(courseId, !restore);
    else if (params.get("studio") === "1" && role === "teacher") setStudioView(true, false, !restore);
    else if (params.get("classes") === "1") showClasses(false, !restore);
    else showCatalog(!restore);
    if (restore) requestAnimationFrame(() => window.scrollTo(0, savedY));
});
let catalogStop = () => {}, reviewsStop = () => {};
function updateConnectionStatus() {
    const message = [catalogFailure, reviewsFailure].filter(Boolean).join(" ");
    $("marketConnectionError").textContent = message;
    $("marketConnectionError").hidden = !message;
    $("retryMarketplace").hidden = !message;
    if (message) {
        $("courseGrid").setAttribute("aria-busy", "false");
        $("courseGrid").replaceChildren(el("p", "muted", "Courses could not load completely. Retry the connection above."));
    }
}
function connectMarketplace() {
    catalogStop();
    reviewsStop();
    catalogFailure = ""; reviewsFailure = "";
    catalogReady = false; reviewsReady = false;
    $("courseGrid").setAttribute("aria-busy", "true");
    $("courseGrid").replaceChildren(...Array.from({ length: 4 }, () => el("div", "skeleton")));
    updateConnectionStatus();
    catalogStop = watchCatalog(data => {
        courses = data; catalogReady = true; catalogFailure = "";
        updateConnectionStatus();
        syncPublicCourseData(); renderCatalog();
        if (!$("coursePage").hidden) renderDetail();
    }, err => {
        console.error("[TutorCheck] Course subscription failed:", err);
        catalogFailure = `Courses could not sync. ${err.message}`;
        updateConnectionStatus();
    });
    reviewsStop = watchReviews(data => {
        reviews = data; reviewsReady = true; reviewsFailure = "";
        updateConnectionStatus();
        renderCatalog();
        if (!$("coursePage").hidden) renderDetail();
    }, err => {
        console.error("[TutorCheck] Review subscription failed:", err);
        reviewsFailure = `Course ratings could not sync. ${err.message}`;
        updateConnectionStatus();
    });
}
$("retryMarketplace").addEventListener("click", connectMarketplace);
connectMarketplace();
const authStop = onAuthStateChanged(auth, user => {
    accountStop(); version++;
    pendingEnrollments.clear();
    authReady = true;
    uid = user?.uid || ""; role = "student"; roleReady = false; library = {}; requests = {}; requestsReady = false; inbox = {}; drafts = {};
    verificationStatus = { status: "loading" }; verificationLoading = false; verificationBusy = false; isMarketplaceModerator = false;
    $("verificationError").hidden = true;
    $("moderatorVerificationPanel").hidden = true;
    $("moderatorVerificationQueue").replaceChildren();
    document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
    if (!$("courseEditor").hidden) { closeEditor(); $("browseLayout").hidden = false; }
    $("teacherStudio").hidden = true;
    renderCatalog();
    if (!uid) return;
    const current = version;
    loadModeratorAccess(user, current);
    const guarded = callback => data => { if (current === version) { callback(data); renderCatalog(); } };
    accountStop = watchAccount(uid, {
        role: guarded(data => {
            const changed = !roleReady || role !== data;
            role = data; roleReady = true;
            if (changed && role === "teacher") loadTutorVerificationStatus(current);
            if (role !== "teacher" && !$("courseEditor").hidden) {
                closeEditor(); showCatalog(); error("Teacher access is required to edit courses.");
            } else if (!$("coursePage").hidden) renderDetail();
        }),
        library: guarded(data => { library = data; if (!$("coursePage").hidden) renderDetail(); }),
        requests: guarded(data => { requests = data; requestsReady = true; if (!$("coursePage").hidden) renderDetail(); }),
        inbox: guarded(data => { inbox = data; if (!$("coursePage").hidden) renderDetail(); }),
        drafts: guarded(data => { drafts = data; })
    }, err => { if (current === version) error(`Your marketplace account could not sync. Refresh to retry. ${err.message}`); });
});
window.addEventListener("pagehide", () => {
    editorProfileStop();
    if (editorPreviewURL) URL.revokeObjectURL(editorPreviewURL);
    accountStop(); catalogStop(); reviewsStop(); authStop();
    teacherIdentityStops.forEach(stop => stop());
    courseStudentStops.forEach(stop => stop());
    compactFilters.removeEventListener("change", syncFilterLayout);
}, { once: true });
