import { auth } from "./js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { TUTOR_CATEGORIES, TUTOR_TYPES, selectCourses, courseStats, rupiah } from "./js/tutor-model.js?v=20261101-teacher";
import { watchCatalog, watchReviews, watchAccount, saveCourse, toggleLibrary, requestEnrollment, changeRequest, submitReview } from "./js/tutor-service.js?v=20261101-teacher";

const $ = id => document.getElementById(id);
let courses = {}, reviews = {}, library = {}, requests = {}, inbox = {};
let uid = "", role = "student", version = 0, accountStop = () => {};
let category = "", type = "", favoritesOnly = false, editingId = "", detailId = "";
let catalogReady = false, reviewsReady = false, checkoutBusy = false;
const pageParams = new URLSearchParams(location.search);
const teacherFilter = pageParams.get("teacher") || "";
let initialCourse = pageParams.get("course") || "";
let initialStudio = pageParams.get("studio") === "1";
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
function stats() { return Object.fromEntries(Object.keys(courses).map(id => [id, courseStats(reviews[id])])); }
function cover(course, detail = false) {
    if (!course.coverURL) {
        const node = el("div", "course-cover");
        node.append(icon(TUTOR_CATEGORIES.find(([id]) => id === course.category)?.[2] || "book"));
        return node;
    }
    const node = el("img", `course-cover${detail ? " detail-cover" : ""}`);
    node.src = course.coverURL;
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
function showCourse(id) {
    detailId = id;
    renderDetail();
    openDialog("courseDialog");
}
function card(course, statistics) {
    const node = el("article", "course-card panel");
    node.append(cover(course));
    const content = el("div", "course-content");
    const teacher = el("a", "teacher-name", course.teacherName);
    teacher.href = `profile.html?uid=${encodeURIComponent(course.teacherId)}`;
    const heading = el("h3");
    heading.append(action(course.title, "course-title", () => showCourse(course.id)));
    content.append(teacher, heading, el("p", "rating", statistics.count ? `★ ${statistics.rating.toFixed(1)} (${statistics.count} review${statistics.count === 1 ? "" : "s"})` : "Not yet rated"), price(course));
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
    if (teacherFilter) {
        const allTeachers = el("a", "profile-button", "All teachers ×");
        allTeachers.href = "tutor-check.html";
        allTeachers.setAttribute("aria-label", "Remove teacher filter: show all teachers");
        target.append(allTeachers);
    }
    if (category) add(TUTOR_CATEGORIES.find(([id]) => id === category)[1], () => category = "");
    if (type) add(TUTOR_TYPES[type], () => type = "");
    if ($("courseSearch").value.trim()) add(`Search: ${$("courseSearch").value.trim()}`, () => $("courseSearch").value = "");
    document.querySelectorAll('[name="price"]:checked').forEach(input => add(input.parentElement.textContent.trim(), () => input.checked = false));
    const rating = document.querySelector('[name="rating"]:checked');
    if (rating.value) add(`${rating.value} stars & up`, () => document.querySelector('[name="rating"][value=""]').checked = true);
    if (favoritesOnly) add("Saved courses", () => { favoritesOnly = false; $("favoritesButton").setAttribute("aria-pressed", "false"); });
    const count = target.children.length;
    target.hidden = !count;
    $("filterCount").hidden = !count;
    $("filterCount").textContent = count;
    $("resetFilters").disabled = !count && $("courseSort").value === "newest";
    $("allCategories").disabled = !category;
    document.querySelectorAll("[data-category]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.category === category)));
    document.querySelectorAll("[data-type]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.type === type)));
    if (focusedIndex >= 0) {
        (target.children[Math.min(focusedIndex, count - 1)] || $("courseFilters").querySelector("summary")).focus();
    }
}
function renderCatalog() {
    $("manageButton").hidden = role !== "teacher";
    $("teacherSignup").hidden = role === "teacher";
    $("cartCount").textContent = Object.keys(library.cart || {}).length;
    renderFilterState();
    if (!catalogReady || !reviewsReady) return;
    const statistics = stats();
    const filters = { teacher: teacherFilter, category, type, search: $("courseSearch").value, sort: $("courseSort").value,
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
        const noCatalog = !Object.values(courses).some(course => course.published);
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
    document.querySelectorAll("[data-type]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.type === type)));
    renderCart();
    renderRequests();
    renderStudio();
    if (initialCourse) {
        const id = initialCourse;
        initialCourse = "";
        if (courses[id]?.published && (!teacherFilter || courses[id].teacherId === teacherFilter)) showCourse(id);
        else error("This course is no longer available for enrollment.");
    }
    if (initialStudio && role === "teacher") { initialStudio = false; $("teacherStudio").hidden = false; $("teacherStudio").scrollIntoView({ block: "start" }); }
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
        const available = course?.published && course.teacherId !== uid;
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
    const owned = $("ownCourses");
    owned.replaceChildren();
    Object.entries(courses).filter(([, course]) => course.teacherId === uid).forEach(([id, course]) => {
        const node = row(course.title, `${course.published ? "Published" : "Paused"} | ${rupiah(course.price)}`);
        node.append(action("Edit course", "text-button", () => openEditor(id)));
        owned.append(node);
    });
    if (!owned.children.length) owned.append(el("p", "muted", "Create your first course to appear in the marketplace."));
    const items = $("teacherInbox");
    items.replaceChildren();
    Object.entries(inbox).sort(([, a], [, b]) => b.createdAt - a.createdAt).forEach(([id, request]) => {
        const node = row(`${request.studentName} - ${courses[request.courseId]?.title || "Course"}`, `${request.status} | ${rupiah(request.price)}`);
        const buttons = el("div", "row-actions");
        if (request.status === "pending") {
            buttons.append(action("Accept", "primary", () => changeRequest(id, "accepted")), action("Decline", "", () => changeRequest(id, "declined")));
        }
        const contact = el("a", "", "Learner profile");
        contact.href = `profile.html?uid=${encodeURIComponent(request.studentId)}`;
        buttons.append(contact);
        node.append(buttons);
        items.append(node);
    });
    if (!items.children.length) items.append(el("p", "muted", "Enrollment requests will appear here in real time."));
}
function renderDetail() {
    const target = $("courseDetail"), course = courses[detailId];
    const oldForm = target.querySelector("form");
    const draft = oldForm ? new FormData(oldForm) : null;
    const focused = target.contains(document.activeElement) ? document.activeElement : null;
    const focusedName = focused?.name;
    const selectionStart = focused?.selectionStart, selectionEnd = focused?.selectionEnd;
    target.replaceChildren();
    if (!course) { target.append(el("p", "error", "This course is unavailable.")); return; }
    target.append(cover(course, true), el("h3", "", course.title), el("p", "muted", `${course.teacherName} | ${TUTOR_TYPES[course.type]}`), price(course),
        el("p", "detail-copy", course.summary), el("h3", "", "What you will learn"), el("p", "detail-copy", course.curriculum),
        el("h3", "", "Schedule and access"), el("p", "detail-copy", course.schedule));
    const link = el("a", "", "View teacher profile");
    link.href = `profile.html?uid=${encodeURIComponent(course.teacherId)}`;
    target.append(link);
    const add = action("Add to cart", "primary", async () => { if (requireLogin()) await toggleLibrary("cart", detailId, true); });
    add.disabled = !course.published || course.teacherId === uid || Boolean(requests[`${detailId}_${uid}`]);
    if (requests[`${detailId}_${uid}`]) add.textContent = "Already requested";
    target.append(el("p", "muted", course.published ? "Enrollment is requested directly from the teacher. No payment is processed here." : "This listing is paused."), add, el("h3", "", "Learner reviews"));
    const courseReviews = reviews[detailId] || {};
    Object.values(courseReviews).forEach(review => {
        target.append(row(`${review.studentName} | ${review.rating}/5`, review.text));
    });
    if (!Object.keys(courseReviews).length) target.append(el("p", "muted", "No reviews yet."));
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
        form.append(label, textLabel, failure, save);
        form.addEventListener("submit", async event => {
            event.preventDefault(); save.disabled = true;
            const id = detailId, current = version;
            try { await submitReview(id, Number(rating.value), text.value); if (current === version) $("marketStatus").textContent = "Your review was saved."; }
            catch (err) { if (current === version) error(err, target.querySelector(".review-form .error") || $("marketError")); }
            finally { save.disabled = false; }
        });
        target.append(form);
        if (focusedName) {
            const field = form.elements.namedItem(focusedName);
            field?.focus();
            if (selectionStart != null && selectionEnd != null) field?.setSelectionRange(selectionStart, selectionEnd);
        }
    }
}
function openEditor(id = "") {
    if (role !== "teacher") return error("Register as a teacher to create courses.");
    editingId = id;
    const form = $("courseForm");
    form.reset();
    const course = courses[id];
    for (const key of ["title", "teacherName", "category", "type", "price", "originalPrice", "summary", "curriculum", "schedule", "coverURL"]) {
        form.elements.namedItem(key).value = course?.[key] ?? (key === "teacherName" ? (auth.currentUser.displayName || "") : key === "category" ? "ielts" : key === "type" ? "live" : "");
    }
    form.elements.namedItem("published").checked = course ? course.published : true;
    $("editorError").hidden = true;
    $("editorHeading").textContent = id ? "Edit course" : "Create course";
    $("saveCourseButton").textContent = id ? "Save changes" : "Publish course";
    openDialog("editorDialog");
}
$("courseForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = $("courseForm"), fields = [...form.elements];
    const data = Object.fromEntries(new FormData(form));
    data.price = Number(data.price); data.originalPrice = Number(data.originalPrice || 0); data.published = form.elements.namedItem("published").checked;
    const current = version;
    fields.forEach(field => field.disabled = true);
    $("editorError").hidden = true;
    try {
        await saveCourse(data, editingId);
        if (current !== version) return;
        $("editorDialog").close();
        $("marketStatus").textContent = "Course saved. Published courses appear immediately.";
    } catch (err) { if (current === version) error(err, $("editorError")); }
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
        if (!course?.published || course.teacherId === uid) { failures.push("An unavailable course was left in your cart."); continue; }
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
Object.entries({ "": "All Courses", ...TUTOR_TYPES }).forEach(([id, label]) => {
    const button = action(label, "", () => { type = id; renderCatalog(); });
    button.dataset.type = id; button.setAttribute("aria-pressed", String(id === ""));
    $("typeTabs").append(button);
    if (id) { const option = el("option", "", label); option.value = id; $("editorType").append(option); }
});
$("searchForm").addEventListener("submit", event => { event.preventDefault(); renderCatalog(); $("catalog").scrollIntoView({ block: "start" }); });
$("courseSearch").addEventListener("input", renderCatalog);
$("courseSort").addEventListener("change", renderCatalog);
document.querySelectorAll('.filter-panel input').forEach(input => input.addEventListener("change", renderCatalog));
const compactFilters = matchMedia("(max-width:1023px)");
function syncFilterLayout() { $("courseFilters").open = !compactFilters.matches; }
syncFilterLayout();
compactFilters.addEventListener("change", syncFilterLayout);
function resetFilters() {
    const recoverFocus = document.activeElement?.closest(".empty-state");
    category = ""; type = ""; favoritesOnly = false;
    $("courseSearch").value = ""; $("courseSort").value = "newest";
    document.querySelectorAll('[name="price"]').forEach(input => input.checked = false);
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
        role: guarded(data => role = data), library: guarded(data => library = data),
        requests: guarded(data => { requests = data; if ($("courseDialog").open) renderDetail(); }), inbox: guarded(data => inbox = data)
    }, err => { if (current === version) error(`Your marketplace account could not sync. Refresh to retry. ${err.message}`); });
});
window.addEventListener("pagehide", () => { accountStop(); catalogStop(); reviewsStop(); authStop(); compactFilters.removeEventListener("change", syncFilterLayout); }, { once: true });
