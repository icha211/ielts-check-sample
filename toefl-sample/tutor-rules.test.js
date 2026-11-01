const assert = require("node:assert/strict");
const { test } = require("node:test");
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const stamp = { ".sv": "timestamp" };
function token(uid) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: uid, user_id: uid, aud: "demo-toefl-messaging", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, firebase: { sign_in_provider: "custom" } })}.`;
}
async function request(path, uid, method = "GET", data, filters = {}) {
    const url = new URL(`http://${host}/${path}.json`);
    url.searchParams.set("ns", "demo-toefl-messaging-default-rtdb");
    if (uid) url.searchParams.set("auth", token(uid));
    for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, JSON.stringify(value));
    return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
}
test("teacher self-registration cannot grant developer privileges; listing ownership is enforced", { skip: !host }, async () => {
    assert.equal((await request("tutor_roles/tutor-teacher", "tutor-teacher", "PUT", "teacher")).status, 200);
    assert.equal((await request("tutor_roles/tutor-teacher", "stranger", "PUT", "teacher")).status, 401);
    assert.equal((await request("tutor_roles/tutor-teacher", "tutor-teacher", "PUT", "developer")).status, 401);
    const course = { teacherId: "tutor-teacher", teacherName: "Teacher", title: "IELTS", summary: "Practice", curriculum: "Speaking", schedule: "Monday WIB", category: "ielts", type: "live", price: 100000, originalPrice: 0, coverURL: "", published: true, createdAt: stamp, updatedAt: stamp };
    assert.equal((await request("tutor_courses/test-course", "tutor-teacher", "PUT", course)).status, 200);
    assert.equal((await request("tutor_courses/test-course", null)).status, 200);
    assert.equal((await request("tutor_courses/test-course", "stranger", "PATCH", { price: 0, updatedAt: stamp })).status, 401);
    assert.equal((await request("tutor_courses/test-course", "tutor-teacher", "PATCH", { price: -1, updatedAt: stamp })).status, 401);
});
test("enrollment prices and transitions are protected, inboxes are private, only accepted learners review", { skip: !host }, async () => {
    const course = { teacherId: "enroll-teacher", teacherName: "Teacher", title: "Speaking", summary: "Practice", curriculum: "Speaking", schedule: "Monday WIB", category: "speaking", type: "live", price: 100000, originalPrice: 0, coverURL: "", published: true, createdAt: stamp, updatedAt: stamp };
    await request("tutor_roles/enroll-teacher", "enroll-teacher", "PUT", "teacher");
    assert.equal((await request("tutor_courses/enroll-course", "enroll-teacher", "PUT", course)).status, 200);
    const row = { courseId: "enroll-course", studentId: "enroll-student", teacherId: "enroll-teacher", studentName: "Learner", price: 100000, status: "pending", createdAt: stamp, updatedAt: stamp };
    assert.equal((await request("tutor_requests/enroll-course_enroll-student", "enroll-student", "PUT", { ...row, price: 1 })).status, 401);
    assert.equal((await request("tutor_requests/enroll-course_enroll-student", "enroll-student", "PUT", row)).status, 200);
    assert.equal((await request("tutor_requests", "stranger")).status, 401);
    assert.equal((await request("tutor_requests", "enroll-student", "GET", undefined, { orderBy: "studentId", equalTo: "enroll-student" })).status, 200);
    assert.equal((await request("tutor_requests", "stranger", "GET", undefined, { orderBy: "teacherId", equalTo: "enroll-teacher" })).status, 401);
    assert.equal((await request("tutor_requests/enroll-course_enroll-student", "enroll-student", "PATCH", { status: "accepted", updatedAt: stamp })).status, 401);
    const review = { rating: 5, text: "Useful course", studentName: "Learner", updatedAt: stamp };
    assert.equal((await request("tutor_reviews/enroll-course/enroll-student", "enroll-student", "PUT", review)).status, 401);
    assert.equal((await request("tutor_requests/enroll-course_enroll-student", "enroll-teacher", "PATCH", { status: "accepted", updatedAt: stamp })).status, 200);
    assert.equal((await request("tutor_reviews/enroll-course/enroll-student", "enroll-student", "PUT", review)).status, 200);
    assert.equal((await request("tutor_reviews/enroll-course/stranger", "stranger", "PUT", review)).status, 401);
    assert.equal((await request("tutor_library/enroll-student/cart/enroll-course", "stranger", "PUT", true)).status, 401);
});
