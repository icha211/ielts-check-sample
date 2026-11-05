const { getDatabase } = require("firebase-admin/database");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { releaseSeat, reserveSeat } = require("./marketplace-enrollment-policy");

const FUNCTION_REGION = "asia-southeast1";
const db = () => getDatabase();

function signedIn(request) {
    const auth = request.auth;
    if (!auth?.uid || auth.token.firebase?.sign_in_provider === "anonymous") {
        throw new HttpsError("unauthenticated", "Sign in to continue.");
    }
    return auth;
}

async function reserveCourseSeat(courseId, requestId, capacity) {
    let outcome = "";
    const result = await db().ref(`tutor_course_stats/${courseId}`).transaction(current => {
        const decision = reserveSeat(current || {}, requestId, capacity);
        outcome = decision.reason;
        return decision.reason ? undefined : decision.state;
    }, undefined, false);
    if (result.committed) return true;
    if (outcome === "full") throw new HttpsError("resource-exhausted", "This course is full and cannot accept more enrollment requests.");
    if (outcome === "already-reserved") return false;
    throw new HttpsError("aborted", "A course seat could not be reserved. Please try again.");
}

async function releaseCourseSeat(courseId, requestId) {
    await db().ref(`tutor_course_stats/${courseId}`).transaction(current => current
        ? releaseSeat(current, requestId)
        : current, undefined, false);
}

exports.createEnrollmentRequest = onCall({ region: FUNCTION_REGION, maxInstances: 10 }, async request => {
    const auth = signedIn(request);
    const courseId = String(request.data?.courseId || "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(courseId)) throw new HttpsError("invalid-argument", "Choose a valid course.");
    const course = (await db().ref(`tutor_courses/${courseId}`).get()).val();
    if (!course?.published || course.archived) throw new HttpsError("failed-precondition", "This course is no longer open for enrollment.");
    if (course.teacherId === auth.uid) throw new HttpsError("permission-denied", "You cannot enroll in your own course.");

    const requestId = `${courseId}_${auth.uid}`;
    const requestRef = db().ref(`tutor_requests/${requestId}`);
    if ((await requestRef.get()).exists()) throw new HttpsError("already-exists", "You already requested this course. Check My classes in the Marketplace.");
    const capacity = Number.isSafeInteger(course.maxStudents) && course.maxStudents > 0 ? course.maxStudents : 0;
    await reserveCourseSeat(courseId, requestId, capacity);

    const now = Date.now();
    const result = await requestRef.transaction(current => current || {
        courseId, studentId: auth.uid, teacherId: course.teacherId,
        studentName: String(auth.token.name || "Learner").slice(0, 100),
        price: course.price, status: "pending", createdAt: now, updatedAt: now
    }, undefined, false);
    if (result.committed) return { requestId };
    if (result.snapshot.exists()) throw new HttpsError("already-exists", "You already requested this course. Check My classes in the Marketplace.");
    await releaseCourseSeat(courseId, requestId);
    throw new HttpsError("aborted", "Your enrollment request could not be saved. Please try again.");
});

exports.changeEnrollmentRequest = onCall({ region: FUNCTION_REGION, maxInstances: 10 }, async request => {
    const auth = signedIn(request);
    const requestId = String(request.data?.requestId || "");
    const status = String(request.data?.status || "");
    if (!/^[A-Za-z0-9_-]{1,260}$/.test(requestId) || !["accepted", "declined", "cancelled"].includes(status)) {
        throw new HttpsError("invalid-argument", "Choose a valid enrollment action.");
    }
    const requestRef = db().ref(`tutor_requests/${requestId}`);
    const current = (await requestRef.get()).val();
    if (!current) throw new HttpsError("not-found", "This enrollment request no longer exists.");
    const canChange = status === "cancelled"
        ? current.studentId === auth.uid
        : current.teacherId === auth.uid;
    if (!canChange) throw new HttpsError("permission-denied", "You cannot change this enrollment request.");
    if (current.status !== "pending") throw new HttpsError("failed-precondition", "This enrollment request is no longer pending.");

    let reservedNow = false;
    if (status === "accepted") {
        const course = (await db().ref(`tutor_courses/${current.courseId}`).get()).val();
        const capacity = Number.isSafeInteger(course?.maxStudents) && course.maxStudents > 0 ? course.maxStudents : 0;
        reservedNow = await reserveCourseSeat(current.courseId, requestId, capacity);
    }
    const result = await requestRef.transaction(value => {
        if (!value || value.status !== "pending") return;
        if (status === "cancelled" ? value.studentId !== auth.uid : value.teacherId !== auth.uid) return;
        return { ...value, status, updatedAt: Date.now() };
    }, undefined, false);
    if (!result.committed) {
        if (reservedNow) {
            const latest = (await requestRef.get()).val();
            if (latest?.status !== "accepted") await releaseCourseSeat(current.courseId, requestId);
        }
        throw new HttpsError("failed-precondition", "This enrollment request changed before your action was saved.");
    }
    if (status === "declined" || status === "cancelled") await releaseCourseSeat(current.courseId, requestId);
    return { status };
});
