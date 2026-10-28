import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { onValue, ref } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

export function countUnreadMessages(uid, messages, preferences, contacts = {}) {
    if (!uid) return 0;
    const unread = Object.entries(messages || {}).reduce((total, [peerId, thread]) => {
        const preference = (preferences || {})[peerId] || {};
        if (preference.deleted === true) return total;
        const readAt = Number(preference.readAt) || 0;
        return total + Object.values(thread || {}).filter((message) =>
            message && message.senderId === peerId && message.recipientId === uid && Number(message.sentAt) > readAt
        ).length;
    }, 0);
    const requests = Object.entries(contacts || {}).filter(([peerId, contact]) =>
        peerId !== uid && contact?.status === "incoming"
    ).length;
    return unread + requests;
}

function renderBadges(count) {
    const label = count > 99 ? "99+" : String(count);
    document.querySelectorAll("[data-message-badge]").forEach((badge) => {
        badge.textContent = label;
        badge.hidden = count === 0;
    });
    document.querySelectorAll("[data-message-link]").forEach((link) => {
        const name = link.dataset.messageLink;
        link.setAttribute("aria-label", count ? `${name}, ${count} unread ${count === 1 ? "notification" : "notifications"}` : name);
    });
    window.dispatchEvent(new CustomEvent("toefl-unread-messages", { detail: { count } }));
}

export function startMessageNotifications() {
    let generation = 0;
    let listeners = [];
    const stopListeners = () => {
        listeners.forEach((stop) => stop());
        listeners = [];
    };
    renderBadges(0);
    const stopAuth = onAuthStateChanged(auth, (user) => {
        const version = ++generation;
        stopListeners();
        renderBadges(0);
        if (!user) return;
        const state = { messages: {}, preferences: {}, contacts: {} };
        const update = () => {
            if (version === generation) renderBadges(countUnreadMessages(user.uid, state.messages, state.preferences, state.contacts));
        };
        const fail = (error) => {
            if (version === generation) console.error("[MessageNotifications] Unread count could not sync:", error);
        };
        listeners.push(
            onValue(ref(db, `user_messages/${user.uid}`), (snapshot) => {
                state.messages = snapshot.val() || {};
                update();
            }, fail),
            onValue(ref(db, `message_preferences/${user.uid}`), (snapshot) => {
                state.preferences = snapshot.val() || {};
                update();
            }, fail),
            onValue(ref(db, `message_contacts/${user.uid}`), (snapshot) => {
                state.contacts = snapshot.val() || {};
                update();
            }, fail)
        );
    }, (error) => {
        generation += 1;
        stopListeners();
        renderBadges(0);
        console.error("[MessageNotifications] Authentication failed:", error);
    });
    return () => {
        generation += 1;
        stopAuth();
        stopListeners();
    };
}

startMessageNotifications();
