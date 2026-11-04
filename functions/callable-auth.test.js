const { test } = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const { emulators } = require("../firebase.json");
const rules = require("../database.rules.json");

const enabled = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const projectId = "demo-toefl-messaging";
const callableHost = process.env.CALLABLE_AUTH_EMULATOR_HOST || `127.0.0.1:${emulators.functions.port}`;
assert.ok(enabled, "Run this suite with Firebase Auth, Database and Functions emulators.");

test("callable authentication and authorization protect privileged writes", { timeout: 180000 }, async t => {
    for (const host of [process.env.FIREBASE_AUTH_EMULATOR_HOST, process.env.FIREBASE_DATABASE_EMULATOR_HOST, callableHost]) {
        assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, "Authorization tests must only contact local emulators");
    }
    const app = initializeApp({ projectId, databaseURL: `https://${projectId}.firebaseio.com` }, "callable-auth-test");
    const auth = getAuth(app), db = getDatabase(app);
    const prefix = `auth-test-${Date.now()}`;
    const ids = ["teacher", "student", "unverified", "moderator", "wrong-email", "wrong-role", "anonymous"];
    const uid = name => `${prefix}-${name}`;
    const postId = `${prefix}-post`, reportId = `${prefix}-report`;
    const tokens = {};
    const protectedPaths = [
        ...ids.flatMap(name => [`tutor_verification/${uid(name)}`, `community_security/rateLimits/${uid(name)}`]),
        `community_posts/${postId}`, `community_private_posts/${uid("teacher")}/${postId}`,
        `community_comments/${postId}`, `community_private_comments/${uid("teacher")}/${postId}`,
        `community_reports/${reportId}`
    ];
    async function signIn(body, method) {
        const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:${method}?key=emulator-only`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000)
        });
        const result = await response.json();
        assert.equal(response.status, 200, JSON.stringify(result.error));
        return result;
    }
    async function call(name, token, data = {}) {
        const response = await fetch(`http://${callableHost}/${projectId}/asia-southeast1/${name}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ data }), signal: AbortSignal.timeout(60000)
        });
        return { status: response.status, body: await response.json() };
    }
    async function protectedState() {
        return Promise.all(protectedPaths.map(async path => [path, (await db.ref(path).get()).val()]));
    }
    async function denied(name, token, data, code) {
        const before = await protectedState();
        const response = await call(name, token, data);
        assert.equal(response.body.error?.status, code, `${name}: ${JSON.stringify(response)}`);
        assert.equal(response.status, code === "UNAUTHENTICATED" ? 401 : code === "FAILED_PRECONDITION" ? 400 : 403);
        assert.deepEqual(await protectedState(), before, `${name}: denied calls must not change protected data`);
    }
    try {
        const rulesResponse = await fetch(`http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/.settings/rules.json?ns=${projectId}`, {
            method: "PUT", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
            body: JSON.stringify(rules), signal: AbortSignal.timeout(10000)
        });
        assert.equal(rulesResponse.status, 200, "Load the repository rules into the Functions emulator database namespace");
        for (const name of ids.filter(name => !["anonymous", "wrong-role"].includes(name))) {
            await auth.createUser({
                uid: uid(name), email: name === "moderator" ? "quickcheck.edu@gmail.com" : `${name}@example.test`,
                emailVerified: name !== "unverified", displayName: `Test ${name}`
            });
            if (name === "moderator") {
                const result = await signIn({ token: await auth.createCustomToken(uid(name)), returnSecureToken: true }, "signInWithCustomToken");
                tokens["wrong-role"] = result.idToken;
            }
            if (["moderator", "wrong-email"].includes(name)) await auth.setCustomUserClaims(uid(name), { role: "developer" });
            const result = await signIn({ token: await auth.createCustomToken(uid(name)), returnSecureToken: true }, "signInWithCustomToken");
            tokens[name] = result.idToken;
        }
        const anonymous = await signIn({ returnSecureToken: true }, "signUp");
        tokens.anonymous = anonymous.idToken;
        tokens.anonymousUid = anonymous.localId;
        protectedPaths.push(`community_security/rateLimits/${anonymous.localId}`, `tutor_verification/${anonymous.localId}`);
        await db.ref().update({
            [`tutor_roles/${uid("teacher")}`]: "teacher",
            [`tutor_verification/${uid("teacher")}`]: { status: "pending", requestedAt: 1 },
            [`community_posts/${postId}`]: { authorId: uid("teacher"), body: "Test post" },
            [`community_private_posts/${uid("teacher")}/${postId}`]: { authorId: uid("teacher"), body: "Private test post" },
            [`community_reports/${reportId}`]: {
                status: "open", targetType: "post", postId, targetId: postId,
                postLocation: `community_posts/${postId}`, targetAuthorId: uid("teacher")
            }
        });
        const operations = {
            requestTutorVerification: {},
            getTutorVerificationStatus: { uid: uid("teacher") },
            listTutorVerificationRequests: {},
            reviewTutorVerification: { uid: uid("teacher"), status: "verified", reviewerNote: "Reviewed" },
            publishCommunityPost: { postId, post: { title: "Test", body: "Test body", category: "tips" } },
            createCommunityComment: { postId, postLocation: `community_posts/${postId}`, body: "Test comment" },
            createCommunityReport: { postId, postLocation: `community_posts/${postId}`, targetType: "post", reason: "spam" },
            moderateCommunityReport: { reportId, action: "remove" }
        };
        for (const [name, data] of Object.entries(operations)) {
            await t.test(`${name} rejects missing, anonymous, unverified and invalid tokens`, async () => {
                await denied(name, null, data, "UNAUTHENTICATED");
                await denied(name, tokens.anonymous, data, "UNAUTHENTICATED");
                await denied(name, tokens.unverified, data, "PERMISSION_DENIED");
                await denied(name, "invalid-token", data, "UNAUTHENTICATED");
            });
        }
        for (const name of ["listTutorVerificationRequests", "reviewTutorVerification", "moderateCommunityReport"]) {
            await t.test(`${name} rejects ordinary accounts and incomplete moderator claims`, async () => {
                for (const caller of ["teacher", "student", "wrong-email", "wrong-role"]) {
                    await denied(name, tokens[caller], operations[name], "PERMISSION_DENIED");
                }
            });
        }
        await t.test("students cannot request tutor review or read another tutor's status", async () => {
            await denied("requestTutorVerification", tokens.student, {}, "FAILED_PRECONDITION");
            const response = await call("getTutorVerificationStatus", tokens.student, { uid: uid("teacher") });
            assert.equal(response.status, 200);
            assert.deepEqual(response.body.result, { status: "not_requested" });
        });
        await t.test("private posts and account blocks deny comments and reports before writes", async () => {
            for (const name of ["createCommunityComment", "createCommunityReport"]) {
                await denied(name, tokens.student, {
                    ...operations[name], postLocation: `community_private_posts/${uid("teacher")}/${postId}`
                }, "PERMISSION_DENIED");
            }
            await db.ref(`community_blocks/${uid("teacher")}/${uid("student")}`).set(true);
            for (const name of ["createCommunityComment", "createCommunityReport"]) {
                await denied(name, tokens.student, operations[name], "PERMISSION_DENIED");
            }
        });
        await t.test("verified tutors can request review and only the moderator can decide", async () => {
            await db.ref(`tutor_verification/${uid("teacher")}`).remove();
            const requested = await call("requestTutorVerification", tokens.teacher);
            assert.equal(requested.status, 200);
            assert.equal(requested.body.result.status, "pending");
            const listed = await call("listTutorVerificationRequests", tokens.moderator);
            assert.equal(listed.status, 200);
            assert.ok(listed.body.result.requests.some(row => row.uid === uid("teacher")));
            const reviewed = await call("reviewTutorVerification", tokens.moderator, operations.reviewTutorVerification);
            assert.equal(reviewed.status, 200);
            const record = (await db.ref(`tutor_verification/${uid("teacher")}`).get()).val();
            assert.equal(record.status, "verified");
            assert.equal(record.reviewedBy, uid("moderator"));
            await denied("reviewTutorVerification", tokens.moderator, operations.reviewTutorVerification, "FAILED_PRECONDITION");
            await denied("reviewTutorVerification", tokens.moderator, {
                ...operations.reviewTutorVerification, uid: uid("student")
            }, "FAILED_PRECONDITION");
            const status = await call("getTutorVerificationStatus", tokens.teacher);
            assert.equal(status.status, 200);
            assert.equal(status.body.result.reviewerNote, "");
        });
        await t.test("authorized moderation succeeds and records the moderator", async () => {
            const response = await call("moderateCommunityReport", tokens.moderator, operations.moderateCommunityReport);
            assert.equal(response.status, 200);
            assert.equal(response.body.result.status, "removed");
            assert.equal((await db.ref(`community_reports/${reportId}/reviewedBy`).get()).val(), uid("moderator"));
            assert.equal(typeof (await db.ref(`community_posts/${postId}/deletedAt`).get()).val(), "number");
        });
    } finally {
        await db.ref().update(Object.fromEntries([
            ...protectedPaths,
            ...ids.flatMap(name => [`tutor_roles/${uid(name)}`, `tutor_public_teachers/${uid(name)}`]),
            `community_blocks/${uid("teacher")}/${uid("student")}`
        ].map(path => [path, null])));
        for (const id of [...ids.filter(name => name !== "anonymous").map(uid), tokens.anonymousUid].filter(Boolean)) {
            try { await auth.deleteUser(id); }
            catch (error) { if (error.code !== "auth/user-not-found") throw error; }
        }
        await deleteApp(app);
    }
});
