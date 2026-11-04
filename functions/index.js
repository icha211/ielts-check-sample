const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { onValueWritten } = require("firebase-functions/v2/database");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const { publicTeacher, enrollmentStats } = require("./marketplace");
const communityModeration = require("./community-moderation");
const marketplaceVerification = require("./marketplace-verification");
const communityExplore = require("./community-explore");

initializeApp();
setGlobalOptions({ region: process.env.FUNCTIONS_EMULATOR === "true" ? "us-central1" : "asia-southeast1" });

exports.marketplaceEnrollmentStats = onValueWritten({ ref: "/tutor_requests/{requestId}", retry: true, maxInstances: 5 }, async event => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const courseId = after?.courseId || before?.courseId;
    if (!courseId) throw new Error("Enrollment event has no course ID.");
    const revision = after?.updatedAt || Date.parse(event.time);
    if (!Number.isFinite(revision)) throw new Error("Enrollment event has no valid revision.");
    await event.data.after.ref.root.child(`tutor_course_stats/${courseId}`).transaction(current =>
        enrollmentStats(current, event.params.requestId, after, revision));
});

exports.marketplaceCourseStats = onValueWritten({ ref: "/tutor_courses/{courseId}", retry: true, maxInstances: 5 }, async event => {
    if (!event.data.after.exists()) return;
    await event.data.after.ref.root.child(`tutor_course_stats/${event.params.courseId}`).transaction(
        current => current || { students: 0 });
});

async function syncTeacher(uid, root) {
    const [role, user, verification] = await Promise.all([
        root.child(`tutor_roles/${uid}`).get(),
        root.child(`users/${uid}`).get(),
        root.child(`tutor_verification/${uid}`).get()
    ]);
    if (role.val() !== "teacher") {
        await root.child(`tutor_public_teachers/${uid}`).remove();
        return;
    }
    let account;
    try { account = await getAuth().getUser(uid); }
    catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
        logger.warn("Removing public teacher identity for a missing account.", { uid });
        await root.child(`tutor_public_teachers/${uid}`).remove();
        return;
    }
    await root.child(`tutor_public_teachers/${uid}`).set(publicTeacher({
        displayName: account.displayName, photoURL: account.photoURL,
        ...user.val(), verified: verification.val()?.status === "verified"
    }));
}

exports.marketplaceTeacherIdentity = onValueWritten({ ref: "/users/{uid}", retry: true, maxInstances: 5 }, event => syncTeacher(event.params.uid, event.data.after.ref.root));
exports.marketplaceTeacherRole = onValueWritten({ ref: "/tutor_roles/{uid}", retry: true, maxInstances: 5 }, event => syncTeacher(event.params.uid, event.data.after.ref.root));
exports.marketplaceTeacherVerification = onValueWritten({ ref: "/tutor_verification/{uid}", retry: true, maxInstances: 5 }, event => syncTeacher(event.params.uid, event.data.after.ref.root));
exports.publishCommunityPost = communityModeration.publishCommunityPost;
exports.createCommunityComment = communityModeration.createCommunityComment;
exports.createCommunityReport = communityModeration.createCommunityReport;
exports.moderateCommunityReport = communityModeration.moderateCommunityReport;
exports.requestTutorVerification = marketplaceVerification.requestTutorVerification;
exports.getTutorVerificationStatus = marketplaceVerification.getTutorVerificationStatus;
exports.listTutorVerificationRequests = marketplaceVerification.listTutorVerificationRequests;
exports.reviewTutorVerification = marketplaceVerification.reviewTutorVerification;
exports.getExploreFeed = communityExplore.getExploreFeed;
exports.getExploreSetup = communityExplore.getExploreSetup;
exports.saveExplorePreferences = communityExplore.saveExplorePreferences;
exports.recordExploreInteraction = communityExplore.recordExploreInteraction;
