import { auth } from "./js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { TUTOR_CATEGORIES, TUTOR_TYPES, selectCourses, courseStats, teachingSummary, rupiah, validateCourse } from "./js/tutor-model.js?v=20261101-crud";
import { watchCatalog, watchReviews, watchTeachingProfile, watchTeacherIdentity, watchCourseStudents, watchAccount, saveCourse, setCourseState, toggleLibrary, requestEnrollment, changeRequest, submitReview } from "./js/tutor-service.js?v=20261102-market-cards";

const $ = id => document.getElementById(id);
$("editorFieldBank").append($("courseEditorFields").content.cloneNode(true));
let courses = {}, reviews = {}, library = {}, requests = {}, inbox = {};
let uid = "", role = "student", roleReady = false, authReady = false, version = 0, accountStop = () => {};
let category = "", favoritesOnly = false, editingId = "", detailId = "";
let selectedTeacher = new URLSearchParams(location.search).get("teacher") || "";
let detailProfile = {}, detailProfileStop = () => {};
let catalogReady = false, reviewsReady = false, checkoutBusy = false;
const teacherIdentities = {}, publicStudents = {};
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
        if (!(id in courses)) { stop(); courseStudentStops.delete(id); delete publicStudents[id]; }
    }
    for (const id of Object.keys(courses)) {
        if (courseStudentStops.has(id)) continue;
        courseStudentStops.set(id, watchCourseStudents(id, count => {
            publicStudents[id] = Number.isSafeInteger(count) && count >= 0 ? count : null;
            renderCatalog();
            if (!$("coursePage").hidden) renderDetail();
        }, failure => {
            publicStudents[id] = null;
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
let archiveId = "";
let editorDirty = false, editorBusy = false, editorReturnCourse = "";
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
$("teacherEnrollmentFilter").addEventListener("change", renderStudio);
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
function error(message, target = ($("courseEditor")?.hidden === false && $("editorError")) || (!$("coursePage").hidden && $("detailError")) || $("marketError")) {
    console.error("[TutorCheck]", message);
    const text = message instanceof Error ? message.message : String(message);
    if (target.textContent !== text) target.textContent = text;
    target.hidden = false;
}
function action(text, className, callback) {
    const node = el("button", className, text);
    node.type = "button";
    node.addEventListener("click", async () => {
        const hadFocus = document.activeElement === node;
        const courseId = node.closest(".course-card")?.dataset.courseId;
        const focusKey = node.dataset.focusKey;
        node.disabled = true;
        const current = version;
        try { await callback(); }
        catch (failure) { if (current === version) error(failure); }
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
    if (course.originalPrice > course.price) artwork.append(el("span", "course-badge", "Course offer"));
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
    artwork.append(favoriteButton("save-button course-save"));
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
    teacherLine.append(avatar, teacher);
    const ratingLine = el("div", "course-rating-line");
    ratingLine.append(
        el("p", "rating", statistics.count ? `★ ${statistics.rating.toFixed(1)}` : "New course"),
        el("span", "review-count", `(${statistics.count} review${statistics.count === 1 ? "" : "s"})`)
    );
    const count = publicStudents[course.id];
    const countText = Number.isSafeInteger(count)
        ? `${count} student${count === 1 ? "" : "s"}`
        : course.teacherId === uid ? `${statistics.students} student${statistics.students === 1 ? "" : "s"}` : "Student count unavailable";
    const learners = el("span", "learner-count", countText);
    learners.title = "Number of accepted enrollments; student records remain private.";
    ratingLine.append(learners);
    content.append(teacherLine, ratingLine, heading);
    content.append(price(course));
    const bottom = el("div", "card-bottom");
    const inCart = Boolean(library.cart?.[course.id]);
    const cart = action(inCart ? "In cart" : "Add to cart", "primary", async () => {
        if (!requireLogin()) return;
        await toggleLibrary("cart", course.id, !inCart);
        $("marketActionStatus").textContent = `${course.title} ${inCart ? "removed from" : "added to"} your cart.`;
    });
    cart.dataset.focusKey = "cart";
    cart.setAttribute("aria-label", `${inCart ? "Remove from cart:" : "Add to cart:"} ${course.title}`);
    cart.disabled = uid === course.teacherId || Boolean(requests[`${course.id}_${uid}`]);
    if (uid === course.teacherId) cart.textContent = "Your course";
    else if (cart.disabled) cart.textContent = "Requested";
    if (cart.disabled) cart.setAttribute("aria-label", `${cart.textContent}: ${course.title}`);
    cart.prepend(icon("shopping-cart"));
    bottom.append(cart, favoriteButton("save-button card-favorite"));
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
    if ($("courseSearch").value.trim()) add(`Search: ${$("courseSearch").value.trim()}`, () => { $("courseSearch").value = ""; $("topCourseSearch").value = ""; });
    document.querySelectorAll('[name="price"]:checked').forEach(input => add(input.parentElement.innerText.trim().replace(/\s+/g, " "), () => input.checked = false));
    const rating = document.querySelector('[name="rating"]:checked');
    if (rating?.value) add(`${rating.value} stars${rating.value === "5" ? "" : " & up"}`, () => document.querySelector('[name="rating"][value=""]').checked = true);
    if (favoritesOnly) add("Saved courses", () => { favoritesOnly = false; $("favoritesButton").setAttribute("aria-pressed", "false"); });
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
    $("teacherSignup").hidden = role === "teacher";
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
    if (!catalogReady || !reviewsReady) return;
    const statistics = stats();
    const filters = { teacher: selectedTeacher, category, search: $("courseSearch").value, sort: $("courseSort").value,
        rating: document.querySelector('[name="rating"]:checked')?.value || "",
        prices: [...document.querySelectorAll('[name="price"]:checked')].map(input => input.value) };
    const displayCourses = Object.fromEntries(Object.entries(courses).map(([id, course]) => [id, { ...course, teacherName: courseTeacher(course) }]));
    let rows = selectCourses(displayCourses, filters, statistics);
    if (favoritesOnly) rows = rows.filter(course => library.favorites?.[course.id]);
    const grid = $("courseGrid");
    const focusedCard = document.activeElement?.closest(".course-card");
    const focusedCourse = focusedCard?.dataset.courseId;
    const focusKey = document.activeElement?.dataset.focusKey;
    grid.replaceChildren();
    grid.setAttribute("aria-busy", "false");
    const resultText = `${rows.length} ${favoritesOnly ? "saved " : ""}course${rows.length === 1 ? "" : "s"}${$("filterCount").hidden ? " available" : " match your filters"}`;
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
    renderRequests();
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
    if (initialClasses && uid && roleReady) {
        initialClasses = false;
        showClasses();
    }
}
function syncMarketplaceNavigation() {
    const teacher = role === "teacher";
    const browsing = !$("browseLayout").hidden && $("courseEditor").hidden;
    document.body.classList.toggle("marketplace-browsing", browsing);
    $("qcnavMarketplaceStudentSidebar").hidden = browsing || teacher;
    $("qcnavMarketplaceTeacherSidebar").hidden = browsing || !teacher;
    filterSidebar.hidden = !browsing;
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
    currentLink(document.querySelector('.qcnav-links a[href="tutor-check.html"]'), !studio && !classes);
    currentLink(document.querySelector('.qcnav-links a[href="tutor-check.html?classes=1"]'), classes);
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
    if (!$("courseEditor").hidden) return requestEditorExit(() => showCourse(id));
    detailProfileStop();
    detailProfile = {};
    detailId = id;
    const url = new URL(location.href);
    if (url.searchParams.get("course") !== id || url.searchParams.has("studio") || url.searchParams.has("classes")) {
        url.searchParams.set("course", id);
        url.searchParams.delete("studio");
        url.searchParams.delete("classes");
        history.pushState({ marketplaceCourse: id }, "", url);
    }
    $("browseLayout").hidden = true;
    $("coursePage").hidden = false;
    $("teacherStudio").hidden = true;
    syncMarketplaceNavigation();
    renderDetail();
    $("coursePage").scrollIntoView({ block: "start" });
    const course = courses[id];
    if (course) {
        detailProfileStop = watchTeachingProfile(course.teacherId, profile => {
            if (detailId !== id) return;
            detailProfile = profile;
            if (!$("coursePage").hidden) renderDetail();
        }, err => error(`Teacher profile could not load. ${err.message}`));
    }
}
function showCatalog() {
    if (!$("courseEditor").hidden) return requestEditorExit(showCatalog);
    detailProfileStop();
    detailProfileStop = () => {};
    detailId = "";
    $("teacherStudio").hidden = true;
    $("coursePage").hidden = true;
    $("browseLayout").hidden = false;
    syncMarketplaceNavigation();
    $("browseLayout").scrollIntoView({ block: "start" });
}
function setStudioView(show, updateHistory = true) {
    if (!$("courseEditor").hidden) return requestEditorExit(() => setStudioView(show, updateHistory));
    if (show && role !== "teacher") return;
    if (updateHistory) {
        const url = new URL(location.href);
        url.searchParams.delete("course");
        url.searchParams.delete("classes");
        if (show) url.searchParams.set("studio", "1");
        else url.searchParams.delete("studio");
        history.pushState({ marketplaceStudio: show }, "", url);
    }
    detailProfileStop();
    detailProfileStop = () => {};
    detailId = "";
    $("coursePage").hidden = true;
    $("browseLayout").hidden = show;
    $("teacherStudio").hidden = !show;
    syncMarketplaceNavigation();
    $(show ? "teacherStudio" : "browseLayout").scrollIntoView({ block: "start" });
}
function showClasses() {
    if (!requireLogin()) return;
    if (role === "teacher") {
        setStudioView(true, false);
        $("teacherInbox").scrollIntoView({ block: "start" });
    } else {
        showCatalog();
        renderRequests();
        openDialog("requestsDialog");
    }
}
function renderDetail(target = $("courseDetail"), editorCourse = null) {
    const savedCourse = editorCourse || courses[detailId];
    const course = savedCourse ? { ...savedCourse, teacherName: courseTeacher(savedCourse) } : null;
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
    introTeacherCopy.append(teacherLink, el("p", "muted", detailProfile.qualification || "Independent English teacher"));
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
    const quickStats = el("div", "quick-stats");
    [
        ["presentation", TUTOR_TYPES[course.type], "Course format"],
        ["stack-2", String(curriculumLines.length), "Curriculum items"],
        ["target-arrow", String(outcomeLines.length), "Learning outcomes"]
    ].forEach(([glyph, value, label]) => {
        const metric = el("div", "quick-stat");
        metric.append(icon(glyph), el("strong", "", value), el("span", "", label));
        quickStats.append(metric);
    });
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
    if (!editorCourse && course.teacherId === uid && role === "teacher" && !course.archived) {
        purchase.append(action("Edit this course", "primary purchase-action", () => openEditor(detailId)));
    }
    if (course.originalPrice > course.price) {
        const offer = el("div", "offer-note");
        offer.append(icon("tag"), el("span", "", "Course offer · Save " + rupiah(course.originalPrice - course.price)));
        purchase.append(offer);
    }
    const purchaseNotice = el("p", "purchase-note", course.archived ? "This listing is archived." : course.published ? "No payment is collected here." : "This listing is paused.");
    const add = action(library.cart?.[detailId] ? "In cart" : "Add to cart", "primary purchase-action", async () => {
        if (requireLogin()) await toggleLibrary("cart", detailId, true);
    });
    add.prepend(icon("shopping-cart"));
    add.disabled = !course.published || course.archived || course.teacherId === uid || Boolean(requests[`${detailId}_${uid}`]);
    if (requests[`${detailId}_${uid}`]) add.textContent = "Already requested";
    purchase.append(add);
    const book = action("Book a class", "secondary purchase-action", async () => {
        if (!requireLogin()) return;
        await requestEnrollment({ ...course, id: detailId });
        $("marketStatus").textContent = "Your class request was sent. The teacher will confirm the schedule.";
        target.querySelector(".detail-feedback").textContent = "Request sent. The teacher will confirm the schedule.";
        renderCatalog();
    });
    book.prepend(icon("calendar-event"));
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
    if (id && (!courses[id] || courses[id].teacherId !== uid || courses[id].archived)) {
        return error("You can only edit your own active courses. Restore archived courses first.");
    }
    if (!$("courseEditor").hidden) return requestEditorExit(() => openEditor(id));
    const url = new URL(location.href);
    url.searchParams.delete("create");
    history.replaceState(history.state, "", url);
    editorReturnCourse = !$("coursePage").hidden ? detailId : "";
    detailProfileStop();
    detailProfileStop = () => {};
    editorProfileStop();
    detailProfile = {};
    editingId = id;
    const form = $("courseForm");
    $("editorFieldBank").append(...editorLabels);
    form.reset();
    const course = courses[id];
    for (const key of ["title", "category", "type", "price", "originalPrice", "summary", "whatYouLearn", "curriculum", "schedule"]) {
        form.elements.namedItem(key).value = course?.[key] ?? (key === "category" ? "ielts" : key === "type" ? "live" : key === "whatYouLearn" ? course?.curriculum || "" : "");
    }
    form.elements.namedItem("teacherName").value = auth.currentUser.displayName?.trim() || course?.teacherName || "";
    form.elements.namedItem("published").checked = course ? course.published : true;
    removedPreview = false;
    editorDirty = false;
    $("browseLayout").hidden = true;
    $("teacherStudio").hidden = true;
    $("coursePage").hidden = true;
    $("courseDetail").replaceChildren();
    $("courseEditor").hidden = false;
    detailId = id;
    const draft = Object.fromEntries(new FormData(form));
    draft.teacherId = uid;
    draft.teacherName = form.elements.namedItem("teacherName").value || "Your teacher profile";
    draft.title ||= "Your course title";
    draft.price = Number(draft.price);
    draft.originalPrice = Number(draft.originalPrice);
    draft.published = form.elements.namedItem("published").checked;
    renderDetail($("editorCanvas"), { ...course, ...draft });
    arrangeCourseEditor();
    renderMediaPreview(null, course);
    $("editorError").hidden = true;
    $("editorHeading").textContent = id ? "Edit course" : "Create course";
    $("archiveEditorCourse").hidden = !id;
    updateEditorSummary();
    syncMarketplaceNavigation();
    $("editorHeading").focus();
    $("courseEditor").scrollIntoView({ block: "start" });
    const current = version;
    editorProfileStop = watchTeachingProfile(uid, profile => {
        if (current !== version || $("courseEditor").hidden || editingId !== id) return;
        const canvas = $("editorCanvas");
        canvas.querySelectorAll(".detail-intro-teacher .muted, .detail-side-teacher .muted, .teacher-detail-panel > div > .muted:not(.editor-teacher-experience)").forEach(node => {
            node.textContent = profile.qualification || "Independent English teacher";
        });
        canvas.querySelectorAll(".detail-side-about, .teacher-detail-panel .detail-copy").forEach(node => {
            node.textContent = profile.about || "Add an introduction in your teacher profile.";
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
function arrangeCourseEditor() {
    const canvas = $("editorCanvas"), form = $("courseForm");
    const moveField = (name, target) => {
        const field = form.elements.namedItem(name);
        const label = field.closest("label");
        label.classList.add("inline-course-field");
        target.replaceWith(label);
    };
    moveField("title", canvas.querySelector(".detail-title"));
    const metadata = el("div", "editor-metadata");
    canvas.querySelector(".course-kicker").replaceWith(metadata);
    for (const name of ["category", "type"]) {
        const label = form.elements.namedItem(name).closest("label");
        label.classList.add("inline-course-field");
        metadata.append(label);
    }
    const overview = canvas.querySelector('[data-detail-panel="overview"]');
    const copy = overview.querySelectorAll(".detail-copy");
    moveField("summary", copy[0]);
    moveField("schedule", copy[1]);
    createEditorList("whatYouLearn", overview.querySelector(".learning-outcomes"), "outcome");
    createEditorList("curriculum", canvas.querySelector('[data-detail-panel="curriculum"] .curriculum-list'), "lesson");
    const emptyOutcomes = overview.querySelector(".editor-list").previousElementSibling;
    if (emptyOutcomes?.matches(".muted")) emptyOutcomes.remove();
    const curriculumShortcut = action("Edit curriculum", "text-link", () => selectDetailTab("curriculum", true, canvas));
    overview.querySelector(".curriculum-preview").append(curriculumShortcut);
    const purchase = canvas.querySelector(".purchase-panel");
    purchase.replaceChildren();
    for (const name of ["price", "originalPrice", "published"]) {
        const label = form.elements.namedItem(name).closest("label");
        label.classList.add("inline-course-field");
        purchase.append(label);
    }
    const pricePreview = el("p", "course-price");
    pricePreview.id = "editorPricePreview";
    purchase.append(pricePreview, el("p", "muted", "Course information is public, including paused listings. No payment is collected here."));
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
    const teacherPanel = canvas.querySelector('[data-detail-panel="teacher"]');
    const experience = el("p", "muted editor-teacher-experience");
    experience.hidden = true;
    teacherPanel.querySelector(".detail-copy").before(experience);
    const profile = el("a", "text-link", "Edit teacher profile");
    profile.href = "profile.html";
    teacherPanel.append(profile, el("p", "muted", "Teacher information is shared across your courses. Reviews are written by learners and cannot be edited here."));
    const reviewForm = canvas.querySelector(".review-form");
    if (reviewForm) reviewForm.remove();
}
function createEditorList(name, target, noun) {
    const field = $("courseForm").elements.namedItem(name);
    field.required = false;
    const list = el("ol", `curriculum-list editor-item-list editor-${name}`);
    const section = el("div", "editor-list");
    const sync = () => {
        field.value = [...list.querySelectorAll("input")].map(input => input.value.trim()).filter(Boolean).join("\n");
        editorDirty = true;
        updateEditorSummary();
    };
    const renumber = () => {
        [...list.children].forEach((item, index) => {
            item.querySelector("input").setAttribute("aria-label", `${noun} ${index + 1}`);
            item.querySelector(".editor-item-number").textContent = String(index + 1).padStart(2, "0");
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
        input.addEventListener("input", sync);
        const controls = el("div", "row-actions");
        for (const [direction, glyph] of [["up", "arrow-up"], ["down", "arrow-down"], ["remove", "trash"]]) {
            const button = el("button", "text-button");
            button.type = "button";
            button.addEventListener("click", () => {
                if (direction === "remove") {
                    const next = item.nextElementSibling || item.previousElementSibling;
                    item.remove();
                    (next?.querySelector("input") || add).focus();
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
        item.append(el("span", "editor-item-number"), input, controls);
        list.append(item);
        renumber();
        if (focus) input.focus();
    };
    const add = action(`Add ${noun}`, "text-button", () => { addRow("", true); sync(); });
    field.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).forEach(value => addRow(value));
    section.append(list, add);
    target.replaceWith(section);
}
function updateEditorSummary() {
    const form = $("courseForm"), canvas = $("editorCanvas");
    const count = name => form.elements.namedItem(name).value.split(/\r?\n/).filter(line => line.trim()).length;
    const metrics = canvas.querySelectorAll(".quick-stat strong");
    if (metrics.length) {
        metrics[0].textContent = TUTOR_TYPES[form.elements.namedItem("type").value];
        metrics[1].textContent = String(count("curriculum"));
        metrics[2].textContent = String(count("whatYouLearn"));
    }
    const price = form.elements.namedItem("price").valueAsNumber;
    const original = form.elements.namedItem("originalPrice").valueAsNumber;
    $("editorPricePreview").textContent = rupiah(Number.isFinite(price) ? price : 0);
    if (Number.isFinite(original) && original > price) $("editorPricePreview").append(el("del", "", rupiah(original)));
    $("editorStatus").textContent = editorDirty ? "Unsaved changes" : "Edit any field below. Nothing changes for learners until you save.";
    $("saveCourseButton").textContent = form.elements.namedItem("published").checked ? editingId ? "Save changes" : "Publish course" : "Save paused course";
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
    $("removeCoursePreview").hidden = !form.elements.namedItem("previewFile").files?.length && (removedPreview || !(courses[editingId]?.previewURL || courses[editingId]?.coverURL));
}
function closeEditor() {
    editorProfileStop();
    editorProfileStop = () => {};
    if (editorPreviewURL) URL.revokeObjectURL(editorPreviewURL);
    editorPreviewURL = "";
    editorDirty = false;
    $("courseEditor").hidden = true;
    $("editorFieldBank").append(...editorLabels);
    $("editorCanvas").replaceChildren();
    $("courseForm").reset();
    editingId = "";
}
function requestEditorExit(callback) {
    if (editorBusy) return;
    if (!editorDirty) { closeEditor(); callback(); return; }
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
    requestEditorExit(() => courseId ? showCourse(courseId) : setStudioView(true));
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
    if (!$("courseForm").elements.namedItem("previewFile").files?.length && (removedPreview || !(courses[editingId]?.previewURL || courses[editingId]?.coverURL))) renderMediaPreview(null, null);
});
$("courseForm").addEventListener("invalid", event => {
    const panel = event.target.closest("[data-detail-panel]");
    if (panel) selectDetailTab(panel.dataset.detailPanel, false, $("editorCanvas"));
}, true);
$("courseForm").elements.namedItem("previewFile").addEventListener("change", () => {
    removedPreview = false;
    renderMediaPreview($("courseForm").elements.namedItem("previewFile").files?.[0] || null, courses[editingId]);
    editorDirty = true;
    updateEditorSummary();
});
window.addEventListener("beforeunload", event => {
    if (!editorDirty && !editorBusy) return;
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
    const form = $("courseForm"), fields = [...form.elements];
    const disabledStates = fields.map(field => field.disabled);
    const data = Object.fromEntries(new FormData(form));
    data.price = Number(data.price); data.originalPrice = Number(data.originalPrice || 0); data.published = form.elements.namedItem("published").checked;
    const file = form.elements.namedItem("previewFile").files?.[0];
    const existing = courses[editingId];
    data.coverURL = removedPreview ? "" : existing?.coverURL || "";
    data.previewURL = removedPreview ? "" : existing?.previewURL || "";
    data.previewPath = removedPreview ? "" : existing?.previewPath || "";
    data.previewType = removedPreview ? "" : existing?.previewType || "";
    const current = version;
    const id = editingId;
    editorBusy = true;
    fields.forEach(field => field.disabled = true);
    $("editorError").hidden = true;
    let uploadedRef = null;
    try {
        validateCourse(data);
        if (file) {
            await validatePreviewFile(file);
            if (current !== version) throw new Error("Your account changed. Reopen the course editor to continue.");
            const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm" }[file.type];
            const previewPath = `tutor-courses/${auth.currentUser.uid}/${crypto.randomUUID()}/preview.${extension}`;
            uploadedRef = storageRef(storage, previewPath);
            await uploadBytes(uploadedRef, file, { contentType: file.type });
            data.previewURL = await getDownloadURL(uploadedRef);
            data.previewPath = previewPath;
            data.previewType = file.type.startsWith("video/") ? "video" : "image";
        }
        validateCourse(data);
        if (current !== version) throw new Error("Your account changed. Reopen the course editor to continue.");
        const savedId = await saveCourse(data, id);
        uploadedRef = null;
        if (current !== version) return;
        courses[savedId] = { ...existing, ...validateCourse(data), teacherId: uid, createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now() };
        closeEditor();
        showCourse(savedId);
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
$("searchForm").addEventListener("submit", event => { event.preventDefault(); $("topCourseSearch").value = $("courseSearch").value; renderCatalog(); $("catalog").scrollIntoView({ block: "start" }); });
$("topSearchForm").addEventListener("submit", event => {
    event.preventDefault();
    $("courseSearch").value = $("topCourseSearch").value;
    renderCatalog();
    $("catalog").scrollIntoView({ block: "start" });
});
$("courseSearch").addEventListener("input", () => { $("topCourseSearch").value = $("courseSearch").value; renderCatalog(); });
$("topCourseSearch").addEventListener("input", () => { $("courseSearch").value = $("topCourseSearch").value; renderCatalog(); });
$("courseSort").addEventListener("change", renderCatalog);
$("teacherFilter").addEventListener("change", () => { selectedTeacher = $("teacherFilter").value; renderCatalog(); });
document.querySelectorAll(".filter-panel input").forEach(input => input.addEventListener("change", () => {
    renderCatalog();
}));
const compactFilters = matchMedia("(max-width:780px)");
function syncFilterLayout() {
    if (compactFilters.matches) document.querySelector(".browse-content").insertBefore(filterPanel, $("marketStatus"));
    else filterSidebar.append(filterPanel);
}
syncFilterLayout();
compactFilters.addEventListener("change", syncFilterLayout);
function resetFilters() {
    const recoverFocus = document.activeElement?.closest(".empty-state");
    const resetFocused = document.activeElement === $("resetFilters");
    category = ""; selectedTeacher = ""; favoritesOnly = false;
    $("courseSearch").value = ""; $("topCourseSearch").value = ""; $("courseSort").value = "newest";
    $("teacherFilter").value = "";
    document.querySelectorAll('[name="price"]').forEach(input => input.checked = false);
    document.querySelector('[name="rating"][value=""]').checked = true;
    $("favoritesButton").setAttribute("aria-pressed", "false");
    renderCatalog();
    if (recoverFocus) $("courseSearch").focus();
    else if (resetFocused) $("filterHeading").focus({ preventScroll: true });
}
$("resetFilters").addEventListener("click", resetFilters);
$("allCategories").addEventListener("click", () => { category = ""; renderCatalog(); });
$("favoritesButton").addEventListener("click", () => {
    if (!requireLogin()) return;
    favoritesOnly = !favoritesOnly; $("favoritesButton").setAttribute("aria-pressed", String(favoritesOnly)); renderCatalog();
});
$("cartButton").addEventListener("click", () => { if (requireLogin()) { $("cartError").hidden = true; renderCart(); openDialog("cartDialog"); } });
$("requestsButton").addEventListener("click", () => { if (requireLogin()) { renderRequests(); openDialog("requestsDialog"); } });
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
    if (courseId) showCourse(courseId);
    else if (params.get("studio") === "1" && role === "teacher") setStudioView(true, false);
    else if (params.get("classes") === "1") showClasses();
    else showCatalog();
});
const catalogStop = watchCatalog(data => {
    courses = data; catalogReady = true; syncPublicCourseData(); renderCatalog();
    if (!$("coursePage").hidden) renderDetail();
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
    if (!$("coursePage").hidden) renderDetail();
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
    authReady = true;
    uid = user?.uid || ""; role = "student"; roleReady = false; library = {}; requests = {}; inbox = {}; favoritesOnly = false;
    document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
    if (!$("courseEditor").hidden) { closeEditor(); $("browseLayout").hidden = false; }
    $("teacherStudio").hidden = true; $("favoritesButton").setAttribute("aria-pressed", "false");
    renderCatalog();
    if (!uid) {
        if (initialClasses) { initialClasses = false; error("Sign in to see your classes."); }
        return;
    }
    const current = version;
    const guarded = callback => data => { if (current === version) { callback(data); renderCatalog(); } };
    accountStop = watchAccount(uid, {
        role: guarded(data => {
            role = data; roleReady = true;
            if (role !== "teacher" && !$("courseEditor").hidden) {
                closeEditor(); showCatalog(); error("Teacher access is required to edit courses.");
            }
        }),
        library: guarded(data => { library = data; if (!$("coursePage").hidden) renderDetail(); }),
        requests: guarded(data => { requests = data; if (!$("coursePage").hidden) renderDetail(); }),
        inbox: guarded(data => { inbox = data; if (!$("coursePage").hidden) renderDetail(); })
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
