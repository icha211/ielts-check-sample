"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
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
