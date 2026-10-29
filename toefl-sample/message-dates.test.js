const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "message.js"), "utf8");
const helpers = source.slice(source.indexOf("  const messageDayKey"), source.indexOf('  const layout ='));
const localDate = (day, hour = 12) => new Date(2026, 9, day, hour).getTime();

test("date labels use local calendar days and switch to dates at seven days", () => {
    const context = vm.createContext({});
    vm.runInContext(`${helpers}
        globalThis.dayLabel = formatMessageDay;
        globalThis.dayKey = messageDayKey;
        globalThis.clock = formatMessageClock;`, context);
    const now = localDate(29);
    assert.equal(context.dayLabel(now, now), "Today");
    assert.equal(context.dayLabel(localDate(28), now), "Yesterday");
    assert.equal(context.dayLabel(localDate(27), now), "Tuesday");
    assert.equal(context.dayLabel(localDate(23), now), "Friday");
    const olderLabel = context.dayLabel(localDate(22), now);
    assert.match(olderLabel, /22/);
    assert.match(olderLabel, /Oct/);
    assert.match(olderLabel, /2026/);
    assert.match(context.dayLabel(new Date(2025, 9, 29).getTime(), now), /2025/);
    assert.equal(context.dayLabel(localDate(28, 23), localDate(29, 0)), "Yesterday");
    assert.equal(context.dayKey(localDate(29, 0)), context.dayKey(localDate(29, 23)));
    assert.doesNotMatch(context.clock(localDate(29)), /Oct|2026/);
});

test("messages are grouped by day with semantic timestamps inside each bubble", () => {
    function element(tag) {
        return {
            tag, children: [], dataset: {}, textContent: "",
            append(...children) { this.children.push(...children); },
            replaceChildren() { this.children = []; }
        };
    }
    const threadMessages = element("div");
    const context = vm.createContext({ document: { createElement: element }, threadMessages });
    const render = source.slice(source.indexOf("  const renderMessages ="), source.indexOf("  const selectThread ="));
    vm.runInContext(`${helpers}${render}
        globalThis.render = renderMessages;`, context);
    context.render({ messages: [
        { sentAt: localDate(20), text: "Older message", from: "them" },
        { sentAt: localDate(20, 13), text: "Same day\nwith a new line", from: "me" },
        { sentAt: localDate(29), text: "New day", from: "them" }
    ] });
    const dividers = threadMessages.children.filter((node) => node.className === "day-divider");
    assert.equal(dividers.length, 2);
    assert.ok(dividers.every((node) => node.tag === "time" && node.dateTime && node.dataset.timestamp));
    const rows = threadMessages.children.filter((node) => node.className.startsWith("message-row"));
    assert.equal(rows.length, 3);
    rows.forEach((row) => {
        assert.equal(row.children.length, 1, "no timestamp below the bubble");
        const [text, time] = row.children[0].children;
        assert.equal(text.className, "message-text");
        assert.equal(time.tag, "time");
        assert.ok(time.dateTime);
    });
    assert.equal(rows[1].children[0].children[0].textContent, "Same day\nwith a new line");
});
