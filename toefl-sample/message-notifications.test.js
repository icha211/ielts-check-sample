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
        query: (target) => target,
        orderByChild: (key) => key,
        limitToLast: (count) => count,
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

test("friend post notifications exclude self, strangers, requests, deleted and pre-connection posts", () => {
    const app = fixture();
    const items = app.context.friendPostNotifications("me", {
        dara: { status: "connected", updatedAt: 20 }, lina: { status: "incoming" }
    }, {
        public: { authorId: "dara", createdAt: 30, visibility: "public" },
        private: { authorId: "dara", createdAt: 40, visibility: "friends" },
        old: { authorId: "dara", createdAt: 10 },
        deleted: { authorId: "dara", createdAt: 50, deletedAt: 60 },
        request: { authorId: "lina", createdAt: 70 },
        stranger: { authorId: "sam", createdAt: 80 },
        own: { authorId: "me", createdAt: 90 },
        invalid: { authorId: "dara", createdAt: "invalid" }
    }, 35);
    assert.deepEqual(JSON.parse(JSON.stringify(items.map((item) => [item.postId, item.unread, item.visibility]))), [
        ["private", true, "friends"], ["public", false, "public"]
    ]);
    assert.equal(app.context.friendPostNotifications(null, {}, {}).length, 0);
    const many = Object.fromEntries(Array.from({ length: 25 }, (_, id) => [id, { authorId: "dara", createdAt: 100 + id }]));
    assert.equal(app.context.friendPostNotifications("me", { dara: { status: "connected" } }, many).length, 20);
});

test("friends' public and private posts share the bell, read state and working post links", async () => {
    const app = fixture();
    app.context.startMessageNotifications();
    app.signIn("me");
    app.emit("notification_state/me", { acceptedSeenAt: 20 });
    app.emit("community_posts", { p1: { authorId: "dara", createdAt: 30 } });
    assert.ok(app.notifyBadges[0].hidden, "contacts must confirm the author is a friend");
    app.emit("message_contacts/me", { dara: { status: "connected", requesterId: "dara", updatedAt: 10 } });
    assert.equal(app.notifyBadges[0].textContent, "1");
    app.emit("community_private_posts/dara", { p2: { authorId: "dara", createdAt: 40, visibility: "friends" } });
    assert.equal(app.notifyBadges[0].textContent, "2");
    assert.equal(app.notifyList.children[0].href, "social.html#post-p2");
    assert.match(textOf(app.notifyList.children[0]), /friends-only post/);
    assert.equal(app.notifyList.children[1].href, "social.html#post-p1");
    app.openPanel();
    assert.equal(app.writes[0].target, "notification_state/me");
    app.emit("notification_state/me", { acceptedSeenAt: 45 });
    assert.ok(app.notifyBadges[0].hidden);
    app.emit("community_posts", { p3: { authorId: "dara", createdAt: 50 } });
    assert.equal(app.notifyBadges[0].textContent, "1", "posts arriving after opening remain unread");
    app.emit("community_posts", {});
    assert.ok(app.notifyBadges[0].hidden, "removed posts stop notifying");
});

test("friend removal and account switches remove private notifications and reject stale events", () => {
    const app = fixture();
    app.context.startMessageNotifications();
    app.signIn("me");
    app.emit("message_contacts/me", { dara: { status: "connected", updatedAt: 10 } });
    const stale = [...app.listeners].find((listener) => listener.target === "community_private_posts/dara");
    app.emit("community_private_posts/dara", { p: { authorId: "dara", createdAt: 30, visibility: "friends" } });
    assert.equal(app.notifyBadges[0].textContent, "1");
    app.emit("message_contacts/me", {});
    assert.ok(app.notifyBadges[0].hidden);
    assert.ok(!app.listeners.has(stale));
    stale.callback({ val: () => ({ p: { authorId: "dara", createdAt: 30 } }) });
    assert.ok(app.notifyBadges[0].hidden);
    app.emit("message_contacts/me", { dara: { status: "connected", updatedAt: 40 } });
    stale.callback({ val: () => ({ p: { authorId: "dara", createdAt: 60 } }) });
    assert.ok(app.notifyBadges[0].hidden, "reconnecting cannot revive a disposed private listener");
    app.signIn("other");
    stale.callback({ val: () => ({ p: { authorId: "dara", createdAt: 50 } }) });
    assert.ok(app.notifyBadges[0].hidden);
    app.signIn(null);
    assert.equal(app.listeners.size, 0);
});

