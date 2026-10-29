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
    const contact = (status, requesterId) => ({ status, requesterId, updatedAt: { ".sv": "timestamp" } });
    const requestPaths = (from, to) => ({
        [`message_contacts/${from}/${to}`]: contact("outgoing", from),
        [`message_contacts/${to}/${from}`]: contact("incoming", from)
    });
    const acceptPaths = (from, to) => ({
        [`message_contacts/${from}/${to}`]: contact("connected", to),
        [`message_contacts/${to}/${from}`]: contact("connected", to)
    });
    const removePaths = (from, to) => ({
        [`message_contacts/${from}/${to}`]: null,
        [`message_contacts/${to}/${from}`]: null
    });

    assert.equal((await request("", { uid: "alice", method: "PATCH", data: paths })).status, 401, "messages need an accepted request");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: requestPaths("alice", "alice") })).status, 401, "no self request");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: requestPaths("alice", "missing") })).status, 401, "recipient must be listed");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: acceptPaths("alice", "bob") })).status, 401, "cannot skip the request");
    assert.equal((await request("message_contacts/alice/bob", { uid: "alice", method: "PUT", data: contact("outgoing", "alice") })).status, 401, "request must be mirrored");
    assert.equal((await request("", { uid: "mallory", method: "PATCH", data: requestPaths("alice", "bob") })).status, 401, "third party cannot request");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: { ...requestPaths("alice", "bob"), "message_contacts/alice/bob": { ...contact("outgoing", "alice"), extra: true } } })).status, 401);
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: { ...requestPaths("alice", "bob"), "message_contacts/alice/bob": { status: "outgoing", requesterId: "alice", updatedAt: 1 } } })).status, 401);
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: { ...requestPaths("alice", "bob"), "message_contacts/bob/alice": contact("incoming", "bob") } })).status, 401, "requester id cannot be forged");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: { ...requestPaths("alice", "bob"), "message_contacts/alice/bob": { status: "outgoing", updatedAt: { ".sv": "timestamp" } } } })).status, 401, "requester id is required");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: requestPaths("alice", "bob") })).status, 200, "alice requests bob");
    assert.equal((await request("message_contacts/bob", { uid: "bob" })).data.alice.status, "incoming");
    assert.equal((await request("message_contacts/bob", { uid: "mallory" })).status, 401, "contacts are private");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: requestPaths("alice", "bob") })).status, 401, "no duplicate request");
    assert.equal((await request("", { uid: "bob", method: "PATCH", data: requestPaths("bob", "alice") })).status, 401, "no crossing request");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: paths })).status, 401, "pending request cannot message");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: acceptPaths("alice", "bob") })).status, 401, "requester cannot accept");
    assert.equal((await request("", { uid: "mallory", method: "PATCH", data: acceptPaths("bob", "alice") })).status, 401, "third party cannot accept");
    assert.equal((await request("message_contacts/bob/alice", { uid: "bob", method: "PUT", data: contact("connected", "alice") })).status, 401, "accept must be mirrored");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: removePaths("alice", "bob") })).status, 200, "requester can cancel");
    assert.equal((await request("message_contacts/bob", { uid: "bob" })).data, null);
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: requestPaths("alice", "bob") })).status, 200);
    assert.equal((await request("", { uid: "bob", method: "PATCH", data: removePaths("bob", "alice") })).status, 200, "recipient can decline");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: requestPaths("alice", "bob") })).status, 200);
    assert.equal((await request("", { uid: "bob", method: "PATCH", data: { "message_contacts/bob/alice": contact("connected", "bob"), "message_contacts/alice/bob": contact("connected", "bob") } })).status, 401, "accepting cannot steal the requester id");
    assert.equal((await request("", { uid: "bob", method: "PATCH", data: acceptPaths("bob", "alice") })).status, 200, "recipient accepts");
    assert.equal((await request("message_contacts/alice", { uid: "alice" })).data.bob.requesterId, "alice", "requester is told who accepted");
    assert.equal((await request("message_contacts/alice", { uid: "alice" })).data.bob.status, "connected");
    assert.equal((await request("", { uid: "bob", method: "PATCH", data: { "message_contacts/bob/alice": contact("incoming", "alice"), "message_contacts/alice/bob": contact("outgoing", "alice") } })).status, 401, "cannot roll back");
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
    const sentAt = received.data.alice.m1.sentAt;
    const edit = {
        "user_messages/alice/bob/m1/text": "Revised",
        "user_messages/bob/alice/m1/text": "Revised",
        "user_messages/alice/bob/m1/editedAt": { ".sv": "timestamp" },
        "user_messages/bob/alice/m1/editedAt": { ".sv": "timestamp" }
    };
    for (const uid of ["bob", "mallory"]) {
        assert.equal((await request("", { uid, method: "PATCH", data: edit })).status, 401, "only sender edits");
    }
    assert.equal((await request("user_messages/alice/bob/m1", {
        uid: "alice", method: "PATCH", data: { text: "One sided", editedAt: { ".sv": "timestamp" } }
    })).status, 401, "edit must be mirrored");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: {
        ...edit, "user_messages/bob/alice/m1/text": "Different"
    } })).status, 401, "copies must match");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: {
        ...edit, "user_messages/alice/bob/m1/sentAt": 1, "user_messages/bob/alice/m1/sentAt": 1
    } })).status, 401, "send time is immutable");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: edit })).status, 200);
    const edited = (await request("user_messages/bob/alice/m1", { uid: "bob" })).data;
    assert.equal(edited.text, "Revised");
    assert.equal(edited.sentAt, sentAt);
    assert.equal(typeof edited.editedAt, "number");
    const receipt = { readAt: sentAt };
    assert.equal((await request("message_receipts/alice/bob", { uid: "alice", method: "PUT", data: receipt })).status, 401, "sender cannot mark their own message read");
    assert.equal((await request("message_receipts/alice/bob", { uid: "mallory", method: "PUT", data: receipt })).status, 401);
    assert.equal((await request("message_receipts/alice/bob", { uid: "bob", method: "PUT", data: receipt })).status, 200);
    assert.equal((await request("message_receipts/alice", { uid: "alice" })).data.bob.readAt, sentAt);
    assert.equal((await request("message_receipts/alice", { uid: "mallory" })).status, 401);
    assert.equal((await request("message_receipts/alice", { uid: "bob" })).status, 401);
    for (const data of [{ readAt: sentAt - 1 }, { readAt: Date.now() + 86400000 }, { ...receipt, extra: true }]) {
        assert.equal((await request("message_receipts/alice/bob", { uid: "bob", method: "PUT", data })).status, 401);
    }
    assert.equal((await request("message_receipts/alice/bob", { uid: "bob", method: "DELETE" })).status, 401);
    const deletion = {
        "user_messages/alice/bob/m1/text": "Message deleted",
        "user_messages/bob/alice/m1/text": "Message deleted",
        "user_messages/alice/bob/m1/deletedAt": { ".sv": "timestamp" },
        "user_messages/bob/alice/m1/deletedAt": { ".sv": "timestamp" }
    };
    assert.equal((await request("", { uid: "bob", method: "PATCH", data: deletion })).status, 401, "recipient cannot delete for sender");
    assert.equal((await request("user_messages/alice/bob/m1", { uid: "alice", method: "DELETE" })).status, 401, "no hard deletion");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: deletion })).status, 200);
    assert.equal((await request("user_messages/bob/alice/m1", { uid: "bob" })).data.text, "Message deleted");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: edit })).status, 401, "deleted messages cannot be edited");
    assert.equal((await request("", { uid: "alice", method: "PATCH", data: {
        "user_messages/alice/bob/m1/deletedAt": null, "user_messages/bob/alice/m1/deletedAt": null
    } })).status, 401, "cannot restore a deleted message");
    assert.equal((await request("user_messages/alice/missing/m1", {
        uid: "alice", method: "PUT", data: { ...message, recipientId: "missing" }
    })).status, 401);

    const seen = { acceptedSeenAt: { ".sv": "timestamp" } };
    assert.equal((await request("notification_state/alice", { uid: "alice", method: "PUT", data: seen })).status, 200, "owner marks notifications seen");
    assert.equal(typeof (await request("notification_state/alice", { uid: "alice" })).data.acceptedSeenAt, "number");
    assert.equal((await request("notification_state/alice", { uid: "bob" })).status, 401, "notification state is private");
    assert.equal((await request("notification_state/alice", { uid: "bob", method: "PUT", data: seen })).status, 401);
    assert.equal((await request("notification_state/alice", { uid: "alice", method: "PUT", data: { acceptedSeenAt: Date.now() + 86400000 } })).status, 401, "no future seen time");
    assert.equal((await request("notification_state/alice", { uid: "alice", method: "PUT", data: { ...seen, extra: true } })).status, 401);
});
