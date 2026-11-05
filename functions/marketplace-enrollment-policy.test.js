const { test } = require("node:test");
const assert = require("node:assert/strict");
const { reserveSeat, releaseSeat, reservedSeatCount } = require("./marketplace-enrollment-policy");

test("course seats reserve pending and accepted enrollments exactly once", () => {
    const first = reserveSeat({}, "course_student-a", 2);
    assert.equal(first.reason, "");
    assert.equal(first.state.reserved, 1);
    assert.equal(reserveSeat(first.state, "course_student-a", 2).reason, "already-reserved");

    const second = reserveSeat(first.state, "course_student-b", 2);
    assert.equal(second.state.reserved, 2);
    assert.equal(reserveSeat(second.state, "course_student-c", 2).reason, "full");
});

test("accepted legacy records count against capacity and released seats become available", () => {
    const legacy = { students: 1, records: { legacy_request: { accepted: true } } };
    assert.equal(reservedSeatCount(legacy), 1);
    assert.equal(reserveSeat(legacy, "new_request", 1).reason, "full");
    const reserved = reserveSeat(legacy, "new_request", 2).state;
    const released = releaseSeat(reserved, "new_request");
    assert.equal(released.reserved, 1);
    assert.equal(reserveSeat(released, "new_request", 2).reason, "");
});
