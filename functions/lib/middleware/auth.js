"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireUidMatchInParams = exports.requireUidMatchInBody = void 0;
exports.requireAuth = requireAuth;
exports.requireUidMatch = requireUidMatch;
exports.requireDeveloper = requireDeveloper;
function readBearerToken(req) {
    const header = req.header("authorization");
    if (!header)
        return null;
    const [scheme, token] = header.split(" ");
    if (!scheme || !token)
        return null;
    if (scheme.toLowerCase() !== "bearer")
        return null;
    return token.trim() || null;
}
function sendUnauthorized(res, message) {
    res.status(401).json({ error: message });
}
function sendForbidden(res, message) {
    res.status(403).json({ error: message });
}
function requireAuth(verifyToken) {
    return async (req, res, next) => {
        const token = readBearerToken(req);
        if (!token) {
            sendUnauthorized(res, "Missing or invalid Authorization bearer token");
            return;
        }
        try {
            const decoded = await verifyToken(token);
            req.auth = decoded;
            next();
        }
        catch {
            sendUnauthorized(res, "Invalid authentication token");
        }
    };
}
function readUidFromLocation(req, location, key) {
    if (location === "body") {
        const value = req.body?.[key];
        return typeof value === "string" ? value.trim() : "";
    }
    if (location === "params") {
        const value = req.params[key];
        return typeof value === "string" ? value.trim() : "";
    }
    const value = req.query[key];
    return typeof value === "string" ? value.trim() : "";
}
function requireUidMatch(location, key = "uid") {
    return (req, res, next) => {
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
const requireUidMatchInBody = (key = "uid") => requireUidMatch("body", key);
exports.requireUidMatchInBody = requireUidMatchInBody;
const requireUidMatchInParams = (key = "uid") => requireUidMatch("params", key);
exports.requireUidMatchInParams = requireUidMatchInParams;
function requireDeveloper(req, res, next) {
    const role = String(req.auth?.role || "").trim().toLowerCase();
    if (role !== "developer") {
        sendForbidden(res, "Developer role is required");
        return;
    }
    next();
}
