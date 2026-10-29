const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "message.js"), "utf8").replace(/\r\n/g, "\n");
const markRead = source.slice(source.indexOf("  function markRead("),
    source.indexOf("\n  renderConversations();\n  renderThread();\n  subscribeMessaging"));

function fixture() {
    const writes = [];
    const errors = [];
    const state = {
        focused: true, mobile: false, threadVisible: true, failure: null,
        document: { hidden: false, hasFocus: () => state.focused },
        window: { matchMedia: () => ({ matches: state.mobile }) },
        threadPanel: { hidden: false },
        threadMessages: { scrollHeight: 1000, scrollTop: 700, clientHeight: 300 },
        layout: { classList: { contains: () => state.threadVisible } },
        readWrites: new Map(), accountVersion: 1,
        markConversationRead(peerId, readAt) {
            writes.push({ peerId, readAt });
            return state.failure ? Promise.reject(state.failure) : Promise.resolve();
        },
        showError(error) { errors.push(error); }
    };
    const context = vm.createContext(state);
    vm.runInContext(`${markRead}\nglobalThis.read = markRead;`, context);
    return { state, context, writes, errors };
}

const thread = () => ({
    id: "peer", unread: 2, messages: [
        { from: "them", sentAt: 100 }, { from: "them", sentAt: 200 }, { from: "me", sentAt: 300 }
    ]
});

test("read receipts require an actually visible, focused thread at the latest messages", () => {
    const guards = [
        (state) => { state.document.hidden = true; },
        (state) => { state.focused = false; },
        (state) => { state.threadPanel.hidden = true; },
        (state) => { state.mobile = true; state.threadVisible = false; },
        (state) => { state.threadMessages.scrollTop = 500; }
    ];
    for (const guard of guards) {
        const app = fixture();
        guard(app.state);
        app.context.read(thread());
        assert.equal(app.writes.length, 0);
    }
    const app = fixture();
    app.context.read({ ...thread(), deleted: true });
    app.context.read({ ...thread(), unread: 0 });
    assert.equal(app.writes.length, 0);
    app.context.read(thread());
    app.context.read(thread());
    assert.deepEqual(app.writes, [{ peerId: "peer", readAt: 200 }], "deduplicates and ignores outgoing timestamps");
});

test("failed receipt writes surface the error and can be retried", async () => {
    const app = fixture();
    app.state.failure = new Error("Offline");
    app.context.read(thread());
    await Promise.resolve();
    assert.equal(app.errors.length, 1);
    assert.equal(app.state.readWrites.size, 0);
    app.state.failure = null;
    app.context.read(thread());
    assert.equal(app.writes.length, 2);
});
