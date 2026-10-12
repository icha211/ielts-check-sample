import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";

import { createApiApp } from "./app";
import type { VerifyTokenFn } from "./types/auth";

if (!getApps().length) {
  initializeApp();
}

const verifyToken: VerifyTokenFn = async (token) => {
  return getAuth().verifyIdToken(token);
};

const app = createApiApp(verifyToken);

export const api = onRequest(
  {
    region: "australia-southeast1",
    memory: "256MiB",
    timeoutSeconds: 60,
    cors: true,
  },
  app
);

export const ensureDeveloperRole = onCall(
  { region: "australia-southeast1" },
  async (request) => {
    const uid = request.auth?.uid;
    const email = String(request.auth?.token.email || "").trim().toLowerCase();
    const emailVerified = request.auth?.token.email_verified === true;

    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in before requesting developer access.");
    }
    if (email !== "quickcheck.edu@gmail.com" || !emailVerified) {
      throw new HttpsError(
        "permission-denied",
        "Developer access requires the verified quickcheck.edu@gmail.com account."
      );
    }

    const adminAuth = getAuth();
    const user = await adminAuth.getUser(uid);
    await adminAuth.setCustomUserClaims(uid, {
      ...user.customClaims,
      role: "developer",
    });

    return { role: "developer" };
  }
);
