const assert = require("node:assert/strict");
const { test } = require("node:test");

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const namespace = "demo-toefl-messaging-default-rtdb";
function token(uid) {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none", typ: "JWT" })}.${encode({
        iss: "https://securetoken.google.com/demo-toefl-messaging",
        aud: "demo-toefl-messaging", sub: uid, user_id: uid,
        iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
        firebase: { sign_in_provider: "password" }
    })}.`;
}

test("Realtime Database messaging rules enforce participant-only reads and authenticated senders", { skip: !host }, async () => {
    async function request(path, { uid, owner = false, method = "GET", data } = {}) {
        const url = new URL(`http://${host}/${path}.json`);
        url.searchParams.set("ns", namespace);
        if (uid) url.searchParams.set("auth", token(uid));
        const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json", ...(owner ? { Authorization: "Bearer owner" } : {}) },
            body: data === undefined ? undefined : JSON.stringify(data)
        });
        return { status: response.status, data: await response.json() };
    }
    const profile = { displayName: "Learner", nationality: "ID", level: "B1", photoURL: "" };
    assert.equal((await request("partnerDirectory", { owner: true, method: "PUT", data: { alice: profile, bob: profile } })).status, 200);
    const message = { senderId: "alice", recipientId: "bob", text: "Hello", sentAt: { ".sv": "timestamp" } };
    const paths = {
        "user_messages/alice/bob/m1": message,
        "user_messages/bob/alice/m1": message
    };
    const contact = (status) => ({ status, updatedAt: { ".sv": "timestamp" } });
    const requestPaths = (from, to) => ({
        [`message_contacts/${from}/${to}`]: contact("outgoing"),
        [`message_contacts/${to}/${from}`]: contact("incoming")
    });
    const acceptPaths = (from, to) => ({
        [`message_contacts/${from}/${to}`]: contact("connected"),
        [`message_contacts/${to}/${from}`]: contact("connected")
    });
    const removePaths = (from, to) => ({
        [`message_contacts/${from}/${to}`]: null,
        [`message_contacts/${to}/${from}`]: null
    });

    assert.equal((await request("", { uid: "alice", method: "PATCH", data: paths })).status, 401, "messages need an accepted request");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: requestPaths("alice", "alice") })).status, 401, "no self request");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: requestPaths("alice", "missing") })).status, 401, "recipient must be listed");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: acceptPaths("alice", "bob") })).status, 401, "cannot skip the request");
    assert.equal((await request("message_contacts/alice/bob", { uid: "alice", method: "PUT", data: contact("outgoing") })).status, 401, "request must be mirrored");
    assert.equal((await request("", { uid: "mallory", method: "PATCH", data: requestPaths("alice", "bob") })).status, 401, "third party cannot request");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: { ...requestPaths("alice", "bob"), "message_contacts/alice/bob": { ...contact("outgoing"), extra: true } } })).status, 401);
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: { ...requestPaths("alice", "bob"), "message_contacts/alice/bob": { status: "outgoing", updatedAt: 1 } } })).status, 401);
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: requestPaths("alice", "bob") })).status, 200, "alice requests bob");
    assert.equal((await request("message_contacts/bob", { uid: "bob" })).data.alice.status, "incoming");
    assert.equal((await request("message_contacts/bob", { uid: "mallory" })).status, 401, "contacts are private");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: requestPaths("alice", "bob") })).status, 401, "no duplicate request");
    assert.equal((await request("", { uid: "bob", method: "PATCH", data: requestPaths("bob", "alice") })).status, 401, "no crossing request");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: paths })).status, 401, "pending request cannot message");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: acceptPaths("alice", "bob") })).status, 401, "requester cannot accept");
    assert.equal((await request("", { uid: "mallory", method: "PATCH", data: acceptPaths("bob", "alice") })).status, 401, "third party cannot accept");
    assert.equal((await request("message_contacts/bob/alice", { uid: "bob", method: "PUT", data: contact("connected") })).status, 401, "accept must be mirrored");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: removePaths("alice", "bob") })).status, 200, "requester can cancel");
    assert.equal((await request("message_contacts/bob", { uid: "bob" })).data, null);
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: requestPaths("alice", "bob") })).status, 200);
    assert.equal((await request("", { uid: "bob", method: "PATCH", data: removePaths("bob", "alice") })).status, 200, "recipient can decline");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: requestPaths("alice", "bob") })).status, 200);
    assert.equal((await request("", { uid: "bob", method: "PATCH", data: acceptPaths("bob", "alice") })).status, 200, "recipient accepts");
    assert.equal((await request("message_contacts/alice", { uid: "alice" })).data.bob.status, "connected");
    assert.equal((await request("", { uid: "bob", method: "PATCH", data: { "message_contacts/bob/alice": contact("incoming"), "message_contacts/alice/bob": contact("outgoing") } })).status, 401, "cannot roll back");
    assert.equal((await request("message_contacts/alice/bob", { uid: "alice", method: "DELETE" })).status, 401, "removal must be mirrored");

    assert.equal((await request("", { uid: "alice", method: "PATCH", data: paths })).status, 200);
    const received = await request("user_messages/bob", { uid: "bob" });
    assert.equal(received.status, 200);
    assert.equal(received.data.alice.m1.text, "Hello");
    const reply = { senderId: "bob", recipientId: "alice", text: "Hi Alice", sentAt: { ".sv": "timestamp" } };
    assert.equal((await request("", { uid: "bob", method: "PATCH", data: {
        "user_messages/bob/alice/r1": reply, "user_messages/alice/bob/r1": reply
    } })).status, 200, "accepted recipient can reply");
    assert.equal((await request("user_messages/alice", { uid: "alice" })).status, 200);
    assert.equal((await request("user_messages/bob", { uid: "mallory" })).status, 401);
    assert.equal((await request("user_messages/bob")).status, 401);
    assert.equal((await request("user_messages", { uid: "alice" })).status, 401);
    assert.equal((await request("user_messages/bob/alice/forged", {
        uid: "mallory", method: "PUT", data: message
    })).status, 401);
    assert.equal((await request("user_messages/bob/alice/m1", {
        uid: "alice", method: "PUT", data: { ...message, text: "Edited" }
    })).status, 401);
    assert.equal((await request("user_messages/bob/alice/m1", { uid: "bob", method: "DELETE" })).status, 401);
    for (const data of [
        { ...message, text: "x".repeat(2001) }, { ...message, text: "" },
        { ...message, sentAt: 1 }, { ...message, extra: true }, { ...message, senderId: "bob" }
    ]) {
        assert.equal((await request("user_messages/alice/bob/invalid", { uid: "alice", method: "PUT", data })).status, 401);
    }
    assert.equal((await request("message_preferences/alice/bob", {
        uid: "alice", method: "PATCH", data: { favorite: true, readAt: { ".sv": "timestamp" } }
    })).status, 200);
    assert.equal((await request("message_preferences/alice", { uid: "bob" })).status, 401);
    assert.equal((await request("message_preferences/alice/bob", {
        uid: "bob", method: "PATCH", data: { favorite: false }
    })).status, 401);
    assert.equal((await request("message_preferences/alice/bob", {
        uid: "alice", method: "PATCH", data: { role: "admin" }
    })).status, 401);
    assert.equal((await request("user_messages/alice/missing/m1", {
        uid: "alice", method: "PUT", data: { ...message, recipientId: "missing" }
    })).status, 401);
});
