const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

function fixture({ width = 1440, height = 1000, anchorTop = 500, anchorRight = 500 } = {}) {
    const listeners = {};
    const guide = {
        offsetWidth: 233, offsetHeight: Math.min(771, height - 24), style: {}, open: true,
        matches() { return this.open; },
        hidePopover() { this.open = false; },
        focus(options) { this.focusOptions = options; },
        addEventListener(name, callback) { this[name] = callback; }
    };
    const trigger = {
        attributes: {},
        getBoundingClientRect: () => ({ top: anchorTop, right: anchorRight }),
        setAttribute(name, value) { this.attributes[name] = value; },
        focus() { this.focused = true; }
    };
    const context = vm.createContext({
        document: {
            documentElement: { clientWidth: width },
            getElementById: (id) => id === "calendarGuide" ? guide : trigger
        },
        window: { innerHeight: height, addEventListener(name, callback) { listeners[name] = callback; } }
    });
    const start = source.indexOf('        const calendarGuide =');
    vm.runInContext(source.slice(start, source.indexOf("        const MONTH_PICKER_YEAR", start)), context);
    return { guide, trigger, listeners };
}

test("calendar guide fits desktop and narrow/short viewports", () => {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 305, height: 600 }, { width: 375, height: 844 }]) {
        const { guide } = fixture({ ...viewport, anchorTop: 800, anchorRight: viewport.width - 10 });
        guide.toggle();
        const left = parseFloat(guide.style.left);
        const top = parseFloat(guide.style.top);
        assert.ok(left >= 12 && left + guide.offsetWidth <= viewport.width - 12);
        assert.ok(top >= 12 && top + guide.offsetHeight <= viewport.height - 12);
    }
});

test("popover open state updates accessibility and focuses without scrolling", () => {
    const { guide, trigger, listeners } = fixture();
    guide.toggle();
    assert.equal(trigger.attributes["aria-expanded"], "true");
    assert.equal(guide.focusOptions.preventScroll, true);
    listeners.resize();
    listeners.scroll();
    guide.open = false;
    guide.toggle();
    assert.equal(trigger.attributes["aria-expanded"], "false");
    guide.open = true;
    let prevented = false;
    guide.keydown({ key: "Escape", preventDefault() { prevented = true; } });
    assert.equal(guide.open, false);
    assert.equal(trigger.focused, true);
    assert.equal(prevented, true);
});

test("guide trigger uses Lucide info and native keyboard/light-dismiss behavior", () => {
    assert.match(source, /popovertarget="calendarGuide"/);
    assert.match(source, /id="calendarGuide" popover="auto" role="dialog" aria-labelledby="calendarGuideTitle"/);
    assert.match(source, /data-lucide="info"/);
    for (const image of ["mock-listening.png", "mock-structure.png", "mock-reading.png"]) {
        assert.ok(fs.existsSync(path.join(__dirname, "..", "asset", "figma", image)));
    }
});
