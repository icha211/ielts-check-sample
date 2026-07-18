import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { VerifyTokenFn } from "../types/auth";

function readBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

function sendUnauthorized(res: Response, message: string): void {
  res.status(401).json({ error: message });
}

function sendForbidden(res: Response, message: string): void {
  res.status(403).json({ error: message });
}

export function requireAuth(verifyToken: VerifyTokenFn): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = readBearerToken(req);
    if (!token) {
      sendUnauthorized(res, "Missing or invalid Authorization bearer token");
      return;
    }

    try {
      const decoded = await verifyToken(token);
      req.auth = decoded;
      next();
    } catch {
      sendUnauthorized(res, "Invalid authentication token");
    }
  };
}

function readUidFromLocation(
  req: Request,
  location: "body" | "params" | "query",
  key: string
): string {
  if (location === "body") {
    const value = (req.body as { [k: string]: unknown } | undefined)?.[key];
    return typeof value === "string" ? value.trim() : "";
  }

  if (location === "params") {
    const value = req.params[key];
    return typeof value === "string" ? value.trim() : "";
  }

  const value = req.query[key];
  return typeof value === "string" ? value.trim() : "";
}

export function requireUidMatch(
  location: "body" | "params" | "query",
  key = "uid"
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const authUid = String(req.auth?.uid || "").trim();
    const requestedUid = readUidFromLocation(req, location, key);

    if (!authUid) {
      sendUnauthorized(res, "Authenticated uid is missing");
      return;
    }

    if (!requestedUid) {
      sendForbidden(res, `Request must include ${key}`);
      return;
    }

    if (authUid !== requestedUid) {
      sendForbidden(res, "Authenticated user cannot access this uid");
      return;
    }

    next();
  };
}

export const requireUidMatchInBody = (key = "uid"): RequestHandler =>
  requireUidMatch("body", key);

export const requireUidMatchInParams = (key = "uid"): RequestHandler =>
  requireUidMatch("params", key);

export function requireDeveloper(req: Request, res: Response, next: NextFunction): void {
  const role = String(req.auth?.role || "").trim().toLowerCase();
  if (role !== "developer") {
    sendForbidden(res, "Developer role is required");
    return;
  }
  next();
}
