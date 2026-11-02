import { auth } from "./js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { TUTOR_CATEGORIES, TUTOR_TYPES, selectCourses, courseStats, rupiah, validateCourse } from "./js/tutor-model.js?v=20261101-crud";
import { watchCatalog, watchReviews, watchTeachingProfile, watchAccount, saveCourse, setCourseState, toggleLibrary, requestEnrollment, changeRequest, submitReview } from "./js/tutor-service.js?v=20261101-crud";

const $ = id => document.getElementById(id);
let courses = {}, reviews = {}, library = {}, requests = {}, inbox = {};
let uid = "", role = "student", version = 0, accountStop = () => {};
let category = "", type = "", favoritesOnly = false, editingId = "", detailId = "";
let selectedTeacher = new URLSearchParams(location.search).get("teacher") || "";
let detailProfile = {}, detailProfileStop = () => {};
let catalogReady = false, reviewsReady = false, checkoutBusy = false;
const pageParams = new URLSearchParams(location.search);
let initialCourse = pageParams.get("course") || "";
let initialStudio = pageParams.get("studio") === "1";
let initialCreate = pageParams.get("create") === "1";
let archiveId = "";
const storage = getStorage(auth.app);
async function updateCourseState(id, state) {
    const current = version;
    await setCourseState(id, state);
    if (current === version) $("marketStatus").textContent = `Course ${state}. Existing learner records are unchanged.`;
}
$("teacherEnrollmentFilter").addEventListener("change", renderStudio);
$("archiveCancel").addEventListener("click", () => $("archiveDialog").close());
$("archiveConfirm").addEventListener("click", async () => {
    const current = version, id = archiveId;
    $("archiveConfirm").disabled = true;
    try { await updateCourseState(id, "archived"); if (current === version) $("archiveDialog").close(); }
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
function error(message, target = $("marketError")) {
    console.error("[TutorCheck]", message);
    target.textContent = message instanceof Error ? message.message : String(message);
    target.hidden = false;
}
function action(text, className, callback) {
    const node = el("button", className, text);
    node.type = "button";
    node.addEventListener("click", async () => {
        node.disabled = true;
        const current = version;
        try { await callback(); }
        catch (failure) { if (current === version) error(failure); }
        finally { if (node.isConnected) node.disabled = false; }
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
$("courseDialog").addEventListener("close", () => {
    detailProfileStop();
    detailProfileStop = () => {};
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
            node.setAttribute("aria-label", `${course.title} video preview`);
            return node;
        }
        const node = el("div", "course-cover course-cover--video");
        node.append(icon("player-play"), el("span", "", "Video preview"));
        return node;
    }
    if (!url) {
        const node = el("div", "course-cover");
        node.append(icon(TUTOR_CATEGORIES.find(([id]) => id === course.category)?.[2] || "book"));
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
    const artwork = el("div", "course-artwork");
    artwork.append(cover(course));
    if (course.originalPrice > course.price) artwork.append(el("span", "course-badge", "Limited offer"));
    const detail = action("", "course-open", () => showCourse(course.id));
    detail.append(icon("arrow-up-right"));
    detail.setAttribute("aria-label", `View ${course.title}`);
    artwork.append(detail);
    node.append(artwork);
    const content = el("div", "course-content");
    const teacher = el("a", "teacher-name", course.teacherName);
    teacher.href = `profile.html?uid=${encodeURIComponent(course.teacherId)}`;
    const categoryName = TUTOR_CATEGORIES.find(([id]) => id === course.category)?.[1] || "English";
    const typeLabel = TUTOR_TYPES[course.type] || "Course";
    const categoryLine = el("p", "course-kicker", `${categoryName} · ${typeLabel}`);
    const heading = el("h3");
    heading.append(action(course.title, "course-title", () => showCourse(course.id)));
    const teacherLine = el("div", "course-teacher-line");
    const avatar = el("span", "teacher-avatar", course.teacherName.trim().charAt(0).toUpperCase() || "T");
    avatar.setAttribute("aria-hidden", "true");
    teacherLine.append(avatar, teacher);
    const ratingLine = el("div", "course-rating-line");
    ratingLine.append(
        el("p", "rating", statistics.count ? `★ ${statistics.rating.toFixed(1)}` : "New course"),
        el("span", "review-count", statistics.count ? `${statistics.count} review${statistics.count === 1 ? "" : "s"}` : "Be the first to review")
    );
    const learnerCount = course.teacherId === uid
        ? `${statistics.students} accepted learner${statistics.students === 1 ? "" : "s"}`
        : "Learner count not shared";
    content.append(categoryLine, heading, teacherLine, ratingLine, el("p", "learner-count", learnerCount), price(course));
    const bottom = el("div", "card-bottom");
    const inCart = Boolean(library.cart?.[course.id]);
    const cart = action(inCart ? "In cart" : "Add to cart", "primary", async () => {
        if (!requireLogin()) return;
        await toggleLibrary("cart", course.id, !inCart);
    });
    cart.disabled = uid === course.teacherId || Boolean(requests[`${course.id}_${uid}`]);
    if (uid === course.teacherId) cart.textContent = "Your course";
    else if (cart.disabled) cart.textContent = "Requested";
    const saved = Boolean(library.favorites?.[course.id]);
    const save = action("", "save-button", async () => {
        if (requireLogin()) await toggleLibrary("favorites", course.id, !saved);
    });
    save.append(icon(saved ? "heart-filled" : "heart"));
    save.setAttribute("aria-label", `${saved ? "Unsave" : "Save"} ${course.title}`);
    save.setAttribute("aria-pressed", String(saved));
    bottom.append(cart, save);
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
        const teacher = Object.values(courses).find(course => course.teacherId === selectedTeacher)?.teacherName || "Selected teacher";
        add(teacher, () => { selectedTeacher = ""; $("teacherFilter").value = ""; });
    }
    if (category) add(TUTOR_CATEGORIES.find(([id]) => id === category)[1], () => category = "");
    if (type) add(TUTOR_TYPES[type], () => { type = ""; document.querySelector('[name="courseType"][value=""]').checked = true; });
    if ($("courseSearch").value.trim()) add(`Search: ${$("courseSearch").value.trim()}`, () => $("courseSearch").value = "");
    document.querySelectorAll('[name="price"]:checked').forEach(input => add(input.parentElement.textContent.trim(), () => input.checked = false));
    const rating = document.querySelector('[name="rating"]:checked');
    if (rating.value) add(`${rating.value} stars & up`, () => document.querySelector('[name="rating"][value=""]').checked = true);
    if (favoritesOnly) add("Saved courses", () => { favoritesOnly = false; $("favoritesButton").setAttribute("aria-pressed", "false"); });
    document.querySelectorAll('[name="courseType"]').forEach(input => { input.checked = input.value === type; });
    const count = target.children.length;
    target.hidden = !count;
    $("filterCount").hidden = !count;
    $("filterCount").textContent = count;
    $("resetFilters").disabled = !count && $("courseSort").value === "newest";
    $("allCategories").disabled = !category;
    document.querySelectorAll("[data-category]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.category === category)));
    if (focusedIndex >= 0) {
        (target.children[Math.min(focusedIndex, count - 1)] || $("courseFilters").querySelector("summary")).focus();
    }
}
function renderCatalog() {
    $("manageButton").hidden = role !== "teacher";
    $("teacherSignup").hidden = role === "teacher";
    $("cartCount").textContent = Object.keys(library.cart || {}).length;
    const teacherOptions = $("teacherFilter");
    const teacherSelection = selectedTeacher;
    const teacherRows = [...new Map(Object.values(courses).map(course => [course.teacherId, course.teacherName])).entries()]
        .sort((a, b) => a[1].localeCompare(b[1]));
    teacherOptions.replaceChildren(new Option("All teachers", ""));
    teacherRows.forEach(([id, name]) => teacherOptions.append(new Option(name, id)));
    selectedTeacher = teacherRows.some(([id]) => id === teacherSelection) || (!catalogReady && !teacherRows.length) ? teacherSelection : "";
    teacherOptions.value = selectedTeacher;
    renderFilterState();
    if (!catalogReady || !reviewsReady) return;
    const statistics = stats();
    const filters = { teacher: selectedTeacher, category, type, search: $("courseSearch").value, sort: $("courseSort").value,
        rating: document.querySelector('[name="rating"]:checked').value,
        prices: [...document.querySelectorAll('[name="price"]:checked')].map(input => input.value) };
    let rows = selectCourses(courses, filters, statistics);
    if (favoritesOnly) rows = rows.filter(course => library.favorites?.[course.id]);
    const grid = $("courseGrid");
    grid.replaceChildren();
    grid.setAttribute("aria-busy", "false");
    $("resultCount").textContent = `${rows.length} ${favoritesOnly ? "saved " : ""}course${rows.length === 1 ? "" : "s"}`;
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
    $("cartCount").textContent = Object.keys(library.cart || {}).length;
    $("manageButton").hidden = role !== "teacher";
    $("teacherSignup").hidden = role === "teacher";
    document.querySelectorAll("[data-category]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.category === category)));
    renderCart();
    renderRequests();
    renderStudio();
    if (initialCourse) {
        const id = initialCourse;
        initialCourse = "";
        if (courses[id]?.published && !courses[id].archived && (!selectedTeacher || courses[id].teacherId === selectedTeacher)) showCourse(id);
        else error("This course is no longer available for enrollment.");
    }
    if (initialStudio && role === "teacher") { initialStudio = false; $("teacherStudio").hidden = false; $("teacherStudio").scrollIntoView({ block: "start" }); }
    if (initialCreate && role === "teacher") {
        initialCreate = false;
        $("teacherStudio").hidden = false;
        openEditor();
    }
}
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
        node.append(action("Remove", "text-button", () => toggleLibrary("cart", id, false)));
        items.append(node);
    });
    if (!items.children.length) items.append(el("p", "muted", "Your cart is empty. Add courses you would like to join."));
    $("cartTotal").textContent = `Total: ${rupiah(total)}`;
    $("checkoutButton").disabled = checkoutBusy || !validCount || !uid;
}
function renderRequests() {
    const items = $("studentRequests");
    items.replaceChildren();
    Object.entries(requests).sort(([, a], [, b]) => b.createdAt - a.createdAt).forEach(([id, request]) => {
        const course = courses[request.courseId];
        const node = row(course?.title || "Course unavailable", `${request.status} | Requested price: ${rupiah(request.price)}`);
        const buttons = el("div", "row-actions");
        if (request.status === "pending") buttons.append(action("Cancel", "text-button", () => changeRequest(id, "cancelled")));
        if (course) buttons.append(action("View course", "text-button", () => { $("requestsDialog").close(); showCourse(request.courseId); }));
        const contact = el("a", "", "Teacher profile");
        contact.href = `profile.html?uid=${encodeURIComponent(request.teacherId)}`;
        buttons.append(contact);
        node.append(buttons);
        items.append(node);
    });
    if (!items.children.length) items.append(el("p", "muted", "No enrollment requests yet."));
}
function renderStudio() {
    if (role !== "teacher") { $("teacherStudio").hidden = true; return; }
    const ownedRows = Object.entries(courses).filter(([, course]) => course.teacherId === uid);
    const ownedReviews = ownedRows.flatMap(([id]) => Object.values(reviews[id] || {}).filter(review => Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5));
    const accepted = Object.values(inbox).filter(request => request.status === "accepted");
    const pending = Object.values(inbox).filter(request => request.status === "pending");
    const averageRating = ownedReviews.length ? ownedReviews.reduce((sum, review) => sum + review.rating, 0) / ownedReviews.length : null;
    $("studioTeacherName").textContent = auth.currentUser?.displayName?.trim().split(/\s+/)[0] || "teacher";
    const metrics = $("studioMetrics");
    metrics.replaceChildren();
    [
        ["Courses", ownedRows.filter(([, course]) => course.published && !course.archived).length, "Published listings", "book-2"],
        ["Learners", accepted.length, "Accepted enrollments", "users"],
        ["Requests", pending.length, "Waiting for your reply", "inbox"],
        ["Average rating", averageRating === null ? "—" : averageRating.toFixed(1), `${ownedReviews.length} learner review${ownedReviews.length === 1 ? "" : "s"}`, "star"]
    ].forEach(([label, value, note, glyph]) => {
        const metric = el("article", "studio-metric");
        metric.append(icon(glyph), el("p", "muted", label), el("strong", "", String(value)), el("span", "muted", note));
        metrics.append(metric);
    });
    const owned = $("ownCourses");
    owned.replaceChildren();
    ownedRows.forEach(([id, course]) => {
        const node = el("article", "studio-course");
        node.append(cover(course));
        const content = el("div", "studio-course-copy");
        content.append(
            el("span", `course-state${course.archived ? " is-archived" : course.published ? " is-published" : ""}`, course.archived ? "Archived" : course.published ? "Published" : "Draft"),
            el("h4", "", course.title),
            el("p", "muted", `${rupiah(course.price)} · ${course.type === "live" ? "Live classes" : TUTOR_TYPES[course.type]}`)
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
    if (!owned.children.length) {
        const empty = el("div", "studio-empty");
        empty.append(icon("book-upload"), el("h4", "", "Your first course starts here"), el("p", "muted", "Add a title, learning outcomes, curriculum, price and preview media to publish a course."));
        empty.append(action("Create a course", "primary", () => openEditor()));
        owned.append(empty);
    }
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
function showCourse(id) {
    detailProfileStop();
    detailProfile = {};
    detailId = id;
    renderDetail();
    openDialog("courseDialog");
    const course = courses[id];
    if (course) {
        detailProfileStop = watchTeachingProfile(course.teacherId, profile => {
            if (detailId !== id) return;
            detailProfile = profile;
            if ($("courseDialog").open) renderDetail();
        }, err => error(`Teacher profile could not load. ${err.message}`));
    }
}
function renderDetail() {
    const target = $("courseDetail"), course = courses[detailId];
    const oldForm = target.querySelector("form");
    const draft = oldForm ? new FormData(oldForm) : null;
    const focused = target.contains(document.activeElement) ? document.activeElement : null;
    const focusedName = focused?.name;
    const selectedTab = target.querySelector('[data-detail-tab][aria-selected="true"]')?.dataset.detailTab || "overview";
    const selectionStart = focused?.selectionStart, selectionEnd = focused?.selectionEnd;
    target.replaceChildren();
    if (!course) { target.append(el("p", "error", "This course is unavailable.")); return; }
    $("courseDialogHeading").textContent = course.title;
    const courseStats = stats()[detailId] || courseStatsFor(detailId);
    const detailLayout = el("div", "detail-layout");
    const detailMain = el("div", "detail-main");
    const purchase = el("aside", "purchase-panel");
    const intro = el("section", "detail-intro");
    const media = el("div", "detail-media");
    media.append(cover(course, true));
    const introCopy = el("div", "detail-intro-copy");
    introCopy.append(
        el("span", "course-kicker", `${TUTOR_CATEGORIES.find(([id]) => id === course.category)?.[1] || "English"} · ${TUTOR_TYPES[course.type]}`),
        el("h3", "detail-title", course.title)
    );
    const teacherLink = el("a", "detail-teacher-link", course.teacherName);
    teacherLink.href = `profile.html?uid=${encodeURIComponent(course.teacherId)}`;
    introCopy.append(teacherLink);
    const ratingText = courseStats.count
        ? `★ ${courseStats.rating.toFixed(1)} · ${courseStats.count} review${courseStats.count === 1 ? "" : "s"}`
        : "New course · No reviews yet";
    introCopy.append(el("p", "detail-rating", ratingText));
    const quickStats = el("div", "quick-stats");
    quickStats.append(
        el("span", "", TUTOR_TYPES[course.type]),
        el("span", "", `${course.curriculum.split(/\r?\n/).filter(Boolean).length} curriculum items`),
        el("span", "", course.teacherId === uid ? `${courseStats.students} accepted learners` : "Learner count not shared")
    );
    introCopy.append(quickStats);
    intro.append(media, introCopy);
    detailMain.append(intro);

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
        button.addEventListener("click", () => selectDetailTab(id));
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
    String(course.whatYouLearn || course.curriculum).split(/\r?\n/).map(line => line.trim()).filter(Boolean).forEach(line => {
        const item = el("li");
        item.append(icon("circle-check"), el("span", "", line));
        outcomes.append(item);
    });
    overview.append(outcomes, el("h3", "", "Schedule and access"), el("p", "detail-copy", course.schedule));
    panels.append(overview);

    const curriculumPanel = el("section", "detail-tab-panel");
    curriculumPanel.id = "course-panel-curriculum";
    curriculumPanel.setAttribute("role", "tabpanel");
    curriculumPanel.setAttribute("aria-labelledby", "course-tab-curriculum");
    curriculumPanel.dataset.detailPanel = "curriculum";
    curriculumPanel.append(el("h3", "", "Course curriculum"), el("p", "muted", `${course.curriculum.split(/\r?\n/).filter(Boolean).length} course items`));
    const curriculumList = el("ol", "curriculum-list");
    String(course.curriculum).split(/\r?\n/).map(line => line.trim()).filter(Boolean).forEach((line, index) => {
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
    if (requests[`${detailId}_${uid}`]?.status === "accepted") {
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
    const teacherImage = detailProfile.imageURL ? el("img", "teacher-profile-image") : el("span", "teacher-profile-image teacher-profile-initial", course.teacherName.trim().charAt(0).toUpperCase() || "T");
    if (detailProfile.imageURL) {
        teacherImage.src = detailProfile.imageURL;
        teacherImage.alt = `${course.teacherName} profile`;
    }
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
    if (course.originalPrice > course.price) purchase.append(el("p", "offer-note", `${Math.round((1 - course.price / course.originalPrice) * 100)}% off the original price`));
    const purchaseNotice = el("p", "purchase-note", course.archived ? "This listing is archived." : course.published ? "No payment is collected here." : "This listing is paused.");
    purchase.append(purchaseNotice);
    const add = action(library.cart?.[detailId] ? "In cart" : "Add to cart", "primary purchase-action", async () => {
        if (requireLogin()) await toggleLibrary("cart", detailId, true);
    });
    add.disabled = !course.published || course.archived || course.teacherId === uid || Boolean(requests[`${detailId}_${uid}`]);
    if (requests[`${detailId}_${uid}`]) add.textContent = "Already requested";
    purchase.append(add);
    const book = action("Book a class", "secondary purchase-action", async () => {
        if (!requireLogin()) return;
        await requestEnrollment({ ...course, id: detailId });
        $("marketStatus").textContent = "Your class request was sent. The teacher will confirm the schedule.";
        renderCatalog();
    });
    book.disabled = !course.published || course.archived || course.teacherId === uid || Boolean(requests[`${detailId}_${uid}`]);
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
            $("marketStatus").textContent = "Course link copied.";
        } else {
            const feedback = target.querySelector(".detail-feedback");
            feedback.textContent = url;
        }
    });
    share.append(icon("share-3"));
    purchase.append(share);
    const feedback = el("p", "detail-feedback");
    feedback.setAttribute("role", "status");
    purchase.append(feedback);
    detailLayout.append(detailMain, purchase);
    target.append(detailLayout);
    selectDetailTab(selectedTab);
    if (reviewFocus) {
        const field = target.querySelector(".review-form")?.elements.namedItem(reviewFocus.name);
        field?.focus();
        if (reviewFocus.start != null && reviewFocus.end != null) field?.setSelectionRange(reviewFocus.start, reviewFocus.end);
    }
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
    total.append(el("strong", "", statistics.count ? statistics.rating.toFixed(1) : "—"), el("span", "review-stars", statistics.count ? "★★★★★" : "No ratings yet"), el("span", "muted", `${statistics.count} verified learner review${statistics.count === 1 ? "" : "s"}`));
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
function selectDetailTab(id) {
    const target = $("courseDetail");
    target.querySelectorAll("[data-detail-tab]").forEach(button => button.setAttribute("aria-selected", String(button.dataset.detailTab === id)));
    target.querySelectorAll("[data-detail-panel]").forEach(panel => { panel.hidden = panel.dataset.detailPanel !== id; });
}
let editorPreviewURL = "";
function renderMediaPreview(file, course) {
    const target = $("mediaPreview");
    if (editorPreviewURL) URL.revokeObjectURL(editorPreviewURL);
    editorPreviewURL = "";
    target.replaceChildren();
    const savedURL = course?.previewURL || course?.coverURL || "";
    const url = file ? (editorPreviewURL = URL.createObjectURL(file)) : savedURL;
    const type = file ? (file.type.startsWith("video/") ? "video" : "image") : course?.previewType || (course?.coverURL ? "image" : "");
    target.hidden = !url;
    if (!url) return;
    const media = type === "video" ? el("video", "editor-preview-media") : el("img", "editor-preview-media");
    media.src = url;
    if (media instanceof HTMLVideoElement) {
        media.controls = true;
        media.muted = true;
        media.playsInline = true;
    } else {
        media.alt = "Course preview";
    }
    target.append(media, el("span", "muted", file ? file.name : "Current course preview"));
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
function openEditor(id = "") {
    if (role !== "teacher") return error("Register as a teacher to create courses.");
    editingId = id;
    const form = $("courseForm");
    form.reset();
    const course = courses[id];
    for (const key of ["title", "category", "type", "price", "originalPrice", "summary", "whatYouLearn", "curriculum", "schedule"]) {
        form.elements.namedItem(key).value = course?.[key] ?? (key === "category" ? "ielts" : key === "type" ? "live" : key === "whatYouLearn" ? course?.curriculum || "" : "");
    }
    form.elements.namedItem("teacherName").value = auth.currentUser.displayName?.trim() || course?.teacherName || "";
    form.elements.namedItem("published").checked = course ? course.published : true;
    renderMediaPreview(null, course);
    $("editorError").hidden = true;
    $("editorHeading").textContent = id ? "Edit course" : "Create course";
    $("saveCourseButton").textContent = id ? "Save changes" : "Publish course";
    openDialog("editorDialog");
}
$("courseForm").elements.namedItem("previewFile").addEventListener("change", () => {
    renderMediaPreview($("courseForm").elements.namedItem("previewFile").files?.[0] || null, courses[editingId]);
});
$("editorDialog").addEventListener("close", () => {
    if (editorPreviewURL) URL.revokeObjectURL(editorPreviewURL);
    editorPreviewURL = "";
});
$("courseForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = $("courseForm"), fields = [...form.elements];
    const data = Object.fromEntries(new FormData(form));
    data.price = Number(data.price); data.originalPrice = Number(data.originalPrice || 0); data.published = form.elements.namedItem("published").checked;
    const file = form.elements.namedItem("previewFile").files?.[0];
    const existing = courses[editingId];
    data.previewURL = existing?.previewURL || "";
    data.previewPath = existing?.previewPath || "";
    data.previewType = existing?.previewType || "";
    const current = version;
    fields.forEach(field => field.disabled = true);
    $("editorError").hidden = true;
    let uploadedRef = null;
    try {
        validateCourse(data);
        if (file) {
            await validatePreviewFile(file);
            const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm" }[file.type];
            const previewPath = `tutor-courses/${auth.currentUser.uid}/${crypto.randomUUID()}/preview.${extension}`;
            uploadedRef = storageRef(storage, previewPath);
            await uploadBytes(uploadedRef, file, { contentType: file.type });
            data.previewURL = await getDownloadURL(uploadedRef);
            data.previewPath = previewPath;
            data.previewType = file.type.startsWith("video/") ? "video" : "image";
        }
        validateCourse(data);
        await saveCourse(data, editingId);
        if (current !== version) return;
        $("editorDialog").close();
        let cleanupWarning = "";
        if (file && existing?.previewPath && existing.previewPath !== data.previewPath) {
            try { await deleteObject(storageRef(storage, existing.previewPath)); }
            catch (cleanupError) {
                console.error("[TutorCheck] Previous course media could not be removed:", cleanupError);
                cleanupWarning = " The previous preview could not be removed from storage.";
            }
        }
        $("marketStatus").textContent = `Course saved. Published courses appear immediately.${cleanupWarning}`;
    } catch (err) {
        if (uploadedRef) {
            try { await deleteObject(uploadedRef); }
            catch (cleanupError) { console.error("[TutorCheck] Unused course preview could not be removed:", cleanupError); }
        }
        if (current === version) error(err, $("editorError"));
    }
    finally { fields.forEach(field => field.disabled = false); }
});
$("checkoutButton").addEventListener("click", async () => {
    if (!requireLogin() || checkoutBusy) return;
    checkoutBusy = true; renderCart();
    $("cartError").hidden = true;
    const current = version, ids = Object.keys(library.cart || {});
    const failures = [];
    let sent = 0;
    for (const id of ids) {
        if (current !== version) break;
        const course = courses[id];
        if (!course?.published || course.archived || course.teacherId === uid) { failures.push("An unavailable course was left in your cart."); continue; }
        try {
            if (!requests[`${id}_${uid}`]) { await requestEnrollment({ ...course, id }); sent++; }
            await toggleLibrary("cart", id, false);
        } catch (err) { failures.push(`${course.title}: ${err.message}`); }
    }
    checkoutBusy = false;
    if (current !== version) return;
    $("marketStatus").textContent = `${sent} enrollment request${sent === 1 ? "" : "s"} sent. No payment was collected.`;
    if (failures.length) error(failures.join("\n"), $("cartError"));
    renderCart();
});
TUTOR_CATEGORIES.forEach(([id, label, glyph]) => {
    const button = action("", "", () => { category = category === id ? "" : id; favoritesOnly = false; $("favoritesButton").setAttribute("aria-pressed", "false"); renderCatalog(); });
    button.dataset.category = id; button.setAttribute("aria-pressed", "false");
    button.append(icon(glyph), el("span", "", label));
    $("categoryChoices").append(button);
    const option = el("option", "", label); option.value = id; $("editorCategory").append(option);
});
Object.entries(TUTOR_TYPES).forEach(([id, label]) => {
    const option = el("option", "", label); option.value = id; $("editorType").append(option);
});
$("searchForm").addEventListener("submit", event => { event.preventDefault(); renderCatalog(); $("catalog").scrollIntoView({ block: "start" }); });
$("courseSearch").addEventListener("input", renderCatalog);
$("courseSort").addEventListener("change", renderCatalog);
$("teacherFilter").addEventListener("change", () => { selectedTeacher = $("teacherFilter").value; renderCatalog(); });
document.querySelectorAll(".filter-panel input").forEach(input => input.addEventListener("change", () => {
    if (input.name === "courseType") type = input.value;
    renderCatalog();
}));
const compactFilters = matchMedia("(max-width:1023px)");
function syncFilterLayout() { $("courseFilters").open = !compactFilters.matches; }
syncFilterLayout();
compactFilters.addEventListener("change", syncFilterLayout);
function resetFilters() {
    const recoverFocus = document.activeElement?.closest(".empty-state");
    category = ""; type = ""; selectedTeacher = ""; favoritesOnly = false;
    $("courseSearch").value = ""; $("courseSort").value = "newest";
    $("teacherFilter").value = "";
    document.querySelectorAll('[name="price"]').forEach(input => input.checked = false);
    document.querySelector('[name="courseType"][value=""]').checked = true;
    document.querySelector('[name="rating"][value=""]').checked = true;
    $("favoritesButton").setAttribute("aria-pressed", "false");
    renderCatalog();
    if (recoverFocus) $("courseSearch").focus();
}
$("resetFilters").addEventListener("click", resetFilters);
$("allCategories").addEventListener("click", () => { category = ""; renderCatalog(); });
$("favoritesButton").addEventListener("click", () => {
    if (!requireLogin()) return;
    favoritesOnly = !favoritesOnly; $("favoritesButton").setAttribute("aria-pressed", String(favoritesOnly)); renderCatalog();
});
$("cartButton").addEventListener("click", () => { if (requireLogin()) { $("cartError").hidden = true; renderCart(); openDialog("cartDialog"); } });
$("requestsButton").addEventListener("click", () => { if (requireLogin()) { renderRequests(); openDialog("requestsDialog"); } });
$("manageButton").addEventListener("click", () => { $("teacherStudio").hidden = !$("teacherStudio").hidden; if (!$("teacherStudio").hidden) $("teacherStudio").scrollIntoView({ block: "start" }); });
$("newCourse").addEventListener("click", () => openEditor());
const catalogStop = watchCatalog(data => {
    courses = data; catalogReady = true; renderCatalog();
    if ($("courseDialog").open) renderDetail();
    if ($("marketStatus").textContent === "Course connection failed.") {
        $("marketError").hidden = true;
    }
    $("marketStatus").textContent = "Live course listings. Prices are in Indonesian rupiah.";
}, err => {
    $("courseGrid").setAttribute("aria-busy", "false");
    $("courseGrid").replaceChildren(el("p", "error", "Course listings could not load. Refresh to retry."));
    $("marketStatus").textContent = "Course connection failed.";
    error(`Courses could not sync. Refresh to retry. ${err.message}`);
});
const reviewsStop = watchReviews(data => {
    reviews = data; reviewsReady = true; renderCatalog();
    if ($("courseDialog").open) renderDetail();
    if ($("marketStatus").textContent === "Review connection failed.") {
        $("marketError").hidden = true;
    }
}, err => {
    $("courseGrid").setAttribute("aria-busy", "false");
    $("courseGrid").replaceChildren(el("p", "error", "Course ratings could not load. Refresh to retry."));
    $("marketStatus").textContent = "Review connection failed.";
    error(`Reviews could not sync. Refresh to retry. ${err.message}`);
});
const authStop = onAuthStateChanged(auth, user => {
    accountStop(); version++;
    uid = user?.uid || ""; role = "student"; library = {}; requests = {}; inbox = {}; favoritesOnly = false;
    document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
    $("teacherStudio").hidden = true; $("favoritesButton").setAttribute("aria-pressed", "false");
    renderCatalog();
    if (!uid) return;
    const current = version;
    const guarded = callback => data => { if (current === version) { callback(data); renderCatalog(); } };
    accountStop = watchAccount(uid, {
        role: guarded(data => role = data),
        library: guarded(data => { library = data; if ($("courseDialog").open) renderDetail(); }),
        requests: guarded(data => { requests = data; if ($("courseDialog").open) renderDetail(); }),
        inbox: guarded(data => { inbox = data; if ($("courseDialog").open) renderDetail(); })
    }, err => { if (current === version) error(`Your marketplace account could not sync. Refresh to retry. ${err.message}`); });
});
window.addEventListener("pagehide", () => { accountStop(); catalogStop(); reviewsStop(); authStop(); compactFilters.removeEventListener("change", syncFilterLayout); }, { once: true });
