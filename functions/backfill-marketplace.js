const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");
const { publicTeacher, enrollmentStats } = require("./marketplace");

if (!process.env.FIREBASE_DATABASE_URL) throw new Error("Set FIREBASE_DATABASE_URL before backfilling.");
initializeApp({ credential: applicationDefault(), databaseURL: process.env.FIREBASE_DATABASE_URL });

async function main() {
    const db = getDatabase();
    const [courses, roles] = await Promise.all([db.ref("tutor_courses").get(), db.ref("tutor_roles").get()]);
    for (const [courseId] of Object.entries(courses.val() || {})) {
        const requests = await db.ref("tutor_requests").orderByChild("courseId").equalTo(courseId).get();
        await db.ref(`tutor_course_stats/${courseId}`).transaction(current => {
            let state = current || { students: 0, records: {} };
            for (const [id, request] of Object.entries(requests.val() || {})) {
                state = enrollmentStats(state, id, request, request.updatedAt);
            }
            return state;
        });
    }
    for (const [uid, role] of Object.entries(roles.val() || {})) {
        if (role !== "teacher") continue;
        const user = await db.ref(`users/${uid}`).get();
        const account = await getAuth().getUser(uid);
        await db.ref(`tutor_public_teachers/${uid}`).set(publicTeacher({
            displayName: account.displayName, photoURL: account.photoURL, ...user.val()
        }));
    }
    console.log("Marketplace enrollment totals and public teacher identities backfilled.");
}

main().then(() => process.exit(0)).catch(error => {
    console.error("Marketplace backfill failed:", error);
    process.exit(1);
});
