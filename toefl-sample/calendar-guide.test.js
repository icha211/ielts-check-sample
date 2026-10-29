const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

function fixture({ width = 1440, height = 1000, anchorTop = 500, anchorRight = 500 } = {}) {
    const listeners = {};
    const guide = {
        offsetWidth: width <= 600 ? width - 16 : 390,
        get offsetHeight() { return Math.min(680, parseFloat(this.style.maxHeight) || height - 24); },
        style: {}, open: true,
        matches() { return this.open; },
        hidePopover() { this.open = false; },
        contains() { return false; },
        focus(options) { this.focusOptions = options; },
        addEventListener(name, callback) { this[name] = callback; }
    };
    const closeButton = {
        addEventListener(name, callback) { this[name] = callback; },
        focus(options) { this.focusOptions = options; }
    };
    const trigger = {
        attributes: {},
        getBoundingClientRect: () => ({ top: anchorTop, bottom: anchorTop + 44, left: anchorRight - 44, right: anchorRight }),
        setAttribute(name, value) { this.attributes[name] = value; },
        focus() { this.focused = true; }
    };
    const context = vm.createContext({
        document: {
            documentElement: { clientWidth: width },
            querySelector: () => null,
            getElementById: (id) => id === "calendarGuide" ? guide : id === "closeCalendarGuide" ? closeButton : trigger
        },
        window: { innerHeight: height, addEventListener(name, callback) { listeners[name] = callback; } }
    });
    const start = source.indexOf('        const calendarGuide =');
    vm.runInContext(source.slice(start, source.indexOf("        const MONTH_PICKER_YEAR", start)), context);
    return { guide, trigger, closeButton, listeners };
}

test("calendar guide fits desktop and narrow/short viewports", () => {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 305, height: 600 }, { width: 375, height: 844 }]) {
        const { guide } = fixture({ ...viewport, anchorTop: 800, anchorRight: viewport.width - 10 });
        guide.toggle();
        const left = parseFloat(guide.style.left);
        const top = parseFloat(guide.style.top);
        const margin = viewport.width <= 600 ? 8 : 12;
        assert.ok(left >= margin && left + guide.offsetWidth <= viewport.width - margin);
        assert.ok(top >= margin && top + guide.offsetHeight <= viewport.height - margin);
    }
});

test("popover open state updates accessibility and focuses without scrolling", () => {
    const { guide, trigger, closeButton, listeners } = fixture();
    guide.toggle();
    assert.equal(trigger.attributes["aria-expanded"], "true");
    assert.equal(closeButton.focusOptions.preventScroll, true);
    listeners.resize();
    listeners.scroll({ target: {} });
    guide.open = false;
    guide.toggle();
    assert.equal(trigger.attributes["aria-expanded"], "false");
    guide.open = true;
    let prevented = false;
    guide.keydown({ key: "Escape", preventDefault() { prevented = true; } });
    assert.equal(guide.open, false);
    assert.equal(trigger.focused, true);
    assert.equal(prevented, true);
    guide.open = true;
    closeButton.click();
    assert.equal(guide.open, false);
});

test("desktop guide anchors below the trigger without covering the top navigation", () => {
    const { guide } = fixture({ anchorTop: 140 });
    guide.toggle();
    assert.equal(parseFloat(guide.style.top), 192);
    assert.equal(parseFloat(guide.style.left), 456);
});

test("guide explains real unlock behavior without subscription or locked-access claims", () => {
    const markup = source.slice(source.indexOf('<aside class="calendar-guide"'), source.indexOf('<div class="toefl-101-modal"'));
    for (const heading of ["Test sections", "Calendar symbols", "How practice unlocks"]) assert.ok(markup.includes(heading));
    assert.ok(markup.includes("Hidden icons do not block access to tests."));
    assert.doesNotMatch(markup, /Subscription|calendar-guide-levels|<br>/);
    assert.match(markup, /aria-label="Close calendar guide"/);
});

test("guide trigger uses Lucide info and native keyboard/light-dismiss behavior", () => {
    assert.match(source, /popovertarget="calendarGuide"/);
    assert.match(source, /id="calendarGuide" popover="auto" role="dialog" aria-labelledby="calendarGuideTitle"/);
    assert.match(source, /data-lucide="info"/);
    for (const image of ["mock-listening.png", "mock-structure.png", "mock-reading.png"]) {
        assert.ok(fs.existsSync(path.join(__dirname, "..", "asset", "figma", image)));
    }
});
