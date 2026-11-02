const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const model = vm.createContext({ URL, Intl });
vm.runInContext(fs.readFileSync(path.join(__dirname, "js", "tutor-model.js"), "utf8").replace(/^export /gm, ""), model);
const course = { title: "IELTS Speaking", teacherName: "A teacher", summary: "Speaking practice", whatYouLearn: "Build speaking fluency", curriculum: "Part 1\nPart 2", schedule: "Saturdays, 10:00 WIB", category: "speaking", type: "live", price: 100000, originalPrice: 150000, coverURL: "", previewURL: "", previewPath: "", previewType: "", published: true };
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
test("ratings start empty and average actual learner reviews without invented statistics", () => {
    assert.equal(model.courseStats().rating, null);
    assert.equal(model.courseStats({ a: { rating: 5 }, b: { rating: 4 } }).rating, 4.5);
    assert.equal(model.courseStats({ bad: { rating: 8 } }).count, 0);
    assert.equal(model.courseStats({}, { a: { status: "accepted" }, b: { status: "pending" } }).students, 1);
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
    const data = {}, writes = [];
    const context = vm.createContext({
        auth: { currentUser: { uid: "teacher", displayName: "Teacher" } }, db: {},
        validateCourse: model.validateCourse,
        validateTeachingProfile: model.validateTeachingProfile,
        ref: (_, key) => ({ key }), query: (target, ...filters) => ({ ...target, filters }), orderByChild: value => value, equalTo: value => value,
        serverTimestamp: () => 123, push: target => ({ key: "new-course", path: target.key }),
        get: async target => ({ val: () => data[target.key], exists: () => data[target.key] !== undefined }),
        set: async (target, value) => writes.push([target.key, value]),
        update: async (target, value) => writes.push([target.key, value]),
        onValue: () => () => {}
    });
    const source = fs.readFileSync(path.join(__dirname, "js", "tutor-service.js"), "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
    vm.runInContext(source, context);
    return { context, data, writes };
}
test("public subscriptions retain missing counts and observe only public identity and totals", () => {
    const { context } = fixture();
    const subscriptions = [], values = [];
    const onError = () => {};
    context.onValue = (target, callback, error) => {
        subscriptions.push({ target, callback, error });
        return () => { target.stopped = true; };
    };
    context.testValues = values;
    context.testOnError = onError;
    const stopCount = vm.runInContext('watchCourseStudents("course-id", value => testValues.push(value), testOnError)', context);
    const stopTeacher = vm.runInContext('watchTeacherIdentity("teacher-id", value => testValues.push(value), testOnError)', context);
    assert.equal(subscriptions[0].target.key, "tutor_course_stats/course-id/students");
    assert.equal(subscriptions[1].target.key, "tutor_public_teachers/teacher-id");
    assert.equal(subscriptions[0].error, onError);
    assert.equal(subscriptions[1].error, onError);
    subscriptions[0].callback({ val: () => null });
    subscriptions[0].callback({ val: () => 0 });
    subscriptions[0].callback({ val: () => 12 });
    subscriptions[1].callback({ val: () => ({ displayName: "Updated teacher" }) });
    assert.deepEqual(values, [null, 0, 12, { displayName: "Updated teacher" }]);
    stopCount();
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
    await context.registerMarketplaceRole("teacher");
    assert.deepEqual(writes[0], ["tutor_roles/teacher", "teacher"]);
    data["tutor_roles/teacher"] = "teacher";
    await context.registerMarketplaceRole("student");
    assert.equal(writes.length, 1);
    await assert.rejects(context.registerMarketplaceRole("developer"));
});
test("only teacher accounts publish, only owners edit, and enrollment never processes payment", async () => {
    const { context, data, writes } = fixture();
    await assert.rejects(context.saveCourse(course), /teacher/);
    data["tutor_roles/teacher"] = "teacher";
    await context.saveCourse(course);
    assert.equal(writes[0][1].teacherId, "teacher");
    data["tutor_courses/other"] = { teacherId: "other" };
    await assert.rejects(context.saveCourse(course, "other"), /own courses/);
    await assert.rejects(context.requestEnrollment({ ...course, id: "one", teacherId: "teacher" }), /own course/);
    context.auth.currentUser.uid = "student";
    await context.requestEnrollment({ ...course, id: "one", teacherId: "teacher" });
    const request = writes.at(-1);
    assert.equal(request[0], "tutor_requests/one_student");
    assert.equal(request[1].status, "pending");
    assert.equal(request[1].price, 100000);
    assert.equal(request[1].paid, undefined);
    data.tutor_requests = { one_student: request[1] };
    await assert.rejects(context.requestEnrollment({ ...course, id: "one", teacherId: "teacher" }), /already requested/);
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
    await assert.rejects(context.requestEnrollment({ ...course, id: "one", teacherId: "other", archived: true }), /no longer open/);
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
