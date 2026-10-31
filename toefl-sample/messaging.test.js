const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "js", "messaging.js"), "utf8")
    .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");

function fixture() {
    let authChanged;
    let authError;
    let failure = null;
    const listeners = new Set();
    const writes = [];
    const auth = { currentUser: null };
    const context = vm.createContext({
        auth, db: {},
        ref: (_, value = "") => value,
        push: () => ({ key: "new-message" }),
        serverTimestamp: () => ({ ".sv": "timestamp" }),
        onAuthStateChanged(_, callback, error) {
            authChanged = callback;
            authError = error;
            return () => {};
        },
        onValue(target, callback, error) {
            const listener = { target, callback, error };
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        async update(target, value) {
            if (failure) throw failure;
            writes.push({ target, value: JSON.parse(JSON.stringify(value)) });
        }
    });
    vm.runInContext(source, context);
    return {
        context, writes, listeners, auth,
        signIn(uid) {
            auth.currentUser = uid ? { uid } : null;
            authChanged(auth.currentUser);
        },
        authError: (error) => authError(error),
        fail: (error) => { failure = error; },
        emit(target, value) {
            [...listeners].filter((listener) => listener.target === target)
                .forEach((listener) => listener.callback({ val: () => value }));
        }
    };
}

test("send atomically delivers identical records to sender and recipient", async () => {
    const app = fixture();
    app.auth.currentUser = { uid: "sender" };
    await app.context.sendMessage("recipient", "  Hello learner  ");
    assert.equal(app.writes.length, 1);
    const write = app.writes[0];
    assert.equal(write.target, "");
    assert.deepEqual(write.value["user_messages/sender/recipient/new-message"],
        write.value["user_messages/recipient/sender/new-message"]);
    assert.equal(write.value["user_messages/sender/recipient/new-message"].senderId, "sender");
    assert.equal(write.value["user_messages/sender/recipient/new-message"].text, "Hello learner");
    assert.deepEqual(write.value["user_messages/sender/recipient/new-message"].sentAt, { ".sv": "timestamp" });
});

test("invalid inputs and signed-out sends never write", async () => {
    const app = fixture();
    await assert.rejects(app.context.sendMessage("peer", "hello"), /Sign in/);
    app.auth.currentUser = { uid: "sender" };
    for (const [peer, text] of [["sender", "hello"], ["bad/path", "hello"], ["peer", " "], ["peer", "a".repeat(2001)]]) {
        await assert.rejects(app.context.sendMessage(peer, text));
    }
    assert.equal(app.writes.length, 0);
});

test("favorites, archives and read state only write to the authenticated account", async () => {
    const app = fixture();
    app.auth.currentUser = { uid: "sender" };
    await app.context.updateMessagePreferences("peer", { favorite: true, readAt: 123 });
    assert.equal(app.writes[0].target, "message_preferences/sender/peer");
    assert.equal(app.writes[0].value.favorite, true);
});

test("real-time subscriptions clear account data and reject stale callbacks after switching", () => {
    const app = fixture();
    const snapshots = [];
    const errors = [];
    const stop = app.context.subscribeMessaging((snapshot) => snapshots.push(JSON.parse(JSON.stringify(snapshot))), (error) => errors.push(error));
    app.signIn("one");
    const stale = [...app.listeners].find((listener) => listener.target === "user_messages/one");
    app.emit("partnerDirectory", { peer: { displayName: "Dara" } });
    app.emit("user_messages/one", { peer: { m1: { text: "private" } } });
    app.emit("message_preferences/one", { peer: { favorite: true } });
    assert.equal(snapshots.at(-1).loading, true, "waits for message contacts");
    app.emit("message_contacts/one", { peer: { status: "incoming", updatedAt: 1 } });
    assert.equal(snapshots.at(-1).loading, true, "waits for read receipts");
    app.emit("message_receipts/one", { peer: { readAt: 100 } });
    app.emit(".info/connected", true);
    assert.equal(snapshots.at(-1).loading, false);
    assert.equal(snapshots.at(-1).contacts.peer.status, "incoming");
    assert.equal(snapshots.at(-1).connected, true);
    assert.equal(snapshots.at(-1).receipts.peer.readAt, 100);
    app.signIn("two");
    assert.deepEqual(snapshots.at(-1).messages, {});
    assert.equal(snapshots.at(-1).uid, "two");
    const count = snapshots.length;
    stale.callback({ val: () => ({ leaked: true }) });
    assert.equal(snapshots.length, count);
    app.signIn(null);
    assert.equal(app.listeners.size, 0);
    assert.equal(snapshots.at(-1).uid, null);
    assert.equal(errors.length, 0);
    stop();
});

test("edits and deletions atomically update both copies without changing identity or send time", async () => {
    const app = fixture();
    app.auth.currentUser = { uid: "me" };
    await app.context.editMessage("peer", "m1", "  Revised text  ");
    await app.context.deleteMessage("peer", "m1");
    const [edited, deleted] = app.writes.map((write) => write.value);
    assert.deepEqual(edited, {
        "user_messages/me/peer/m1/text": "Revised text",
        "user_messages/peer/me/m1/text": "Revised text",
        "user_messages/me/peer/m1/editedAt": { ".sv": "timestamp" },
        "user_messages/peer/me/m1/editedAt": { ".sv": "timestamp" }
    });
    assert.deepEqual(deleted, {
        "user_messages/me/peer/m1/text": "Message deleted",
        "user_messages/peer/me/m1/text": "Message deleted",
        "user_messages/me/peer/m1/deletedAt": { ".sv": "timestamp" },
        "user_messages/peer/me/m1/deletedAt": { ".sv": "timestamp" }
    });
    for (const id of ["", "bad/id"]) {
        await assert.rejects(app.context.editMessage("peer", id, "text"));
        await assert.rejects(app.context.deleteMessage("peer", id));
    }
    for (const text of [" ", "x".repeat(2001)]) {
        await assert.rejects(app.context.editMessage("peer", "m1", text));
    }
    assert.equal(app.writes.length, 2);
});

test("read receipts update private unread state and the sender's receipt atomically", async () => {
    const app = fixture();
    app.auth.currentUser = { uid: "reader" };
    await app.context.markConversationRead("sender", 123);
    assert.deepEqual(app.writes[0].value, {
        "message_preferences/reader/sender/readAt": 123,
        "message_receipts/sender/reader/readAt": 123
    });
    for (const value of [0, -1, NaN, Infinity, "123"]) {
        await assert.rejects(app.context.markConversationRead("sender", value));
    }
    assert.equal(app.writes.length, 1);
    app.fail(new Error("write-failed"));
    await assert.rejects(app.context.markConversationRead("sender", 124), /write-failed/);
    await assert.rejects(app.context.editMessage("sender", "m1", "edit"), /write-failed/);
    await assert.rejects(app.context.deleteMessage("sender", "m1"), /write-failed/);
});

test("message requests, accepts and removals write both sides atomically", async () => {
    const app = fixture();
    await assert.rejects(app.context.requestConnection("peer"), /Sign in/);
    app.auth.currentUser = { uid: "me" };
    for (const peer of ["me", "bad/path", ""]) {
        await assert.rejects(app.context.requestConnection(peer));
    }
    assert.equal(app.writes.length, 0);
    await app.context.requestConnection("peer");
    await app.context.acceptConnection("peer");
    await app.context.removeConnection("peer");
    const [requested, accepted, removed] = app.writes.map((write) => write.value);
    assert.ok(app.writes.every((write) => write.target === ""));
    assert.equal(requested["message_contacts/me/peer"].status, "outgoing");
    assert.equal(requested["message_contacts/peer/me"].status, "incoming");
    assert.deepEqual(requested["message_contacts/me/peer"].updatedAt, { ".sv": "timestamp" });
    assert.equal(accepted["message_contacts/me/peer"].status, "connected");
    assert.equal(accepted["message_contacts/peer/me"].status, "connected");
    assert.equal(requested["message_contacts/me/peer"].requesterId, "me");
    assert.equal(requested["message_contacts/peer/me"].requesterId, "me");
    assert.equal(accepted["message_contacts/me/peer"].requesterId, "peer", "accepting records the original requester");
    assert.equal(accepted["message_contacts/peer/me"].requesterId, "peer");
    assert.equal(accepted["community_connections/me/peer"], true);
    assert.equal(accepted["community_connections/peer/me"], true);
    assert.deepEqual(removed, { "message_contacts/me/peer": null, "message_contacts/peer/me": null, "community_connections/me/peer": null, "community_connections/peer/me": null });
});

test("auth and database failures are surfaced, and authentication failure clears messages", async () => {
    const app = fixture();
    const snapshots = [];
    const errors = [];
    app.context.subscribeMessaging((snapshot) => snapshots.push(snapshot), (error) => errors.push(error));
    app.signIn("one");
    [...app.listeners][0].error(new Error("permission-denied"));
    assert.equal(errors.length, 1);
    app.authError(new Error("authentication-failed"));
    assert.equal(snapshots.at(-1).uid, null);
    assert.equal(app.listeners.size, 0);
    app.auth.currentUser = { uid: "one" };
    app.fail(new Error("write-failed"));
    await assert.rejects(app.context.sendMessage("peer", "hello"), /write-failed/);
});
