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

module.exports = { reserveSeat, releaseSeat, reservedSeatCount };