test("private notification sync errors clear protected posts and show an explicit error", () => {
    const app = fixture();
    app.context.startMessageNotifications();
    app.signIn("me");
    app.emit("message_contacts/me", { dara: { status: "connected", updatedAt: 10 } });
    app.emit("community_private_posts/dara", { p: { authorId: "dara", createdAt: 30, visibility: "friends" } });
    [...app.listeners].find((listener) => listener.target === "community_private_posts/dara").error(new Error("permission denied"));
    assert.ok(app.notifyBadges[0].hidden);
    assert.match(textOf(app.notifyList), /Notifications could not sync/);
});

test("post activity alerts exclude self, deleted posts, other authors and untimestamped legacy likes", () => {
    const app = fixture();
    const posts = { own: { authorId: "me" }, other: { authorId: "dara" }, deleted: { authorId: "me", deletedAt: 1 } };
    const activity = new Map([
        ["own", { likes: { me: 50, dara: 30, legacy: true }, comments: { c1: { authorId: "lina", createdAt: 40 }, c2: { authorId: "me", createdAt: 60 } } }],
        ["other", { likes: { dara: 70 } }],
        ["deleted", { likes: { dara: 80 } }]
    ]);
    const items = app.context.postActivityNotifications("me", posts, activity, 35);
    assert.deepEqual(JSON.parse(JSON.stringify(items.map(item => [item.type, item.peerId, item.unread]))), [["comment", "lina", true], ["like", "dara", false]]);
});

test("own public and private post activity updates the bell and clears on removal and sign-out", () => {
    const app = fixture();
    app.context.startMessageNotifications();
    app.signIn("me");
    app.emit("community_posts", { public: { authorId: "me" }, other: { authorId: "dara" } });
    assert.ok(![...app.listeners].some(listener => listener.target === "community_likes/other"));
    app.emit("community_likes/public", { me: 10, dara: 20 });
    assert.equal(app.notifyBadges[0].textContent, "1");
    assert.match(textOf(app.notifyList), /liked your post/);
    app.emit("community_comments/public", { c: { authorId: "lina", createdAt: 30 } });
    assert.equal(app.notifyBadges[0].textContent, "2");
    assert.equal(app.notifyList.children[0].href, "social.html#post-public");
    assert.match(textOf(app.notifyList.children[0]), /commented on your post/);
    app.emit("community_private_posts/me", { private: { authorId: "me", visibility: "friends" } });
    app.emit("community_private_likes/me/private", { dara: 40 });
    app.emit("community_private_comments/me/private", { c: { authorId: "sam", createdAt: 50 } });
    assert.equal(app.notifyBadges[0].textContent, "4");
    app.openPanel();
    app.emit("notification_state/me", { acceptedSeenAt: 55 });
    assert.ok(app.notifyBadges[0].hidden);
    const stale = [...app.listeners].find(listener => listener.target === "community_likes/public");
    app.emit("community_posts", { public: { authorId: "me", deletedAt: 60 } });
    assert.ok(!app.listeners.has(stale));
    stale.callback({ val: () => ({ dara: 70 }) });
    assert.ok(app.notifyBadges[0].hidden);
    app.signIn("other");
    stale.callback({ val: () => ({ dara: 80 }) });
    assert.ok(app.notifyBadges[0].hidden);
    app.signIn(null);
    assert.equal(app.listeners.size, 0);
});
