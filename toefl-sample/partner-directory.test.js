const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "js", "partner-directory.js"), "utf8")
    .replace(/^import .*;\r?$/gm, "")
    .replace(/^export /gm, "");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture() {
    const listeners = new Set();
    const writes = [];
    const removals = [];
    const disconnects = [];
    const events = [];
    let authenticate;
    let connectionId = 0;
    let fail = false;
    const context = vm.createContext({
        auth: {}, db: {},
        console: { error() {} },
        window: { dispatchEvent: (event) => events.push(event) },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        onAuthStateChanged(_, callback) { authenticate = callback; },
        ref: (_, value) => ({ path: value }),
        push(parent) {
            const key = `connection-${++connectionId}`;
            return { path: `${parent.path}/${key}`, key };
        },
        onValue(target, callback, error) {
            const listener = { path: target.path, callback, error };
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        onDisconnect(target) {
            return {
                async remove() { disconnects.push(target.path); },
                async cancel() {}
            };
        },
        async update(target, value) {
            if (fail) throw new Error("permission-denied");
            writes.push({ path: target.path, value: JSON.parse(JSON.stringify(value)) });
        },
        async remove(target) { removals.push(target.path); }
    });
    vm.runInContext(source, context);
    return {
        context, writes, removals, disconnects, events, listeners,
        auth: (user) => authenticate(user),
        failWrites: () => { fail = true; },
        emit(target, value) {
            [...listeners].filter((listener) => listener.path === target)
                .forEach((listener) => listener.callback({ val: () => value }));
        },
        async ready() { await flush(); await flush(); }
    };
}

test("signed-in accounts publish automatically without exposing email or phone", async () => {
    const app = fixture();
    app.auth({ uid: "one", displayName: "Dara Putri", photoURL: "https://example.test/photo.png", email: "private@example.test" });
    app.emit("users/one", { nationality: "ID", phone_number: "private", partnerDirectoryOptIn: false });
    await app.ready();
    const profile = app.writes[0];
    assert.equal(profile.path, "partnerDirectory/one");
    assert.equal(profile.value.displayName, "Dara Putri");
    assert.equal(profile.value.nationality, "ID");
    assert.equal(profile.value.photoURL, "https://example.test/photo.png");
    assert.deepEqual(Object.keys(profile.value).sort(), ["displayName", "level", "nationality", "photoURL"]);
});

test("presence is published only after disconnect cleanup is registered and reconnects get new IDs", async () => {
    const app = fixture();
    app.auth({ uid: "one" });
    app.emit("users/one", { first_name: "Dara" });
    await app.ready();
    app.emit(".info/connected", true);
    await app.ready();
    assert.equal(app.disconnects[0], "partnerDirectory/one/presence/connection-1");
    assert.equal(app.writes[1].value["partnerDirectory/one/presence/connection-1"], true);
    app.emit(".info/connected", false);
    app.emit(".info/connected", true);
    await app.ready();
    assert.equal(app.disconnects[1], "partnerDirectory/one/presence/connection-2");
});

test("hiding a profile removes presence and listing, including when changed from another tab", async () => {
    const app = fixture();
    app.auth({ uid: "one" });
    app.emit("users/one", {});
    await app.ready();
    app.emit(".info/connected", true);
    await app.ready();
    await app.context.setPartnerVisibility(false);
    assert.equal(app.writes.at(-1).value.partnerDirectoryHidden, true);
    app.emit("users/one", { partnerDirectoryHidden: true });
    await app.ready();
    assert.ok(app.removals.includes("partnerDirectory/one"));
    assert.ok(app.removals.includes("partnerDirectory/one/presence/connection-1"));
    assert.ok(![...app.listeners].some((listener) => listener.path === ".info/connected"));
    assert.equal(app.events.at(-1).detail.visible, false);
});

test("account switches ignore stale profile callbacks and never publish as the new UID", async () => {
    const app = fixture();
    app.auth({ uid: "one" });
    const stale = [...app.listeners][0];
    app.auth({ uid: "two", displayName: "Second Learner" });
    stale.callback({ val: () => ({ first_name: "Old Learner" }) });
    app.emit("users/two", {});
    await app.ready();
    assert.equal(app.writes.length, 1);
    assert.equal(app.writes[0].path, "partnerDirectory/two");
    assert.equal(app.writes[0].value.displayName, "Second Learner");
    app.auth(null);
    await app.ready();
    assert.equal(app.listeners.size, 0);
});

test("profile changes update in real time, identical snapshots do not rewrite", async () => {
    const app = fixture();
    app.auth({ uid: "one" });
    app.emit("users/one", { first_name: "Dara", nationality: "ID" });
    await app.ready();
    app.emit("users/one", { first_name: "Dara", nationality: "ID" });
    await app.ready();
    assert.equal(app.writes.length, 1);
    app.emit("users/one", { first_name: "Dara", nationality: "AU", cefrLevel: "B2" });
    await app.ready();
    assert.equal(app.writes.length, 2);
    assert.equal(app.writes[1].value.level, "B2");
    assert.equal(app.writes[1].value.nationality, "AU");
});

test("missing profile fields are not invented and publishing errors are visible", async () => {
    const app = fixture();
    const profile = app.context.createPartnerProfile({ uid: "one" }, {});
    assert.equal(profile.displayName, "Learner");
    assert.equal(profile.nationality, "");
    assert.equal(profile.photoURL, "");
    app.failWrites();
    app.auth({ uid: "one" });
    app.emit("users/one", {});
    await app.ready();
    assert.ok(app.events.some((event) => event.type === "toefl-partner-directory-error"));
});

test("an account hidden before initialization is never automatically republished", async () => {
    const app = fixture();
    app.auth({ uid: "one" });
    app.emit("users/one", { partnerDirectoryHidden: true });
    await app.ready();
    app.emit(".info/connected", true);
    await app.ready();
    assert.equal(app.writes.length, 0);
    assert.ok(app.removals.includes("partnerDirectory/one"));
    app.emit("users/one", { partnerDirectoryHidden: false });
    await app.ready();
    assert.equal(app.writes[0].path, "partnerDirectory/one");
});

test("a stale connection callback cannot publish after an account switch", async () => {
    const app = fixture();
    app.auth({ uid: "one" });
    app.emit("users/one", {});
    await app.ready();
    const connection = [...app.listeners].find((listener) => listener.path === ".info/connected");
    app.auth({ uid: "two" });
    connection.callback({ val: () => true });
    await app.ready();
    assert.equal(app.disconnects.length, 0);
    assert.equal(app.writes.length, 1);
});

test("dashboard shows only online partners, excludes the viewer and updates presence live", () => {
    const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    const start = html.indexOf("        window.updateToeflPartnerDirectory =");
    const end = html.indexOf("\n        window.setToeflPartnerDirectoryState", start);
    const status = { parentElement: { hidden: false } };
    const context = vm.createContext({
        window: {}, partnerDirectoryAuthenticated: true,
        partnerCountryInfo: (code) => ({ name: code, flag: code === "ID" ? "ID" : "" }),
        partnerProfiles: [], partnerDirectoryProfiles: [], partnerOffset: 0, selectedPartnerId: null,
        renderPartnerNetwork() {}, renderPartnerOrbit() {},
        resetSelectedPartner() { context.selectedPartnerId = null; },
        partnerSearch: { value: "" }, document: { getElementById: () => status }
    });
    vm.runInContext(html.slice(start, end), context);
    context.window.updateToeflPartnerDirectory({
        viewer: { displayName: "Viewer" },
        offline: { displayName: "A", nationality: "ID" },
        disconnected: { displayName: "B", presence: { device: false } },
        online: { displayName: "Z", nationality: "ID", photoURL: "photo.png", presence: { device: true } }
    }, "viewer");
    assert.equal(context.partnerProfiles.length, 1);
    assert.equal(context.partnerDirectoryProfiles.length, 3, "offline learners remain available to the connections panel");
    assert.equal(context.partnerProfiles[0].id, "online");
    assert.equal(context.partnerProfiles[0].photo, "photo.png");
    assert.equal(context.partnerProfiles[0].flag, "ID");
    assert.equal(status.parentElement.hidden, true);
    assert.doesNotMatch(status.textContent, /online \/|learners$/);
    context.selectedPartnerId = "online";
    context.window.updateToeflPartnerDirectory({
        viewer: { displayName: "Viewer", presence: { device: true } },
        online: { displayName: "Z", presence: { first: false, second: false } }
    }, "viewer");
    assert.equal(context.partnerProfiles.length, 0);
    assert.equal(context.selectedPartnerId, null);
    assert.equal(status.parentElement.hidden, false);
    assert.match(status.textContent, /No other learners online/);
    context.window.updateToeflPartnerDirectory({
        online: { displayName: "Z", presence: { first: false, second: true } }
    }, "viewer");
    assert.equal(context.partnerProfiles.length, 1, "any active device makes the learner online");
});

test("network statistics and members include only accepted connections and refresh on contact changes", () => {
    const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    function element() {
        return {
            textContent: "", children: [], style: { setProperty() {} },
            setAttribute() {}, append(...children) { this.children.push(...children); },
            replaceChildren() { this.children = []; }
        };
    }
    const nodes = {};
    const node = (id) => nodes[id] || (nodes[id] = element());
    const context = vm.createContext({
        window: {}, partnerContacts: {}, partnerProfiles: [], partnerDirectoryProfiles: [
            { id: "accepted", name: "Dara", level: "B2", country: "Indonesia", flag: "ID" },
            { id: "incoming", name: "Lina", level: "C1", country: "Australia" },
            { id: "outgoing", name: "Sam", level: "A1", country: "Japan" },
            { id: "unrelated", name: "Mira", level: "A2", country: "Spain" }
        ],
        partnerCountryInfo: (country) => ({ flag: country }),
        renderPartnerAction() {},
        document: { getElementById: node, createElement: element }
    });
    const renderStart = html.indexOf("        function renderPartnerNetwork()");
    vm.runInContext(html.slice(renderStart, html.indexOf("        function resetSelectedPartner", renderStart)), context);
    const contactsStart = html.indexOf("        window.setToeflPartnerContacts =");
    vm.runInContext(html.slice(contactsStart, html.indexOf("        function selectPartner", contactsStart)), context);
    context.window.setToeflPartnerContacts({
        accepted: { status: "connected" }, incoming: { status: "incoming" }, outgoing: { status: "outgoing" }
    });
    assert.equal(node("partnerConnectionCount").textContent, "1");
    assert.equal(node("partnerDirectoryMemberCount").textContent, "1 connection");
    assert.equal(node("partnerLevelB2Count").textContent, "1");
    assert.equal(node("partnerLevelC1Count").textContent, "0");
    assert.equal(node("partnerTopCountries").children.length, 1);
    assert.equal(node("partnerTopCountries").children[0].children[1].textContent, "Indonesia");
    assert.equal(node("partnerConnectionGrid").children.length, 1);
    assert.equal(node("partnerConnectionGrid").children[0].children[1].textContent, "Dara");
    context.window.setToeflPartnerContacts({ incoming: { status: "connected" } });
    assert.equal(node("partnerConnectionGrid").children[0].children[1].textContent, "Lina");
    assert.equal(node("partnerLevelB2Count").textContent, "0");
    assert.equal(node("partnerLevelC1Count").textContent, "1");
    context.window.setToeflPartnerContacts({});
    assert.equal(node("partnerConnectionCount").textContent, "0");
    assert.match(node("partnerConnectionGrid").children[0].textContent, /No connections yet/);
});

test("carousel controls stay constant-sized for 1,000 online learners and arrows wrap", () => {
    const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    function element() {
        return {
            children: [], textContent: "", attributes: {}, handlers: {},
            style: { setProperty() {} },
            setAttribute(key, value) { this.attributes[key] = value; },
            removeAttribute(key) { delete this.attributes[key]; },
            append(...children) { this.children.push(...children); },
            replaceChildren() { this.children = []; },
            addEventListener(event, callback) { this.handlers[event] = callback; }
        };
    }
    const context = vm.createContext({
        document: { createElement: element },
        partnerProfiles: Array.from({ length: 1000 }, (_, id) => ({ id: String(id) })),
        partnerOffset: 0, partnerDirectoryAuthenticated: true,
        partnerOrbit: element(),
        previousPartnerButton: element(), nextPartnerButton: element(),
        partnerSearch: element(),
        createPartnerAvatar: () => element()
    });
    const start = html.indexOf("        function renderPartnerOrbit()");
    vm.runInContext(html.slice(start, html.indexOf("        function renderSelectedPartner", start)), context);
    const eventsStart = html.indexOf('        partnerSearch.addEventListener("input"');
    vm.runInContext(html.slice(eventsStart, html.indexOf('        partnerMatchButton.addEventListener', eventsStart)), context);
    context.renderPartnerOrbit();
    assert.doesNotMatch(html, /partnerPagination|partner-pagination/, "no visible position counter");
    assert.match(html, /id="previousPartner"[\s\S]*?id="partnerOrbit"[\s\S]*?id="nextPartner"/, "arrows flank the avatar orbit");
    assert.equal(context.partnerOrbit.children[0].children.length, 6, "only five avatars plus their motion style are mounted");
    assert.equal(context.previousPartnerButton.disabled, false);
    assert.equal(context.previousPartnerButton.hidden, false);
    assert.equal(context.nextPartnerButton.hidden, false);
    context.previousPartnerButton.handlers.click();
    assert.equal(context.partnerOffset, 999);
    context.nextPartnerButton.handlers.click();
    assert.equal(context.partnerOffset, 0);
    context.partnerProfiles = [{ id: "one" }];
    context.renderPartnerOrbit();
    assert.equal(context.previousPartnerButton.disabled, true);
    assert.equal(context.nextPartnerButton.disabled, true);
    context.partnerProfiles = [];
    context.renderPartnerOrbit();
    assert.equal(context.previousPartnerButton.hidden, true);
    assert.equal(context.nextPartnerButton.hidden, true);
    assert.match(context.partnerOrbit.children[0].textContent, /No other learners online/);
});
