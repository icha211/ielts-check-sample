import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { onValue, push, ref, serverTimestamp, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

export function subscribeMessaging(callback, onError) {
    let generation = 0;
    let listeners = [];
    const stopAuth = onAuthStateChanged(auth, (user) => {
        const version = ++generation;
        listeners.forEach((stop) => stop());
        listeners = [];
        const state = { uid: user?.uid || null, loading: Boolean(user), connected: false, profiles: {}, messages: {}, preferences: {}, contacts: {}, receipts: {} };
        callback(state);
        if (!user) return;
        listeners.push(onValue(ref(db, ".info/connected"), (snapshot) => {
            if (version !== generation) return;
            state.connected = snapshot.val() === true;
            callback({ ...state });
        }, (error) => {
            if (version === generation) onError(error);
        }));
        const ready = new Set();
        [
            ["profiles", "partnerDirectory"],
            ["messages", `user_messages/${user.uid}`],
            ["preferences", `message_preferences/${user.uid}`],
            ["contacts", `message_contacts/${user.uid}`],
            ["receipts", `message_receipts/${user.uid}`]
        ].forEach(([key, path]) => {
            listeners.push(onValue(ref(db, path), (snapshot) => {
                if (version !== generation) return;
                state[key] = snapshot.val() || {};
                ready.add(key);
                state.loading = ready.size !== 5;
                callback({ ...state });
            }, (error) => {
                if (version === generation) onError(error);
            }));
        });
    }, (error) => {
        generation += 1;
        listeners.forEach((stop) => stop());
        listeners = [];
        callback({ uid: null, loading: false, connected: false, profiles: {}, messages: {}, preferences: {}, contacts: {}, receipts: {} });
        onError(error);
    });
    return () => {
        generation += 1;
        stopAuth();
        listeners.forEach((stop) => stop());
    };
}

function requireUser() {
    const user = auth.currentUser;
    if (!user) throw new Error("Sign in to send messages.");
    return user;
}

export async function sendMessage(peerId, text) {
    const user = requireUser();
    const trimmed = String(text || "").trim();
    if (!peerId || peerId === user.uid || /[.#$/\[\]]/.test(peerId)) throw new Error("Choose another learner to message.");
    if (!trimmed || trimmed.length > 2000) throw new Error("Messages must contain between 1 and 2,000 characters.");
    const id = push(ref(db, `user_messages/${user.uid}/${peerId}`)).key;
    const message = {
        senderId: user.uid,
        recipientId: peerId,
        text: trimmed,
        sentAt: serverTimestamp()
    };
    await update(ref(db), {
        [`user_messages/${user.uid}/${peerId}/${id}`]: message,
        [`user_messages/${peerId}/${user.uid}/${id}`]: message
    });
    return id;
}

export async function updateMessagePreferences(peerId, changes) {
    const user = requireUser();
    if (!peerId || peerId === user.uid || /[.#$/\[\]]/.test(peerId)) throw new Error("Choose a conversation first.");
    await update(ref(db, `message_preferences/${user.uid}/${peerId}`), changes);
}

export async function markConversationRead(peerId, readAt) {
    const user = requirePeer(peerId);
    if (!Number.isFinite(readAt) || readAt <= 0) throw new Error("A valid message timestamp is required.");
    await update(ref(db), {
        [`message_preferences/${user.uid}/${peerId}/readAt`]: readAt,
        [`message_receipts/${peerId}/${user.uid}/readAt`]: readAt
    });
}

async function changeMessage(peerId, messageId, changes) {
    const user = requirePeer(peerId);
    if (typeof messageId !== "string" || !messageId || /[.#$/\[\]]/.test(messageId)) throw new Error("Choose a message first.");
    const updates = {};
    for (const [field, value] of Object.entries(changes)) {
        updates[`user_messages/${user.uid}/${peerId}/${messageId}/${field}`] = value;
        updates[`user_messages/${peerId}/${user.uid}/${messageId}/${field}`] = value;
    }
    await update(ref(db), updates);
}

export async function editMessage(peerId, messageId, text) {
    const trimmed = String(text || "").trim();
    if (!trimmed || trimmed.length > 2000) throw new Error("Messages must contain between 1 and 2,000 characters.");
    await changeMessage(peerId, messageId, { text: trimmed, editedAt: serverTimestamp() });
}

export async function deleteMessage(peerId, messageId) {
    await changeMessage(peerId, messageId, { text: "Message deleted", deletedAt: serverTimestamp() });
}

function requirePeer(peerId) {
    const user = requireUser();
    if (!peerId || peerId === user.uid || /[.#$/\[\]]/.test(peerId)) throw new Error("Choose another learner.");
    return user;
}

export async function requestConnection(peerId) {
    const user = requirePeer(peerId);
    await update(ref(db), {
        [`message_contacts/${user.uid}/${peerId}`]: { status: "outgoing", requesterId: user.uid, updatedAt: serverTimestamp() },
        [`message_contacts/${peerId}/${user.uid}`]: { status: "incoming", requesterId: user.uid, updatedAt: serverTimestamp() }
    });
}

export async function acceptConnection(peerId) {
    const user = requirePeer(peerId);
    await update(ref(db), {
        [`message_contacts/${user.uid}/${peerId}`]: { status: "connected", requesterId: peerId, updatedAt: serverTimestamp() },
        [`message_contacts/${peerId}/${user.uid}`]: { status: "connected", requesterId: peerId, updatedAt: serverTimestamp() },
        [`community_connections/${user.uid}/${peerId}`]: true,
        [`community_connections/${peerId}/${user.uid}`]: true
    });
}

export async function removeConnection(peerId) {
    const user = requirePeer(peerId);
    await update(ref(db), {
        [`message_contacts/${user.uid}/${peerId}`]: null,
        [`message_contacts/${peerId}/${user.uid}`]: null,
        [`community_connections/${user.uid}/${peerId}`]: null,
        [`community_connections/${peerId}/${user.uid}`]: null
    });
}

export function subscribeContacts(uid, callback, onError) {
    return onValue(ref(db, `message_contacts/${uid}`), (snapshot) => callback(snapshot.val() || {}), onError);
}
