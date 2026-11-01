import { auth, db } from "./firebase-config.js";
import { ref, get, set, update, push, onValue, query, orderByChild, equalTo, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { validateCourse, validateTeachingProfile } from "./tutor-model.js?v=20261101-teacher";

function user() {
    if (!auth.currentUser) throw new Error("Sign in to continue.");
    return auth.currentUser;
}
export async function registerMarketplaceRole(role) {
    if (!["student", "teacher"].includes(role)) throw new Error("Choose Student or Teacher.");
    const target = ref(db, `tutor_roles/${user().uid}`);
    const existing = await get(target);
    if (existing.val() === "teacher" || existing.val() === role) return;
    await set(target, role);
}
export const watchCatalog = (callback, error) => onValue(ref(db, "tutor_courses"), snap => callback(snap.val() || {}), error);
export const watchReviews = (callback, error) => onValue(ref(db, "tutor_reviews"), snap => callback(snap.val() || {}), error);
export const watchTeachingRole = (uid, callback, error) => onValue(ref(db, `tutor_roles/${uid}`), snap => callback(snap.val() === "teacher"), error);
export const watchTeachingProfile = (uid, callback, error) => onValue(ref(db, `tutor_profiles/${uid}`), snap => callback(snap.val() || {}), error);
export async function saveTeachingProfile(input) {
    const current = user();
    if ((await get(ref(db, `tutor_roles/${current.uid}`))).val() !== "teacher") throw new Error("Only teachers can edit a teaching profile.");
    await set(ref(db, `tutor_profiles/${current.uid}`), { ...validateTeachingProfile(input), updatedAt: serverTimestamp() });
}
export function watchAccount(uid, callbacks, error) {
    const stops = [
        onValue(ref(db, `tutor_roles/${uid}`), snap => callbacks.role(snap.val() || "student"), error),
        onValue(ref(db, `tutor_library/${uid}`), snap => callbacks.library(snap.val() || {}), error),
        onValue(query(ref(db, "tutor_requests"), orderByChild("studentId"), equalTo(uid)), snap => callbacks.requests(snap.val() || {}), error),
        onValue(query(ref(db, "tutor_requests"), orderByChild("teacherId"), equalTo(uid)), snap => callbacks.inbox(snap.val() || {}), error)
    ];
    return () => stops.forEach(stop => stop());
}
export async function saveCourse(input, id) {
    const current = user();
    if ((await get(ref(db, `tutor_roles/${current.uid}`))).val() !== "teacher") throw new Error("Register as a teacher before publishing.");
    const course = validateCourse(input);
    if (id) {
        const target = ref(db, `tutor_courses/${id}`);
        const existing = (await get(target)).val();
        if (!existing || existing.teacherId !== current.uid) throw new Error("You can only edit your own courses.");
        await update(target, { ...course, updatedAt: serverTimestamp() });
        return id;
    }
    const target = push(ref(db, "tutor_courses"));
    await set(target, { ...course, teacherId: current.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return target.key;
}
export async function toggleLibrary(kind, id, enabled) {
    if (!["cart", "favorites"].includes(kind)) throw new Error("Invalid library action.");
    await set(ref(db, `tutor_library/${user().uid}/${kind}/${id}`), enabled ? true : null);
}
export async function requestEnrollment(course) {
    const current = user();
    if (current.uid === course.teacherId) throw new Error("You cannot enroll in your own course.");
    const id = `${course.id}_${current.uid}`;
    const existing = (await get(query(ref(db, "tutor_requests"), orderByChild("studentId"), equalTo(current.uid)))).val() || {};
    if (existing[id]) throw new Error("You already requested this course. Check My requests.");
    await set(ref(db, `tutor_requests/${id}`), {
        courseId: course.id, studentId: current.uid, teacherId: course.teacherId,
        studentName: (current.displayName || "Learner").slice(0, 100),
        price: course.price, status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
}
export async function changeRequest(id, status) {
    user();
    if (!["accepted", "declined", "cancelled"].includes(status)) throw new Error("Invalid request status.");
    await update(ref(db, `tutor_requests/${id}`), { status, updatedAt: serverTimestamp() });
}
export async function submitReview(courseId, rating, text) {
    const current = user();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !text.trim() || text.trim().length > 1000) throw new Error("Choose 1-5 stars and write a review up to 1,000 characters.");
    await set(ref(db, `tutor_reviews/${courseId}/${current.uid}`), {
        rating, text: text.trim(), studentName: (current.displayName || "Learner").slice(0, 100), updatedAt: serverTimestamp()
    });
}
