function seatRequestIds(state = {}) {
    const reservations = Object.keys(state.reservations || {});
    const accepted = Object.entries(state.records || {})
        .filter(([, record]) => record?.accepted === true)
        .map(([id]) => id);
    return new Set([...reservations, ...accepted]);
}

function reserveSeat(state = {}, requestId, capacity = 0) {
    const used = seatRequestIds(state);
    if (used.has(requestId)) return { state, reason: "already-reserved" };
    if (capacity > 0 && used.size >= capacity) return { state, reason: "full" };
    const reservations = { ...(state.reservations || {}), [requestId]: true };
    const next = { ...state, reservations };
    next.reserved = seatRequestIds(next).size;
    return { state: next, reason: "" };
}

function releaseSeat(state = {}, requestId) {
    const reservations = { ...(state.reservations || {}) };
    delete reservations[requestId];
    const next = { ...state, reservations };
    next.reserved = seatRequestIds(next).size;
    return next;
}

function reservedSeatCount(state = {}) {
    return seatRequestIds(state).size;
}

function enrollmentAgreement(course, expected, now = Date.now()) {
    if (course.agreementEnabled !== true) {
        if (expected != null) throw new Error("The course agreement changed. Reopen the course and review its terms.");
        return null;
    }
    const agreement = {
        version: 1, sessionCount: course.sessionCount, sessionDurationMinutes: course.sessionDurationMinutes,
        completionDeadline: course.completionDeadline, cancellationTerms: course.cancellationTerms
    };
    const date = new Date(`${agreement.completionDeadline}T00:00:00.000Z`);
    if (!Number.isSafeInteger(agreement.sessionCount) || agreement.sessionCount < 1 || agreement.sessionCount > 100 ||
        !Number.isSafeInteger(agreement.sessionDurationMinutes) || agreement.sessionDurationMinutes < 1 || agreement.sessionDurationMinutes > 480 ||
        typeof agreement.completionDeadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(agreement.completionDeadline) ||
        Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== agreement.completionDeadline ||
        (course.startDate && agreement.completionDeadline < course.startDate) ||
        typeof agreement.cancellationTerms !== "string" || !agreement.cancellationTerms.trim() || agreement.cancellationTerms.length > 2000) {
        throw new Error("The teacher must complete the course agreement before enrollment.");
    }
    if (now >= date.getTime() + 86400000) throw new Error("The course completion deadline has passed.");
    const terms = { ...agreement, courseTitle: course.title, teacherId: course.teacherId, price: course.price };
    if (!expected || Object.entries(terms).some(([key, value]) => expected[key] !== value)) {
        throw new Error("The course agreement changed. Reopen the course and review its terms.");
    }
    return { ...terms, currency: "IDR", acceptedAt: now };
}

module.exports = { reserveSeat, releaseSeat, reservedSeatCount, enrollmentAgreement };
