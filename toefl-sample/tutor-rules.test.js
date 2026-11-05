const assert = require("node:assert/strict");
const { test } = require("node:test");
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
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
    assert.equal((await request("tutor_roles/tutor-teacher", null)).status, 200);
    assert.equal((await request("tutor_roles", null)).status, 401);
    assert.equal((await request("tutor_roles/tutor-teacher", "stranger", "PUT", "teacher")).status, 401);
    assert.equal((await request("tutor_roles/tutor-teacher", "tutor-teacher", "PUT", "developer")).status, 401);
    const course = { teacherId: "tutor-teacher", teacherName: "Teacher", title: "IELTS", summary: "Practice", whatYouLearn: "Speaking", curriculum: "Speaking", schedule: "Monday WIB", scheduleDays: "Mon, Wed", startTime: "08:00", endTime: "10:00", startDate: "2026-11-05", mode: "online", maxStudents: 5, category: "ielts", type: "live", price: 100000, originalPrice: 0, coverURL: "", previewURL: "", previewPath: "", previewType: "", published: true, createdAt: stamp, updatedAt: stamp };
    assert.equal((await request("tutor_courses/test-course", "tutor-teacher", "PUT", course)).status, 200);
    assert.equal((await request("tutor_courses/test-course", null)).status, 200);
    assert.equal((await request("tutor_courses/test-course", "tutor-teacher", "PATCH", { maxStudents: 501, updatedAt: stamp })).status, 401);
    assert.equal((await request("tutor_requests/test-course_student", "student", "PUT", { courseId: "test-course", studentId: "student", teacherId: "tutor-teacher", studentName: "Student", price: 100000, status: "pending", createdAt: stamp, updatedAt: stamp })).status, 401);
    assert.equal((await request("tutor_courses/test-course", "stranger", "PATCH", { price: 0, updatedAt: stamp })).status, 401);
    assert.equal((await request("tutor_courses/test-course", "tutor-teacher", "PATCH", { price: -1, updatedAt: stamp })).status, 401);
    assert.equal((await request("tutor_courses/test-course", "tutor-teacher", "PATCH", { archived: true, updatedAt: stamp })).status, 401);
    assert.equal((await request("tutor_courses/test-course", "tutor-teacher", "PATCH", { archived: true, published: false, updatedAt: stamp })).status, 200);
    assert.equal((await request("tutor_courses/test-course", "tutor-teacher", "PATCH", { published: true, updatedAt: stamp })).status, 401);
    assert.equal((await request("tutor_courses/test-course", "stranger", "PATCH", { archived: false, updatedAt: stamp })).status, 401);
    assert.equal((await request("tutor_courses/test-course", "tutor-teacher", "PATCH", { archived: false, published: false, updatedAt: stamp })).status, 200);
    assert.equal((await request("tutor_courses/test-course", "tutor-teacher", "DELETE")).status, 401);
});
test("unfinished drafts are private, owner-written and removed atomically only on successful publishing", { skip: !host }, async () => {
    const uid = "draft-teacher", path = `tutor_drafts/${uid}/saved`;
    await request(`tutor_roles/${uid}`, uid, "PUT", "teacher");
    const draft = { teacherId: uid, courseId: "", teacherName: "Teacher", title: "", summary: "", whatYouLearn: "", curriculum: "", schedule: "", category: "ielts", type: "live", price: 0, originalPrice: 0, coverURL: "", previewURL: "", previewPath: "", previewType: "", published: false, createdAt: stamp, updatedAt: stamp };
    assert.equal((await request(path, uid, "PUT", draft)).status, 200);
    assert.equal((await request(`tutor_drafts/${uid}`, uid)).status, 200);
    for (const actor of [null, "draft-stranger"]) {
        assert.equal((await request(path, actor)).status, 401);
        assert.equal((await request(path, actor, "PUT", draft)).status, 401);
        assert.equal((await request(path, actor, "DELETE")).status, 401);
    }
    assert.equal((await request(path, uid, "PATCH", { published: true, updatedAt: stamp })).status, 401);
    assert.equal((await request(path, uid, "PATCH", { unexpected: "field", updatedAt: stamp })).status, 401);
    assert.equal((await request("", uid, "PATCH", { "tutor_courses/draft-published": { ...draft, published: true }, [path]: null })).status, 401);
    assert.equal((await request(path, uid)).status, 200, "failed publishing keeps the private draft");
    const complete = { ...draft, title: "Complete course", summary: "About", whatYouLearn: "Outcome", curriculum: "Lesson", schedule: "Monday", published: true };
    delete complete.courseId;
    assert.equal((await request("", uid, "PATCH", { "tutor_courses/draft-published": complete, [path]: null })).status, 200);
    assert.equal(await (await request(path, uid)).json(), null);
    assert.equal((await request("tutor_courses/draft-published", null)).status, 200);
    assert.equal((await request("tutor_drafts/student/draft", "student", "PUT", { ...draft, teacherId: "student" })).status, 401);
    assert.equal((await request(path, uid, "PUT", draft)).status, 200);
    assert.equal((await request(path, uid, "DELETE")).status, 200);
});
test("public teaching backgrounds remain owner-written and require a teacher role", { skip: !host }, async () => {
    const profile = { experience: 8, qualification: "TESOL (self-reported)", about: "My teaching approach", imageURL: "", updatedAt: stamp };
    assert.equal((await request("tutor_profiles/profile-teacher", "profile-teacher", "PUT", profile)).status, 401);
    await request("tutor_roles/profile-teacher", "profile-teacher", "PUT", "teacher");
    assert.equal((await request("tutor_profiles/profile-teacher", "profile-teacher", "PUT", profile)).status, 200);
    assert.equal((await request("tutor_profiles/profile-teacher", null)).status, 200);
    assert.equal((await request("tutor_profiles/profile-teacher", "stranger", "PATCH", { about: "Changed", updatedAt: stamp })).status, 401);
    assert.equal((await request("tutor_profiles/profile-teacher", "profile-teacher", "PATCH", { verified: true, updatedAt: stamp })).status, 401);
    assert.equal((await request("tutor_profiles/profile-teacher", "profile-teacher", "PATCH", { experience: 81, updatedAt: stamp })).status, 401);
    assert.equal((await request("tutor_profiles/profile-teacher", "stranger", "DELETE")).status, 401);
    assert.equal((await request("tutor_profiles/profile-teacher", "profile-teacher", "DELETE")).status, 200);
});
test("tutor review state is private and can only be changed by trusted backend code", { skip: !host }, async () => {
    assert.equal((await request("tutor_verification/review-teacher", "review-teacher")).status, 401);
    assert.equal((await request("tutor_verification/review-teacher", "review-teacher", "PUT", { status: "verified" })).status, 401);
    assert.equal((await request("tutor_verification/review-teacher", null)).status, 401);
    assert.equal((await request("tutor_security/review-teacher", "review-teacher", "PUT", { requests: 1 })).status, 401);
});
test("enrollment prices and transitions are protected, inboxes are private, only accepted learners review", { skip: !host }, async () => {
    const course = { teacherId: "enroll-teacher", teacherName: "Teacher", title: "Speaking", summary: "Practice", whatYouLearn: "Speaking", curriculum: "Speaking", schedule: "Monday WIB", category: "speaking", type: "live", price: 100000, originalPrice: 0, coverURL: "", previewURL: "", previewPath: "", previewType: "", published: true, createdAt: stamp, updatedAt: stamp };
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
    assert.equal((await request("tutor_courses/enroll-course", "enroll-teacher", "PATCH", { archived: true, published: false, updatedAt: stamp })).status, 200);
    assert.equal((await request("tutor_requests/enroll-course_new-student", "new-student", "PUT", { ...row, studentId: "new-student" })).status, 401);
    assert.equal((await request("tutor_library/enroll-student/cart/enroll-course", "enroll-student", "PUT", true)).status, 401);
    assert.equal((await request("tutor_reviews/enroll-course/enroll-student", "enroll-student", "PUT", { ...review, rating: 4 })).status, 200);
    const retained = await request("tutor_requests", "enroll-teacher", "GET", undefined, { orderBy: "teacherId", equalTo: "enroll-teacher" });
    assert.equal((await retained.json())["enroll-course_enroll-student"].status, "accepted");
});
test("public course totals expose only a count and public teacher identity is backend-written", { skip: !host }, async () => {
    const url = new URL(`http://${host}/.json?ns=demo-toefl-messaging-default-rtdb`);
    const seeded = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
        body: JSON.stringify({
            "tutor_course_stats/public-stats-test": { students: 2, records: { privateStudent: { accepted: true, revision: 1 } } },
            "tutor_public_teachers/public-teacher-test": { displayName: "Teacher", photoURL: "" }
        })
    });
    assert.equal(seeded.status, 200);
    const count = await request("tutor_course_stats/public-stats-test/students", null);
    assert.equal(count.status, 200);
    assert.equal(await count.json(), 2);
    assert.equal((await request("tutor_course_stats/public-stats-test", null)).status, 401);
    assert.equal((await request("tutor_course_stats/public-stats-test/records", "public-teacher-test")).status, 401);
    assert.equal((await request("tutor_course_stats/public-stats-test/students", "public-teacher-test", "PUT", 99)).status, 401);
    assert.equal((await request("tutor_public_teachers/public-teacher-test", null)).status, 200);
    assert.equal((await request("tutor_public_teachers/public-teacher-test", "public-teacher-test", "PUT", { displayName: "Fake" })).status, 401);
});
test("draft previews require the owner for upload, read and delete and enforce media limits", { skip: !storageHost }, async () => {
    const uid = "draft-media-owner";
    const object = `tutor-drafts/${uid}/${Date.now()}/preview.png`;
    const collection = `http://${storageHost}/v0/b/demo-toefl-messaging.appspot.com/o`;
    const objectURL = `${collection}/${encodeURIComponent(object)}`;
    async function upload(actor, contentType, size = 3, name = object) {
        const url = new URL(collection);
        url.searchParams.set("uploadType", "media");
        url.searchParams.set("name", name);
        return fetch(url, {
            method: "POST", headers: { Authorization: `Bearer ${token(actor)}`, "Content-Type": contentType },
            body: new Uint8Array(size)
        });
    }
    assert.equal((await upload("draft-media-stranger", "image/png")).status, 403);
    assert.equal((await upload(uid, "text/html")).status, 403);
    assert.equal((await upload(uid, "image/svg+xml")).status, 403);
    assert.equal((await upload(uid, "image/png", 20 * 1024 * 1024 + 1)).status, 403);
    assert.equal((await upload(uid, "image/png", 20 * 1024 * 1024)).status, 200);
    assert.equal((await fetch(objectURL, {
        method: "PATCH", headers: { Authorization: `Bearer ${token(uid)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: { changed: "true" } })
    })).status, 403, "draft preview metadata cannot be updated");
    assert.equal((await upload(uid, "video/mp4", 3, object.replace(".png", ".mp4"))).status, 200);
    assert.equal((await fetch(`${objectURL}?alt=media`, { headers: { Authorization: `Bearer ${token(uid)}` } })).status, 200);
    assert.equal((await fetch(`${objectURL}?alt=media`)).status, 403);
    assert.equal((await fetch(`${objectURL}?alt=media`, { headers: { Authorization: `Bearer ${token("draft-media-stranger")}` } })).status, 403);
    assert.equal((await fetch(objectURL, { method: "DELETE", headers: { Authorization: `Bearer ${token("draft-media-stranger")}` } })).status, 403);
    assert.equal((await fetch(objectURL, { method: "DELETE", headers: { Authorization: `Bearer ${token(uid)}` } })).status, 204);
});
