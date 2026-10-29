const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const start = html.indexOf("        function getUnlockedCalendarDates(");
const end = html.indexOf("        function isMockTestDay(", start);
const context = vm.createContext({
    formatDateKey: (year, month, day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    getSectionStatus: () => "unattempted"
});
vm.runInContext(html.slice(start, end), context);
const completed = (setDate) => ({ entryKind: "full-mock", status: "completed", setDate });

test("each month initially reveals only days 1 through 4, never adjacent-month placeholders", () => {
    const dates = context.getUnlockedCalendarDates([]);
    for (const month of ["01", "02", "10", "12"]) {
        for (let day = 1; day <= 31; day += 1) {
            const date = `2026-${month}-${String(day).padStart(2, "0")}`;
            assert.equal(context.shouldShowCalendarTasks(date, true, dates), day <= 4);
            assert.equal(context.shouldShowCalendarTasks(date, false, dates), false);
        }
    }
});

test("a completed full mock unlocks exactly the following three days, not its later mock tile", () => {
    const dates = context.getUnlockedCalendarDates([completed("2026-10-05")]);
    assert.deepEqual([...dates], ["2026-10-06", "2026-10-07", "2026-10-08"]);
    assert.equal(context.shouldShowCalendarTasks("2026-10-05", true, dates), false);
    assert.equal(context.shouldShowCalendarTasks("2026-10-09", true, dates), false);
    for (const date of dates) assert.equal(context.shouldShowCalendarTasks(date, true, dates), true);
    assert.equal(context.shouldShowCalendarTasks("2026-11-06", true, dates), false);
});

test("partial mocks, standalone sections and practice completions do not unlock dates", () => {
    const dates = context.getUnlockedCalendarDates([
        { ...completed("2026-10-05"), status: "in-progress" },
        { ...completed("2026-10-09"), entryKind: "section" }
    ]);
    assert.equal(dates.size, 0);
});

test("unlocks are cumulative, deduplicated and cross month/year boundaries using calendar days", () => {
    const dates = context.getUnlockedCalendarDates([
        completed("2026-10-05"), completed("2026-10-05"), completed("2026-10-09"),
        completed("2026-12-29"), completed("2028-02-28")
    ]);
    assert.equal(dates.size, 12);
    for (const date of ["2026-10-06", "2026-10-12", "2027-01-01", "2028-02-29", "2028-03-02"]) {
        assert.ok(dates.has(date), date);
    }
});

test("undated legacy full mocks use their submission date; invalid history is surfaced", () => {
    const dates = context.getUnlockedCalendarDates([{
        ...completed(""), submittedAt: "2026-10-05T12:00:00"
    }]);
    assert.ok(dates.has("2026-10-06"));
    assert.throws(() => context.getUnlockedCalendarDates([completed("")]), /valid calendar date/);
});

test("locked cells contain no test icons while unlocked cells keep all three sections and statuses", () => {
    const dates = context.getUnlockedCalendarDates([completed("2026-10-05")]);
    assert.equal(context.renderTaskQueue({}, "2026-10-05", true, dates), "");
    assert.equal(context.renderTaskQueue({}, "2026-10-06", false, dates), "");
    const markup = context.renderTaskQueue({}, "2026-10-06", true, dates);
    assert.equal((markup.match(/class="task-token /g) || []).length, 3);
    for (const section of ["listening", "structure", "reading"]) assert.ok(markup.includes(`mock-${section}.png`));
    assert.equal((markup.match(/unattempted\.svg/g) || []).length, 3);
});
