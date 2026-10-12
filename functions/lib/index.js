"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDeveloperRole = exports.api = void 0;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const https_1 = require("firebase-functions/v2/https");
const app_2 = require("./app");
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const verifyToken = async (token) => {
    return (0, auth_1.getAuth)().verifyIdToken(token);
};
const app = (0, app_2.createApiApp)(verifyToken);
exports.api = (0, https_1.onRequest)({
    region: "australia-southeast1",
    memory: "256MiB",
    timeoutSeconds: 60,
    cors: true,
}, app);
exports.ensureDeveloperRole = (0, https_1.onCall)({ region: "australia-southeast1" }, async (request) => {
    const uid = request.auth?.uid;
    const email = String(request.auth?.token.email || "").trim().toLowerCase();
    const emailVerified = request.auth?.token.email_verified === true;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "Sign in before requesting developer access.");
    }
    if (email !== "quickcheck.edu@gmail.com" || !emailVerified) {
        throw new https_1.HttpsError("permission-denied", "Developer access requires the verified quickcheck.edu@gmail.com account.");
    }
    const adminAuth = (0, auth_1.getAuth)();
    const user = await adminAuth.getUser(uid);
    await adminAuth.setCustomUserClaims(uid, {
        ...user.customClaims,
        role: "developer",
    });
    return { role: "developer" };
});
