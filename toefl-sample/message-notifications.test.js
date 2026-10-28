const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "js", "message-notifications.js"), "utf8")
    .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "").replace(/^startMessageNotifications\(\);\r?$/m, "");

function element(attributes = {}) {
    return {
        hidden: true, textContent: "", dataset: attributes, attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; }
    };
}

function fixture() {
    let authChanged;
    let authError;
    const listeners = new Set();
    const badges = [element(), element()];
    const links = [element({ messageLink: "Message" }), element({ messageLink: "Social menu" })];
    const events = [];
    const context = vm.createContext({
        auth: {}, db: {}, console: { error() {} },
        ref: (_, value) => value,
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
        document: { querySelectorAll: (selector) => selector === "[data-message-badge]" ? badges : links },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
        window: { dispatchEvent: (event) => events.push(event.detail.count) }
    });
    vm.runInContext(source, context);
    return {
        context, listeners, badges, links, events,
        signIn: (uid) => authChanged(uid ? { uid } : null),
        authError: (error) => authError(error),
        emit(target, value) {
            [...listeners].filter((listener) => listener.target === target)
                .forEach((listener) => listener.callback({ val: () => value }));
        }
    };
}

const incoming = (peer, uid, sentAt) => ({ senderId: peer, recipientId: uid, text: "Hi", sentAt });

test("unread count includes only incoming messages newer than each private read time", () => {
    const app = fixture();
    const count = app.context.countUnreadMessages("me", {
        dara: {
            a: incoming("dara", "me", 10), b: incoming("dara", "me", 30),
            mine: { senderId: "me", recipientId: "dara", text: "Reply", sentAt: 40 }
        },
        lina: { c: incoming("lina", "me", 5) },
        removed: { d: incoming("removed", "me", 99) },
        forged: { e: incoming("someone-else", "me", 99) }
    }, { dara: { readAt: 20 }, removed: { deleted: true } });
    assert.equal(count, 2);
    assert.equal(app.context.countUnreadMessages("me", {}, {}, {
        dara: { status: "incoming" }, lina: { status: "outgoing" }, sam: { status: "connected" }, me: { status: "incoming" }
    }), 1, "pending incoming requests count as notifications");
    assert.equal(app.context.countUnreadMessages(null, { dara: { a: incoming("dara", null, 1) } }, {}), 0);
});

test("sidebar badges update in real time as messages arrive and are read", () => {
    const app = fixture();
    app.context.startMessageNotifications();
    assert.ok(app.badges.every((badge) => badge.hidden));
    app.signIn("me");
    app.emit("user_messages/me", { dara: { a: incoming("dara", "me", 10), b: incoming("dara", "me", 11) } });
    app.emit("message_preferences/me", {});
    assert.ok(app.badges.every((badge) => !badge.hidden && badge.textContent === "2"));
    assert.equal(app.links[0].attributes["aria-label"], "Message, 2 unread notifications");
    app.emit("message_preferences/me", { dara: { readAt: 11 } });
    assert.ok(app.badges.every((badge) => badge.hidden));
    assert.equal(app.links[1].attributes["aria-label"], "Social menu");
    app.emit("message_contacts/me", { lina: { status: "incoming", updatedAt: 1 } });
    assert.ok(app.badges.every((badge) => !badge.hidden && badge.textContent === "1"));
    app.emit("message_contacts/me", { lina: { status: "connected", updatedAt: 2 } });
    assert.ok(app.badges.every((badge) => badge.hidden));
    const many = Object.fromEntries(Array.from({ length: 120 }, (_, index) => [`m${index}`, incoming("dara", "me", 100 + index)]));
    app.emit("user_messages/me", { dara: many });
    assert.equal(app.badges[0].textContent, "99+");
    assert.equal(app.events.at(-1), 120);
});

test("account switches and sign-out clear badges and ignore stale listeners", () => {
    const app = fixture();
    app.context.startMessageNotifications();
    app.signIn("one");
    const stale = [...app.listeners].find((listener) => listener.target === "user_messages/one");
    app.emit("user_messages/one", { dara: { a: incoming("dara", "one", 10) } });
    assert.equal(app.badges[0].textContent, "1");
    app.signIn("two");
    assert.ok(app.badges.every((badge) => badge.hidden));
    stale.callback({ val: () => ({ dara: { a: incoming("dara", "one", 10) } }) });
    assert.ok(app.badges.every((badge) => badge.hidden));
    app.signIn(null);
    assert.equal(app.listeners.size, 0);
    app.signIn("three");
    app.authError(new Error("auth failed"));
    assert.equal(app.listeners.size, 0);
    assert.ok(app.badges.every((badge) => badge.hidden));
});
