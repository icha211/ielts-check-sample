function publicTeacher(user = {}) {
    const fullName = `${user.first_name || user.firstName || ""} ${user.last_name || user.lastName || ""}`.trim();
    const photoURL = String(user.photoURL || "");
    return {
        displayName: String(fullName || user.displayName || user.name || "Teacher").slice(0, 100),
        photoURL: /^https:\/\//.test(photoURL) ? photoURL.slice(0, 2000) : "",
        verified: user.verified === true
    };
}

function enrollmentStats(current, requestId, request, revision) {
    const state = current || { students: 0, records: {} };
    const records = { ...state.records };
    const previous = records[requestId];
    if (previous && (previous.revision > revision ||
        (previous.revision === revision && (previous.accepted || request?.status !== "accepted")))) return state;
    records[requestId] = { accepted: request?.status === "accepted", revision };
    return {
        students: Object.values(records).filter(record => record.accepted).length,
        records
    };
}

module.exports = { publicTeacher, enrollmentStats };
