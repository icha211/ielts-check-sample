const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const model = vm.createContext({ URL, Intl });
vm.runInContext(fs.readFileSync(path.join(__dirname, "js", "tutor-model.js"), "utf8").replace(/^export /gm, ""), model);
const course = { title: "IELTS Speaking", teacherName: "A teacher", summary: "Speaking practice", whatYouLearn: "Build speaking fluency", curriculum: "Part 1\nPart 2", schedule: "Saturdays, 10:00 WIB", category: "speaking", type: "live", price: 100000, originalPrice: 150000, coverURL: "", previewURL: "", previewPath: "", previewType: "", published: true };
test("course FAQs validate custom entries, legacy defaults and intentionally empty FAQs", () => {
    assert.equal(model.courseFaq(course).length, 3);
    assert.equal(model.courseFaq(course)[2].answer, course.schedule);
    const custom = { ...course, faqCustomized: true, faq: [{ question: " Materials? ", answer: " Included. " }] };
    const saved = model.validateCourse(custom);
    assert.equal(saved.faq[0].question, "Materials?");
    assert.equal(saved.faq[0].answer, "Included.");
    assert.equal(model.courseFaq(saved).length, 1);
    assert.equal(model.courseFaq({ ...course, faqCustomized: true }).length, 0);
    assert.equal(model.validateCourse({ ...course, faqCustomized: true, faq: [] }).faq, null);
    for (const faq of [
        [{ question: "", answer: "Answer" }], [{ question: "Question", answer: "  " }],
        [{ question: "a".repeat(201), answer: "Answer" }], [{ question: "Question", answer: "a".repeat(2001) }],
        [{ question: "Question", answer: 42 }], [{ question: "Question", answer: "Answer", extra: true }],
        Array.from({ length: 21 }, () => ({ question: "Question", answer: "Answer" })),
        { invalid: { question: "Question", answer: "Answer" } }, "invalid"
    ]) assert.throws(() => model.validateCourse({ ...custom, faq }));
    const unfinished = { ...custom, faq: [{ question: "", answer: "" }] };
    assert.equal(model.validateCourse(unfinished, { draft: true }).faq[0].answer, "");
    assert.equal(model.validateCourse(course).faqCustomized, false);
});
test("session agreements validate complete terms and preserve legacy and private draft behavior", () => {
    const terms = { ...course, agreementEnabled: true, sessionCount: 5, sessionDurationMinutes: 60, completionDeadline: "2027-01-31", cancellationTerms: "Reschedule missed sessions with 24 hours notice." };
    assert.equal(model.validateCourse(terms).sessionCount, 5);
    assert.equal(model.courseAgreement(course), null);
    assert.equal(model.validateCourse(course).agreementEnabled, false);
    for (const change of [{ sessionCount: 0 }, { sessionCount: 101 }, { sessionCount: 1.5 }, { sessionDurationMinutes: 481 }, { completionDeadline: "2027-02-30" }, { cancellationTerms: "" }, { cancellationTerms: "a".repeat(2001) }, { startDate: "2027-02-01" }]) {
        assert.throws(() => model.validateCourse({ ...terms, ...change }));
    }
    assert.equal(model.validateCourse({ ...terms, sessionCount: "", sessionDurationMinutes: "", completionDeadline: "", cancellationTerms: "" }, { draft: true }).sessionCount, 0);
});
test("course publishing validates money, fields, types and safe cover URLs", () => {
    assert.equal(model.validateCourse(course).price, 100000);
    for (const change of [{ price: -1 }, { price: 0.5 }, { originalPrice: 50000 }, { originalPrice: -1 }, { category: "invalid" }, { type: "invalid" }, { title: "" }, { curriculum: "a".repeat(5001) }, { whatYouLearn: "" }, { whatYouLearn: "a".repeat(1201) }, { coverURL: "javascript:alert(1)" }, { coverURL: "http://example.com" }]) {
        assert.throws(() => model.validateCourse({ ...course, ...change }));
    }
    assert.equal(model.validateCourse({ ...course, price: 0, originalPrice: 0 }).price, 0);
    assert.equal(model.validateCourse({ ...course, previewURL: "https://example.com/preview.mp4", previewPath: "tutor-courses/teacher/preview/preview.mp4", previewType: "video" }).previewType, "video");
    for (const change of [
        { previewURL: "http://example.com/image.jpg", previewPath: "tutor-courses/teacher/preview/preview.jpg", previewType: "image" },
        { previewURL: "https://", previewPath: "tutor-courses/teacher/preview/preview.jpg", previewType: "image" },
        { previewURL: "https://example.com/image.jpg", previewPath: "../image.jpg", previewType: "image" },
        { previewURL: "https://example.com/image.jpg", previewPath: "", previewType: "image" },
        { previewURL: "https://example.com/image.jpg", previewPath: "tutor-courses/teacher/preview/preview.jpg", previewType: "audio" }
    ]) assert.throws(() => model.validateCourse({ ...course, ...change }));
});
test("catalog searches, filters IDR ranges, omits paused courses and sorts real prices", () => {
    const courses = { a: { ...course, createdAt: 1 }, b: { ...course, title: "Business English", summary: "Workplace communication", category: "business", price: 500000, createdAt: 2 }, c: { ...course, published: false } };
    const ids = filters => Array.from(model.selectCourses(courses, filters), row => row.id);
    assert.deepEqual(ids({}), ["b", "a"]);
    assert.deepEqual(ids({ search: "speaking" }), ["a"]);
    assert.deepEqual(ids({ category: "business" }), ["b"]);
    assert.deepEqual(ids({ prices: ["100000:250000"] }), ["a"]);
    assert.deepEqual(ids({ sort: "price-low" }), ["a", "b"]);
    assert.equal(model.selectCourses(courses, { rating: "4" }, { a: { rating: 4.5 } }).length, 1);
});
test("private drafts accept unfinished text but keep money, media and publish validation strict", () => {
    const incomplete = { ...course, title: "", summary: "", curriculum: "", whatYouLearn: "", schedule: "", price: 0, originalPrice: 0 };
    const saved = model.validateCourse(incomplete, { draft: true });
    assert.equal(saved.title, "");
    assert.equal(saved.published, false);
    assert.throws(() => model.validateCourse(incomplete));
    for (const change of [{ title: "a".repeat(121) }, { price: -1 }, { type: "invalid" }, { coverURL: "http://example.com" }]) {
        assert.throws(() => model.validateCourse({ ...incomplete, ...change }, { draft: true }));
    }
    const privateMedia = { ...course, previewURL: "", previewPath: "tutor-drafts/teacher/media/preview.png", previewType: "image" };
    assert.equal(model.validateCourse(privateMedia, { draft: true }).previewPath, privateMedia.previewPath);
    assert.throws(() => model.validateCourse(privateMedia), "private media must be copied before publishing");
});
test("course schedule fields are optional for older listings and validate time, date, mode and capacity", () => {
    const saved = model.validateCourse(course);
    assert.equal(saved.maxStudents, 0);
    assert.equal(saved.scheduleDays, "");
    assert.deepEqual(
        ["startTime", "endTime", "startDate", "mode"].map(key => saved[key]),
        ["", "", "", ""]
    );
    const scheduled = model.validateCourse({
        ...course, scheduleDays: "Mon, Wed", startTime: "08:00", endTime: "10:00",
        startDate: "2026-11-05", mode: "online", maxStudents: 5
    });
    assert.equal(scheduled.maxStudents, 5);
    for (const change of [
        { startTime: "25:00" }, { startTime: "10:00", endTime: "09:00" },
        { startDate: "2026-02-31" }, { mode: "hybrid" }, { maxStudents: 501 }, { maxStudents: 1.5 }
    ]) assert.throws(() => model.validateCourse({ ...course, ...change }));
});
test("ratings start empty and average actual learner reviews without invented statistics", () => {
    assert.equal(model.courseStats().rating, null);
    assert.equal(model.courseStats({ a: { rating: 5 }, b: { rating: 4 } }).rating, 4.5);
    assert.equal(model.courseStats({ bad: { rating: 8 } }).count, 0);
    assert.equal(model.courseStats({}, { a: { status: "accepted" }, b: { status: "pending" } }).students, 1);
});
test("course intro uses real teacher, rating, title, summary and category pills in reference order", () => {
    const source = fs.readFileSync(path.join(__dirname, "tutor-check.js"), "utf8");
    const el = (tag, className = "", textContent = "") => ({
        tag, className, textContent, children: [],
        append(...nodes) { this.children.push(...nodes); }
    });
    const intro = el("section"), media = el("div");
    const context = vm.createContext({
        el, intro, media, course: { ...course, teacherId: "teacher" },
        courseStats: { count: 2, rating: 4.5 }, reviewedBadge: () => null,
        teacherAvatar: () => el("img"), TUTOR_CATEGORIES: [["speaking", "Speaking"]],
        TUTOR_TYPES: { live: "Live Classes" }
    });
    const introSource = source.slice(source.indexOf('    const introCopy = el('), source.indexOf("\n    detailMain.append(intro)"));
    vm.runInContext(`{${introSource}}`, context);
    const copy = intro.children[1];
    assert.deepEqual(copy.children.map(node => node.className),
        ["detail-intro-teacher", "detail-title", "detail-intro-summary", "course-kicker"]);
    const teacherCopy = copy.children[0].children[1];
    assert.equal(teacherCopy.children[0].children[0].textContent, course.teacherName);
    assert.deepEqual(teacherCopy.children[1].children.map(node => node.textContent), ["4.5", "(2 reviews)"]);
    assert.equal(copy.children[1].textContent, course.title);
    assert.equal(copy.children[2].textContent, course.summary);
    assert.deepEqual(copy.children[3].children.map(node => node.textContent), ["Speaking", "Live Classes"]);
    context.courseStats = { count: 0, rating: null };
    vm.runInContext(`{${introSource}}`, context);
    assert.equal(intro.children[3].children[0].children[1].children[1].children[0].textContent, "No reviews yet");
});
test("course facts render a five-item strip below the intro without notes or a capacity bar", () => {
    const source = fs.readFileSync(path.join(__dirname, "tutor-check.js"), "utf8");
    const el = (tag, className = "", textContent = "") => ({
        tag, className, textContent, dataset: {}, children: [],
        append(...nodes) { this.children.push(...nodes); },
        setAttribute(name, value) { this[name] = value; }
    });
    const detailMain = el("div");
    detailMain.append(el("section", "detail-intro"));
    const context = vm.createContext({
        el, icon: glyph => el("i", `ti ti-${glyph}`), detailMain,
        course: {
            scheduleDays: "Monday - Friday", startTime: "16:00", endTime: "17:00",
            startDate: "2026-11-10", mode: "online", maxStudents: 20
        }
    });
    const factsSource = source.slice(source.indexOf('    const courseFacts = el('), source.indexOf('\n    const tabs = el("nav", "detail-tabs")'));
    vm.runInContext(factsSource, context);
    const strip = detailMain.children[1];
    assert.equal(strip.className, "course-detail-facts");
    const facts = strip.children[0].children;
    assert.deepEqual(facts.map(fact => fact.children[1].children[0].textContent), ["Day", "Time", "Start Date", "Mode", "Quota"]);
    assert.deepEqual(facts.map(fact => fact.children[2].textContent), ["Monday - Friday", "16:00 – 17:00", "Nov 10, 2026", "Online", "20 Students"]);
    assert.ok(facts.every(fact => fact.children.length === 3));
    assert.equal(facts[3].children[2].dataset.mode, "online");
    assert.ok(source.indexOf("detailMain.append(courseFacts)") < source.indexOf("detailMain.append(tabs)"));
    context.course = {};
    vm.runInContext(`{${factsSource}}`, context);
    assert.deepEqual(detailMain.children[2].children[0].children.map(fact => fact.children[2].textContent),
        ["Flexible", "To be arranged", "To be arranged", "Not specified", "No limit"]);
});
test("course detail tabs expose one panel and one keyboard tab stop", () => {
    const source = fs.readFileSync(path.join(__dirname, "tutor-check.js"), "utf8");
    const buttons = ["overview", "curriculum", "reviews", "teacher", "faq"].map(id => ({
        dataset: { detailTab: id }, attributes: {}, tabIndex: 0,
        setAttribute(name, value) { this.attributes[name] = value; },
        focus() { this.focused = true; }
    }));
    const panels = buttons.map(button => ({ dataset: { detailPanel: button.dataset.detailTab }, hidden: false }));
    let scrolled = false;
    const target = {
        querySelectorAll: selector => selector === "[data-detail-tab]" ? buttons : panels,
        querySelector: selector => selector === ".detail-tabs"
            ? { scrollIntoView: () => { scrolled = true; } }
            : buttons.find(button => selector.includes(`"${button.dataset.detailTab}"`))
    };
    const context = vm.createContext({ $: () => target });
    vm.runInContext(source.slice(source.indexOf("function selectDetailTab("), source.indexOf("\nlet editorPreviewURL")), context);
    context.selectDetailTab("curriculum");
    assert.deepEqual(buttons.filter(button => button.tabIndex === 0).map(button => button.dataset.detailTab), ["curriculum"]);
    assert.deepEqual(panels.filter(panel => !panel.hidden).map(panel => panel.dataset.detailPanel), ["curriculum"]);
    assert.equal(buttons[1].attributes["aria-selected"], "true");
    assert.equal(buttons[0].attributes["aria-selected"], "false");
    assert.equal(scrolled, false);
    context.selectDetailTab("reviews", true);
    assert.equal(buttons[2].focused, true);
    assert.equal(scrolled, true);
    assert.deepEqual(panels.filter(panel => !panel.hidden).map(panel => panel.dataset.detailPanel), ["reviews"]);
});
test("detail action errors appear in the visible purchase panel instead of the hidden catalog", () => {
    const source = fs.readFileSync(path.join(__dirname, "tutor-check.js"), "utf8");
    const nodes = { coursePage: { hidden: false }, detailError: { hidden: true }, marketError: { hidden: true } };
    const logged = [];
    const context = vm.createContext({ $: id => nodes[id], console: { error: (...args) => logged.push(args) } });
    vm.runInContext(source.slice(source.indexOf("function error("), source.indexOf("\nfunction action(")), context);
    context.error("Sign in to book a class.");
    assert.equal(nodes.detailError.textContent, "Sign in to book a class.");
    assert.equal(nodes.detailError.hidden, false);
    assert.equal(nodes.marketError.hidden, true);
    nodes.coursePage.hidden = true;
    context.error("Course listings could not load.");
    assert.equal(nodes.marketError.hidden, false);
    assert.equal(nodes.marketError.textContent, "Course listings could not load.");
    assert.equal(logged.length, 2);
    nodes.courseEditor = { hidden: false };
    nodes.editorError = { hidden: true };
    context.error("Your course could not be saved.");
    assert.equal(nodes.editorError.textContent, "Your course could not be saved.");
    assert.equal(nodes.editorError.hidden, false);
});
test("course editor tabs can target the live canvas without changing learner tabs", () => {
    const source = fs.readFileSync(path.join(__dirname, "tutor-check.js"), "utf8");
    const buttons = ["overview", "curriculum"].map(id => ({
        dataset: { detailTab: id }, tabIndex: 0,
        setAttribute(name, value) { this[name] = value; }
    }));
    const panels = buttons.map(button => ({ dataset: { detailPanel: button.dataset.detailTab } }));
    const canvas = { querySelectorAll: selector => selector === "[data-detail-tab]" ? buttons : panels };
    const context = vm.createContext({ $: () => { throw new Error("Must not use learner canvas"); } });
    vm.runInContext(source.slice(source.indexOf("function selectDetailTab("), source.indexOf("\nlet editorPreviewURL")), context);
    context.selectDetailTab("curriculum", false, canvas);
    assert.equal(buttons[1].tabIndex, 0);
    assert.equal(buttons[0].tabIndex, -1);
    assert.equal(panels[0].hidden, true);
    assert.equal(panels[1].hidden, false);
});
test("inline saves preserve media, remove it only on request, and keep failed edits open", async t => {
    const source = fs.readFileSync(path.join(__dirname, "tutor-check.js"), "utf8");
    const handler = source.slice(source.indexOf('$("courseForm").addEventListener("submit"'), source.indexOf('$("checkoutButton").addEventListener'));
    for (const scenario of ["preserve", "remove", "failure", "create"]) {
        await t.test(scenario, async () => {
            const existing = {
                ...course, teacherId: "teacher", coverURL: "https://example.test/cover.jpg",
                previewURL: "https://example.test/preview.jpg", previewPath: "tutor-courses/teacher/media/preview.jpg", previewType: "image"
            };
            const fields = Object.entries(course).map(([name, value]) => ({ name, value, disabled: false }));
            fields.push({ name: "previewFile", files: [], disabled: false }, { name: "agreementEnabled", checked: false, disabled: false }, { name: "archive", disabled: true });
            fields.find(field => field.name === "published").checked = true;
            fields.namedItem = name => fields.find(field => field.name === name);
            let submit;
            const calls = [], feedback = {};
            const nodes = {
                courseForm: { elements: fields, addEventListener: (name, callback) => { submit = callback; } },
                editorError: { hidden: true, scrollIntoView() {} },
                marketStatus: {}, courseDetail: { querySelector: () => feedback },
                editorCanvas: { querySelector: () => null }
            };
            const context = vm.createContext({
                $: id => nodes[id], editingId: scenario === "create" ? "" : "one",
                courses: scenario === "create" ? {} : { one: existing }, uid: "teacher", detailId: "one",
                version: 1, editorBusy: false, removedPreview: scenario === "remove",
                editingDraftId: "", editorSource: () => scenario === "create" ? undefined : existing,
                editorFaqCustomized: true, editorFaq: [{ question: "Materials?", answer: "Included." }],
                teacherEditDirty: false, teacherEditBusy: false,
                FormData: class extends Map { constructor() { super(Object.entries(course)); } },
                validateCourse: model.validateCourse, courseAgreement: model.courseAgreement,
                saveCourse: async (data, id) => {
                    if (scenario === "failure") throw new Error("Connection failed");
                    calls.push(["save", data, id]);
                    return id || "new-course";
                },
                closeEditor: () => calls.push(["close"]),
                showCourse: id => { context.detailId = id; calls.push(["show", id]); },
                storage: {}, storageRef: (_, path) => path,
                deleteObject: async path => calls.push(["delete", path]),
                error: (err, target) => { target.textContent = err.message; target.hidden = false; },
                console
            });
            vm.runInContext(handler, context);
            await submit({ preventDefault() {} });
            assert.equal(context.editorBusy, false);
            assert.equal(fields[0].disabled, false);
            assert.equal(fields.at(-1).disabled, true);
            if (scenario === "failure") {
                assert.equal(nodes.editorError.textContent, "Connection failed");
                assert.equal(nodes.editorError.hidden, false);
                assert.equal(calls.length, 0);
                return;
            }
            const saved = calls.find(([name]) => name === "save")[1];
            assert.equal(saved.faqCustomized, true);
            assert.equal(saved.faq[0].answer, "Included.");
            assert.equal(saved.price, course.price);
            assert.equal(saved.curriculum, course.curriculum);
            assert.equal(saved.whatYouLearn, course.whatYouLearn);
            assert.ok(calls.some(([name]) => name === "close"));
            assert.ok(calls.some(([name, id]) => name === "show" && id === (scenario === "create" ? "new-course" : "one")));
            if (scenario === "preserve") {
                assert.equal(saved.coverURL, existing.coverURL);
                assert.equal(saved.previewURL, existing.previewURL);
                assert.ok(!calls.some(([name]) => name === "delete"));
            } else if (scenario === "remove") {
                for (const name of ["coverURL", "previewURL", "previewPath", "previewType"]) assert.equal(saved[name], "");
                assert.deepEqual(calls.find(([name]) => name === "delete"), ["delete", existing.previewPath]);
            } else {
                assert.equal(context.courses["new-course"].teacherId, "teacher");
            }
        });
    }
});
test("course pencils reveal only the selected component and stay on the course page", () => {
    const source = fs.readFileSync(path.join(__dirname, "tutor-check.js"), "utf8");
    const calls = [];
    const row = { querySelector: selector => ({ click: () => calls.push(selector) }) };
    const section = {
        querySelectorAll: () => [row],
        querySelector: () => ({ click: () => calls.push("add"), focus() {} })
    };
    const canvas = {
        querySelector: selector => selector.startsWith(".editor-")
            ? { closest: () => section }
            : { click: () => calls.push(selector) }
    };
    const context = vm.createContext({ $: () => canvas, selectDetailTab: tab => calls.push(tab) });
    vm.runInContext(source.slice(source.indexOf("function activateCourseField("), source.indexOf("function arrangeCourseEditor(")), context);
    context.activateCourseField({ name: "title" });
    assert.deepEqual(calls, ['[data-edit-field="title"] .course-edit-icon']);
    calls.length = 0;
    context.activateCourseField({ name: "curriculum", index: 0 });
    assert.deepEqual(calls, ["curriculum", ".course-edit-icon"]);
    calls.length = 0;
    context.activateCourseField({ name: "curriculum", index: 0, remove: true });
    assert.deepEqual(calls, ["curriculum", '[data-move="remove"]']);
    calls.length = 0;
    context.activateCourseField({ name: "whatYouLearn", add: true });
    assert.deepEqual(calls, ["overview", "add"]);
});
test("leaving the course editor confirms dirty edits and blocks navigation during saves", () => {
    const source = fs.readFileSync(path.join(__dirname, "tutor-check.js"), "utf8");
    const calls = [];
    const context = vm.createContext({
        editorBusy: false, editorDirty: false, teacherEditBusy: false, teacherEditDirty: false, pendingEditorExit: null,
        closeEditor: () => calls.push("close"), openDialog: id => calls.push(id),
        $: () => ({ focus: () => calls.push("focus") })
    });
    vm.runInContext(source.slice(source.indexOf("function requestEditorExit("), source.indexOf('$("keepCourseEdit").addEventListener')), context);
    const exit = () => calls.push("exit");
    context.requestEditorExit(exit);
    assert.deepEqual(calls, ["close", "exit"]);
    calls.length = 0;
    context.editorDirty = true;
    context.requestEditorExit(exit);
    assert.deepEqual(calls, ["discardCourseDialog", "focus"]);
    assert.equal(context.pendingEditorExit, exit);
    calls.length = 0;
    context.editorBusy = true;
    context.requestEditorExit(exit);
    assert.deepEqual(calls, []);
    context.editorBusy = false;
    context.editorDirty = false;
    context.teacherEditDirty = true;
    context.requestEditorExit(exit);
    assert.deepEqual(calls, ["discardCourseDialog", "focus"]);
    calls.length = 0;
    context.teacherEditBusy = true;
    context.requestEditorExit(exit);
    assert.deepEqual(calls, []);
});
test("video cards show the saved thumbnail while details retain the actual video", () => {
    const source = fs.readFileSync(path.join(__dirname, "tutor-check.js"), "utf8");
    const context = vm.createContext({
        el: (tag, className) => ({
            tag, className, attributes: {},
            setAttribute(name, value) { this.attributes[name] = value; },
            addEventListener() {}
        })
    });
    vm.runInContext(source.slice(source.indexOf("function cover("), source.indexOf("\nfunction price(")), context);
    const input = { ...course, previewType: "video", previewURL: "https://example.test/preview.mp4", coverURL: "https://example.test/thumbnail.jpg" };
    const card = context.cover(input);
    assert.equal(card.tag, "img");
    assert.equal(card.src, input.coverURL);
    assert.match(card.alt, /thumbnail/);
    const detail = context.cover(input, true);
    assert.equal(detail.tag, "video");
    assert.equal(detail.src, input.previewURL);
    assert.equal(detail.poster, input.coverURL);
    assert.equal(detail.controls, true);
});
test("marketplace filter card stays expanded and exposes only price, teacher and rating", () => {
    const source = fs.readFileSync(path.join(__dirname, "tutor-check.html"), "utf8");
    const filter = source.slice(source.indexOf('<aside class="filter-panel'), source.indexOf("</aside>"));
    assert.doesNotMatch(filter, /<details|<summary|courseType|Any rating/);
    assert.match(filter, /id="filterHeading"/);
    assert.match(filter, /id="resetFilters"[^>]*>Clear all</);
    assert.match(filter, /id="teacherFilter"/);
    assert.equal((filter.match(/name="price"/g) || []).length, 4);
    assert.equal((filter.match(/type="radio" name="rating"/g) || []).length, 4);
    assert.match(filter, /name="rating" value="" checked> All ratings/);
    assert.match(filter, /aria-describedby="priceHelp"/);
    assert.match(filter, /class="filter-results-link" href="#catalog"/);
    assert.ok(filter.includes('aria-label="5 stars"'));
    for (const rating of [3, 4]) assert.ok(filter.includes(`aria-label="${rating} stars and up"`));
});
test("price ranges are non-overlapping at boundaries and rating thresholds exclude unrated courses", () => {
    const courses = Object.fromEntries([0, 99999, 100000, 249999, 250000, 499999, 500000, 100000000]
        .map(price => [String(price), { ...course, price }]));
    for (const [range, expected] of [
        ["0:100000", ["0", "99999"]], ["100000:250000", ["100000", "249999"]],
        ["250000:500000", ["250000", "499999"]], ["500000:100000001", ["500000", "100000000"]]
    ]) assert.deepEqual(Array.from(model.selectCourses(courses, { prices: [range] }), row => row.id), expected);
    const ratings = { "0": { rating: 5 }, "99999": { rating: 4.5 }, "100000": { rating: 3 } };
    assert.deepEqual(Array.from(model.selectCourses(courses, { rating: "4" }, ratings), row => row.id), ["0", "99999"]);
    assert.equal(model.selectCourses(courses, { rating: "" }, ratings).length, 8);
});
test("card actions recover focus after a live replacement without stealing focus from another control", async () => {
    const source = fs.readFileSync(path.join(__dirname, "tutor-check.js"), "utf8");
    const document = { body: {}, activeElement: null };
    const replacement = { focus() { document.activeElement = this; } };
    const courseCard = { dataset: { courseId: "course-1" }, querySelector: () => replacement };
    const nodes = {
        browseLayout: { hidden: false },
        courseGrid: { querySelectorAll: () => [courseCard] },
        resultCount: { focus() { document.activeElement = this; } }
    };
    const context = vm.createContext({
        version: 1, document, $: id => nodes[id], error: failure => assert.fail(String(failure)),
        el: () => ({
            dataset: { focusKey: "cart" }, isConnected: true,
            closest: () => courseCard,
            addEventListener(name, callback) { this.click = callback; },
            set disabled(value) { if (value && document.activeElement === this) document.activeElement = document.body; }
        })
    });
    vm.runInContext(source.slice(source.indexOf("function action("), source.indexOf("\nfunction requireLogin(")), context);
    for (const moveFocus of [false, true]) {
        const otherControl = {};
        let button;
        button = context.action("Add to cart", "", async () => {
            button.isConnected = false;
            if (moveFocus) document.activeElement = otherControl;
        });
        document.activeElement = button;
        await button.click();
        assert.equal(document.activeElement, moveFocus ? otherControl : replacement);
    }
});
function fixture() {
    const data = {}, writes = [], calls = [];
    const context = vm.createContext({
        auth: { currentUser: { uid: "teacher", displayName: "Teacher" } }, db: {},
        getFunctions: () => ({}), httpsCallable: (_, name) => async input => {
            calls.push([name, input]);
            if (name === "createEnrollmentRequest") {
                const current = context.auth.currentUser;
                const course = data[`tutor_courses/${input.courseId}`];
                if (!course?.published || course.archived) throw new Error("This course is no longer open for enrollment.");
                if (course.teacherId === current.uid) throw new Error("You cannot enroll in your own course.");
                const requestId = `${input.courseId}_${current.uid}`;
                if (data[`tutor_requests/${requestId}`]) throw new Error("You already requested this course.");
                data[`tutor_requests/${requestId}`] = { courseId: input.courseId, studentId: current.uid, teacherId: course.teacherId, price: course.price, status: "pending" };
                return { data: { requestId } };
            }
            return { data: { requests: [] } };
        },
        validateCourse: model.validateCourse, courseAgreement: model.courseAgreement,
        validateTeachingProfile: model.validateTeachingProfile,
        ref: (_, key) => ({ key }), query: (target, ...filters) => ({ ...target, filters }), orderByChild: value => value, equalTo: value => value,
        serverTimestamp: () => 123, push: target => ({ key: "new-course", path: `${target.key}/new-course` }),
        get: async target => ({ val: () => data[target.key], exists: () => data[target.key] !== undefined }),
        set: async (target, value) => writes.push([target.path || target.key, value]),
        update: async (target, value) => writes.push([target.key, value]),
        onValue: () => () => {}
    });
    const source = fs.readFileSync(path.join(__dirname, "js", "tutor-service.js"), "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
    vm.runInContext(source, context);
    return { context, data, writes, calls };
}
test("draft persistence is owner-scoped and publication removes the draft atomically", async () => {
    const { context, data, writes, calls } = fixture();
    data["tutor_roles/teacher"] = "teacher";
    const incomplete = { ...course, summary: "", schedule: "" };
    await context.saveCourseDraft(incomplete);
    assert.equal(writes[0][0], "tutor_drafts/teacher/new-course");
    assert.equal(writes[0][1].published, false);
    assert.equal(writes[0][1].summary, "");
    data["tutor_drafts/teacher/draft-one"] = { ...incomplete, courseId: "", createdAt: 100 };
    await assert.rejects(context.saveCourse(incomplete, "", "draft-one"));
    assert.equal(writes.length, 1, "invalid publication does not delete saved work");
    await context.saveCourse(course, "", "draft-one");
    assert.equal(writes[1][0], "");
    assert.equal(writes[1][1]["tutor_drafts/teacher/draft-one"], null);
    assert.equal(writes[1][1]["tutor_courses/new-course"].published, true);
    await assert.rejects(context.saveCourse(course, "", "missing"));
    data["tutor_courses/foreign"] = { ...course, teacherId: "other" };
    await assert.rejects(context.saveCourseDraft(course, "", "foreign"));
    context.auth.currentUser = null;
    await assert.rejects(context.saveCourseDraft(incomplete));
});
test("public subscriptions retain missing course stats and observe public teacher identity", () => {
    const { context } = fixture();
    const subscriptions = [], values = [];
    const onError = () => {};
    context.onValue = (target, callback, error) => {
        subscriptions.push({ target, callback, error });
        return () => { target.stopped = true; };
    };
    context.testValues = values;
    context.testOnError = onError;
    const stopStats = vm.runInContext('watchCourseStats("course-id", value => testValues.push(value), testOnError)', context);
    const stopTeacher = vm.runInContext('watchTeacherIdentity("teacher-id", value => testValues.push(value), testOnError)', context);
    assert.deepEqual(subscriptions.slice(0, 2).map(row => row.target.key), [
        "tutor_course_stats/course-id/students", "tutor_course_stats/course-id/reserved"
    ]);
    assert.equal(subscriptions[2].target.key, "tutor_public_teachers/teacher-id");
    assert.equal(subscriptions[0].error, onError);
    assert.equal(subscriptions[1].error, onError);
    subscriptions[0].callback({ val: () => 0 });
    subscriptions[1].callback({ val: () => 2 });
    subscriptions[2].callback({ val: () => ({ displayName: "Updated teacher" }) });
    assert.deepEqual(JSON.parse(JSON.stringify(values)), [{ students: 0 }, { students: 0, reserved: 2 }, { displayName: "Updated teacher" }]);
    stopStats();
    stopTeacher();
    assert.ok(subscriptions.every(({ target }) => target.stopped));
});
    test("teaching profiles validate self-reported fields without accepting unsafe images", () => {
        const profile = { experience: 8, qualification: "TESOL", about: "Speaking practice", imageURL: "" };
        assert.equal(model.validateTeachingProfile(profile).experience, 8);
        for (const change of [{ experience: -1 }, { experience: 1.5 }, { experience: 81 }, { qualification: "a".repeat(121) }, { about: "a".repeat(3001) }, { imageURL: "javascript:alert(1)" }]) {
            assert.throws(() => model.validateTeachingProfile({ ...profile, ...change }));
        }
    });
    test("teacher summary uses real owned courses and counts unique reviewers, not invented students", () => {
        const catalog = { a: { ...course, teacherId: "one", published: true }, b: { ...course, teacherId: "one", published: false }, c: { ...course, teacherId: "other" } };
        const reviews = { a: { student: { rating: 5 } }, b: { student: { rating: 3 }, second: { rating: 4 } }, c: { outsider: { rating: 1 } } };
        const stats = model.teachingSummary(catalog, reviews, "one");
        assert.equal(stats.courses.length, 1);
        assert.equal(stats.reviews.length, 3);
        assert.equal(stats.reviewers, 2);
        assert.equal(stats.rating, 4);
        assert.equal(model.teachingSummary({}, {}, "new").rating, null);
        assert.equal(model.selectCourses(catalog, { teacher: "one" }).length, 1);
    });
    test("only teachers save their own teaching profile", async () => {
        const { context, data, writes } = fixture();
        const input = { experience: 2, qualification: "", about: "My approach", imageURL: "" };
        await assert.rejects(context.saveTeachingProfile(input), /Only teachers/);
        data["tutor_roles/teacher"] = "teacher";
        await context.saveTeachingProfile(input);
        assert.equal(writes[0][0], "tutor_profiles/teacher");
        assert.equal(writes[0][1].updatedAt, 123);
    });
test("teacher role is self-service but separate from developer claims; existing teachers stay teachers", async () => {
    const { context, data, writes } = fixture();
    assert.equal(await context.registerMarketplaceRole("teacher"), "teacher");
    assert.deepEqual(writes[0], ["tutor_roles/teacher", "teacher"]);
    data["tutor_roles/teacher"] = "teacher";
    assert.equal(await context.registerMarketplaceRole("student"), "teacher");
    assert.equal(writes.length, 1);
    await assert.rejects(context.registerMarketplaceRole("developer"));
});
test("student dashboard routes only current teacher accounts and exposes role lookup failures", async () => {
    const source = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    const marker = source.indexOf("const teachingRole = await get(");
    const start = source.lastIndexOf("try {", marker);
    const end = source.indexOf("if (user) {", marker);
    const guard = source.slice(start, end);
    for (const scenario of ["teacher", "student", "stale", "error"]) {
        const routes = [], notices = [], logs = [];
        const context = vm.createContext({
            user: { uid: "account" }, db: {}, version: 1, partnerAuthVersion: scenario === "stale" ? 2 : 1,
            get: async () => {
                if (scenario === "error") throw new Error("Connection failed");
                return { val: () => scenario === "student" ? "student" : "teacher" };
            },
            ref: (_, path) => { assert.equal(path, "tutor_roles/account"); return path; },
            window: { location: { replace: url => routes.push(url) } },
            document: { createElement: () => ({ setAttribute() {} }), body: { prepend: notice => notices.push(notice) } },
            console: { error: (...args) => logs.push(args) }
        });
        await vm.runInContext(`(async () => { ${guard} })()`, context);
        assert.deepEqual(routes, scenario === "teacher" ? ["tutor-check.html?studio=1"] : []);
        assert.equal(notices.length, scenario === "error" ? 1 : 0);
        assert.equal(logs.length, scenario === "error" ? 1 : 0);
    }
});
test("only teacher accounts publish, only owners edit, and enrollment never processes payment", async () => {
    const { context, data, writes, calls } = fixture();
    await assert.rejects(context.saveCourse(course), /teacher/);
    data["tutor_roles/teacher"] = "teacher";
    await context.saveCourse(course);
    assert.equal(writes[0][1].teacherId, "teacher");
    data["tutor_courses/other"] = { teacherId: "other" };
    await assert.rejects(context.saveCourse(course, "other"), /own courses/);
    data["tutor_courses/one"] = { ...course, id: "one", teacherId: "teacher", published: true };
    await assert.rejects(context.requestEnrollment({ ...course, id: "one", teacherId: "teacher" }), /own course/);
    context.auth.currentUser.uid = "student";
    await context.requestEnrollment({ ...course, id: "one", teacherId: "teacher" });
    const request = data["tutor_requests/one_student"];
    assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ["createEnrollmentRequest", { courseId: "one", agreement: null }]);
    assert.equal(request.status, "pending");
    assert.equal(request.price, 100000);
    assert.equal(request.paid, undefined);
    await assert.rejects(context.requestEnrollment({ ...course, id: "one", teacherId: "teacher" }), /already requested/);
});
test("enrollment confirmation forwards the displayed terms and price for server validation", async () => {
    const { context, data, calls } = fixture();
    context.auth.currentUser.uid = "student";
    const agreedCourse = { ...course, id: "terms", teacherId: "teacher", agreementEnabled: true,
        sessionCount: 5, sessionDurationMinutes: 60, completionDeadline: "2027-12-31", cancellationTerms: "Make up missed sessions." };
    data["tutor_courses/terms"] = agreedCourse;
    await context.requestEnrollment(agreedCourse);
    const confirmation = calls.at(-1)[1];
    assert.equal(confirmation.agreement.sessionCount, 5);
    assert.equal(confirmation.agreement.courseTitle, course.title);
    assert.equal(confirmation.agreement.price, course.price);
    assert.equal(confirmation.agreement.teacherId, "teacher");
    assert.equal(confirmation.agreement.acceptedAt, undefined, "acceptance timestamps are server-authored");
});
test("clearing teaching details and archiving courses preserve learner records and require ownership", async () => {
    const { context, data, writes } = fixture();
    await assert.rejects(context.clearTeachingProfile(), /Only teachers/);
    await assert.rejects(context.setCourseState("one", "archived"), /Only teachers/);
    data["tutor_roles/teacher"] = "teacher";
    await context.clearTeachingProfile();
    assert.deepEqual(writes[0], ["tutor_profiles/teacher", null]);
    data["tutor_courses/one"] = { ...course, teacherId: "other" };
    await assert.rejects(context.setCourseState("one", "archived"), /own courses/);
    data["tutor_courses/one"].teacherId = "teacher";
    await context.setCourseState("one", "archived");
    assert.equal(writes[1][1].published, false);
    assert.equal(writes[1][1].archived, true);
    data["tutor_courses/one"].archived = true;
    await assert.rejects(context.saveCourse(course, "one"), /Restore/);
    await assert.rejects(context.setCourseState("one", "published"), /Restore/);
    data["tutor_courses/one"] = { ...course, teacherId: "other", published: true, archived: true };
    await assert.rejects(context.requestEnrollment({ ...course, id: "one", teacherId: "other", archived: true }), /no longer open/);
    data["tutor_courses/one"] = { ...course, teacherId: "teacher", published: false, archived: false };
    const archivedSummary = model.teachingSummary({ one: { ...course, teacherId: "teacher", archived: true } }, { one: { learner: { rating: 5 } } }, "teacher");
    assert.equal(archivedSummary.courses.length, 0);
    assert.equal(archivedSummary.reviews.length, 1);
    await context.setCourseState("one", "paused");
    assert.equal(writes[2][1].archived, false);
    assert.equal(writes[2][1].published, false);
    await assert.rejects(context.setCourseState("one", "deleted"), /Invalid/);
    assert.ok(writes.every(([key]) => !key.includes("requests") && !key.includes("reviews")));
    assert.equal(model.selectCourses({ one: { ...course, archived: true } }).length, 0);
});
