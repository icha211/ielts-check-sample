const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "js", "message-notifications.js"), "utf8")
    .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "").replace(/^startMessageNotifications\(\);\r?$/m, "");

function element(attributes = {}) {
    return {
        hidden: true, textContent: "", dataset: attributes, attributes: {}, children: [], className: "", href: "",
        setAttribute(name, value) { this.attributes[name] = value; },
        append(...nodes) { this.children.push(...nodes.map((node) => typeof node === "string" ? { textContent: node } : node)); },
        replaceChildren() { this.children = []; }
    };
}

const textOf = (node) => node.children?.length ? node.children.map(textOf).join("") : node.textContent;

function fixture() {
    let authChanged;
    let authError;
    const listeners = new Set();
    const badges = [element(), element()];
    const links = [element({ messageLink: "Message" }), element({ messageLink: "Social menu" })];
    const notifyBadges = [element()];
    const notifyButton = element();
    const notifyPanel = element();
    const notifyList = element();
    const events = [];
    const windowListeners = {};
    const writes = [];
    const names = {};
    const context = vm.createContext({
        auth: {}, db: {}, console: { error() {} },
        ref: (_, value) => value,
        serverTimestamp: () => "SERVER_TIME",
        set: async (target, value) => { writes.push({ target, value }); },
        get: async (target) => ({ val: () => names[target] ?? null }),
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
        document: {
            querySelectorAll: (selector) => selector === "[data-message-badge]" ? badges : selector === "[data-notify-badge]" ? notifyBadges : links,
            getElementById: (id) => ({ qcnavNotifyBtn: notifyButton, qcnavNotifyPanel: notifyPanel, qcnavNotifyList: notifyList })[id] || null,
            createElement: () => element()
        },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
        window: {
            dispatchEvent: (event) => events.push(event.detail.count),
            addEventListener: (type, callback) => { windowListeners[type] = callback; },
            removeEventListener: (type) => { delete windowListeners[type]; }
        },
        Date, Math, Number, Object, String, Boolean, Map, encodeURIComponent
    });
    vm.runInContext(source, context);
    return {
        context, listeners, badges, links, events, notifyBadges, notifyButton, notifyPanel, notifyList, writes, names,
        openPanel() {
            notifyPanel.hidden = false;
            windowListeners["toefl-notifications-opened"]();
        },
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

test("accepted request notifications only include requests this user sent", () => {
    const app = fixture();
    const items = app.context.acceptedRequestNotifications("me", {
        dara: { status: "connected", requesterId: "me", updatedAt: 50 },
        lina: { status: "connected", requesterId: "lina", updatedAt: 60 },
        sam: { status: "outgoing", requesterId: "me", updatedAt: 70 },
        old: { status: "connected", requesterId: "me", updatedAt: 10 },
        legacy: { status: "connected", updatedAt: 80 }
    }, 20);
    assert.deepEqual(items.map((item) => [item.peerId, item.unread]), [["dara", true], ["old", false]]);
    assert.equal(app.context.acceptedRequestNotifications(null, { dara: { status: "connected", requesterId: null } }).length, 0);
});

test("bell badge shows accepted requests in real time and clears once opened", async () => {
    const app = fixture();
    app.names["partnerDirectory/dara/displayName"] = "Dara Okafor";
    app.context.startMessageNotifications();
    app.signIn("me");
    assert.ok(app.notifyBadges[0].hidden);
    assert.match(textOf(app.notifyList), /No notifications yet/);
    app.emit("notification_state/me", { acceptedSeenAt: 5 });
    app.emit("message_contacts/me", { dara: { status: "outgoing", requesterId: "me", updatedAt: 6 } });
    assert.ok(app.notifyBadges[0].hidden, "a pending request is not a notification yet");
    app.emit("message_contacts/me", { dara: { status: "connected", requesterId: "me", updatedAt: Date.now() } });
    assert.equal(app.notifyBadges[0].hidden, false);
    assert.equal(app.notifyBadges[0].textContent, "1");
    assert.equal(app.notifyButton.attributes["aria-label"], "Notifications, 1 new");
    await new Promise((resolve) => setImmediate(resolve));
    const item = app.notifyList.children[0];
    assert.equal(item.href, "message.html?to=dara");
    assert.match(item.className, /is-new/);
    assert.match(textOf(item), /Dara Okafor accepted your message request/);
    app.openPanel();
    assert.deepEqual(JSON.parse(JSON.stringify(app.writes)), [{ target: "notification_state/me", value: { acceptedSeenAt: "SERVER_TIME" } }]);
    app.emit("notification_state/me", { acceptedSeenAt: Date.now() + 1 });
    assert.ok(app.notifyBadges[0].hidden);
    assert.match(app.notifyList.children[0].className, /is-new/, "stays highlighted while the panel is open");
    app.notifyPanel.hidden = true;
    app.openPanel();
    assert.equal(app.writes.length, 1, "opening again with nothing new does not write");
    assert.doesNotMatch(app.notifyList.children[0].className, /is-new/);
});

test("bell notifications clear on account switch and ignore stale listeners", () => {
    const app = fixture();
    app.context.startMessageNotifications();
    app.signIn("one");
    const stale = [...app.listeners].find((listener) => listener.target === "message_contacts/one");
    app.emit("message_contacts/one", { dara: { status: "connected", requesterId: "one", updatedAt: 10 } });
    assert.equal(app.notifyBadges[0].textContent, "1");
    app.signIn("two");
    assert.ok(app.notifyBadges[0].hidden);
    stale.callback({ val: () => ({ dara: { status: "connected", requesterId: "one", updatedAt: 10 } }) });
    assert.ok(app.notifyBadges[0].hidden);
    assert.equal(app.notifyList.children.length, 1);
    app.signIn(null);
    assert.match(textOf(app.notifyList), /Sign in to see notifications/);
});
