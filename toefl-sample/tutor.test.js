const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const model = vm.createContext({ URL, Intl });
vm.runInContext(fs.readFileSync(path.join(__dirname, "js", "tutor-model.js"), "utf8").replace(/^export /gm, ""), model);
const course = { title: "IELTS Speaking", teacherName: "A teacher", summary: "Speaking practice", curriculum: "Part 1\nPart 2", schedule: "Saturdays, 10:00 WIB", category: "speaking", type: "live", price: 100000, originalPrice: 150000, coverURL: "", published: true };
test("course publishing validates money, fields, types and safe cover URLs", () => {
    assert.equal(model.validateCourse(course).price, 100000);
    for (const change of [{ price: -1 }, { price: 0.5 }, { originalPrice: 50000 }, { originalPrice: -1 }, { category: "invalid" }, { type: "invalid" }, { title: "" }, { curriculum: "a".repeat(5001) }, { coverURL: "javascript:alert(1)" }, { coverURL: "http://example.com" }]) {
        assert.throws(() => model.validateCourse({ ...course, ...change }));
    }
    assert.equal(model.validateCourse({ ...course, price: 0, originalPrice: 0 }).price, 0);
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
});
function fixture() {
    const data = {}, writes = [];
    const context = vm.createContext({
        auth: { currentUser: { uid: "teacher", displayName: "Teacher" } }, db: {},
        validateCourse: model.validateCourse,
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
