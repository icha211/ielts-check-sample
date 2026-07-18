import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { onRequest } from "firebase-functions/v2/https";

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
