const { test } = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");

const enabled = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
test("database triggers publish live identity and private-ledger enrollment counts", { skip: !enabled, timeout: 60000 }, async () => {
    const app = initializeApp({
        projectId: "demo-toefl-messaging",
        databaseURL: "https://demo-toefl-messaging-default-rtdb.firebaseio.com"
    }, "marketplace-trigger-test");
    const db = getDatabase(app), auth = getAuth(app);
    const teacherId = `market-teacher-${Date.now()}`, courseId = `market-course-${Date.now()}`;
    const requestId = `${courseId}_learner`;
    async function waitFor(path, matches) {
        for (let attempt = 0; attempt < 100; attempt++) {
            const value = (await db.ref(path).get()).val();
            if (matches(value)) return value;
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        assert.fail(`Trigger did not publish expected data at ${path}`);
    }
    try {
        await auth.createUser({ uid: teacherId, displayName: "Original teacher" });
        await db.ref().update({
            [`tutor_roles/${teacherId}`]: "teacher",
            [`users/${teacherId}`]: { first_name: "Profile", last_name: "Teacher", email: "private@example.test" },
            [`tutor_courses/${courseId}`]: { teacherId },
            [`tutor_verification/${teacherId}`]: { status: "pending", requestedAt: 1 }
        });
        const identity = await waitFor(`tutor_public_teachers/${teacherId}`, value => value?.displayName === "Profile Teacher");
        assert.deepEqual(Object.keys(identity).sort(), ["displayName", "photoURL", "verified"]);
        assert.equal(identity.verified, false);
        await db.ref(`tutor_verification/${teacherId}`).set({ status: "verified", requestedAt: 1, reviewedAt: 2 });
        await waitFor(`tutor_public_teachers/${teacherId}`, value => value?.verified === true);
        await waitFor(`tutor_course_stats/${courseId}/students`, value => value === 0);
        await db.ref(`tutor_requests/${requestId}`).set({ courseId, teacherId, studentId: "learner", status: "pending", updatedAt: 1 });
        await waitFor(`tutor_course_stats/${courseId}/records/${requestId}`, value => value?.revision === 1);
        assert.equal((await db.ref(`tutor_course_stats/${courseId}/students`).get()).val(), 0);
        await db.ref(`tutor_requests/${requestId}`).update({ status: "accepted", updatedAt: 2 });
        await waitFor(`tutor_course_stats/${courseId}/students`, value => value === 1);
        await db.ref(`users/${teacherId}/first_name`).set("Updated");
        await waitFor(`tutor_public_teachers/${teacherId}`, value => value?.displayName === "Updated Teacher");
        await db.ref(`tutor_requests/${requestId}`).remove();
        await waitFor(`tutor_course_stats/${courseId}/students`, value => value === 0);
        await db.ref(`tutor_roles/${teacherId}`).remove();
        await waitFor(`tutor_public_teachers/${teacherId}`, value => value === null);
        await auth.deleteUser(teacherId);
        await db.ref(`tutor_public_teachers/${teacherId}`).set({ displayName: "Stale teacher", photoURL: "" });
        await db.ref(`tutor_roles/${teacherId}`).set("teacher");
        await waitFor(`tutor_public_teachers/${teacherId}`, value => value === null);
    } finally {
        await db.ref().update({
            [`tutor_requests/${requestId}`]: null,
            [`tutor_courses/${courseId}`]: null,
            [`tutor_course_stats/${courseId}`]: null,
            [`tutor_roles/${teacherId}`]: null,
            [`users/${teacherId}`]: null,
            [`tutor_verification/${teacherId}`]: null,
            [`tutor_public_teachers/${teacherId}`]: null
        });
        try { await auth.deleteUser(teacherId); }
        catch (error) { if (error.code !== "auth/user-not-found") throw error; }
        await deleteApp(app);
    }
});
