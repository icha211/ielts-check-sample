const { test } = require("node:test");
const assert = require("node:assert/strict");
const { reserveSeat, releaseSeat, reservedSeatCount, enrollmentAgreement } = require("./marketplace-enrollment-policy");

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

test("enrollment snapshots retain agreed terms and reject unconfirmed, changed and expired agreements", () => {
    const course = { agreementEnabled: true, title: "Five lessons", teacherId: "teacher", price: 250000,
        sessionCount: 5, sessionDurationMinutes: 60, completionDeadline: "2027-01-31", cancellationTerms: "Make up missed sessions." };
    const expected = { version: 1, sessionCount: 5, sessionDurationMinutes: 60, completionDeadline: "2027-01-31", cancellationTerms: course.cancellationTerms,
        courseTitle: course.title, teacherId: course.teacherId, price: course.price };
    const now = Date.parse("2027-01-31T23:59:59Z");
    const snapshot = enrollmentAgreement(course, expected, now);
    course.sessionCount = 8;
    assert.equal(snapshot.sessionCount, 5);
    assert.equal(snapshot.price, 250000);
    assert.equal(snapshot.acceptedAt, now);
    assert.throws(() => enrollmentAgreement(course, expected, now), /changed/);
    course.sessionCount = 5;
    assert.throws(() => enrollmentAgreement({ ...course, price: 300000 }, expected, now), /changed/);
    assert.throws(() => enrollmentAgreement(course, null, now), /changed/);
    assert.throws(() => enrollmentAgreement(course, expected, Date.parse("2027-02-01T00:00:00Z")), /passed/);
    assert.throws(() => enrollmentAgreement({ ...course, completionDeadline: "2027-02-30" }, expected, now), /complete/);
    assert.equal(enrollmentAgreement({}, null, now), null);
    assert.throws(() => enrollmentAgreement({}, expected, now), /changed/);
});
