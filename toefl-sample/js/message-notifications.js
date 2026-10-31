import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { get, onValue, ref, query, orderByChild, limitToLast, serverTimestamp, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const MAX_NOTIFICATIONS = 20;

export function acceptedRequestNotifications(uid, contacts, seenAt = 0) {
    if (!uid) return [];
    const seen = Number(seenAt) || 0;
    return Object.entries(contacts || {})
        .filter(([peerId, contact]) => peerId !== uid && contact?.status === "connected" && contact.requesterId === uid)
        .map(([peerId, contact]) => {
            const acceptedAt = Number(contact.updatedAt) || 0;
            return { peerId, acceptedAt, unread: acceptedAt > seen };
        })
        .sort((a, b) => b.acceptedAt - a.acceptedAt)
        .slice(0, MAX_NOTIFICATIONS);
}

export function friendPostNotifications(uid, contacts, posts, seenAt = 0) {
    if (!uid) return [];
    return Object.entries(posts || {}).flatMap(([postId, post]) => {
        const contact = contacts?.[post?.authorId];
        const createdAt = Number(post?.createdAt);
        if (!post || post.authorId === uid || contact?.status !== "connected" || post.deletedAt ||
            !Number.isFinite(createdAt) || createdAt <= 0 || createdAt < (Number(contact.updatedAt) || 0)) return [];
        return [{ type: "post", postId, peerId: post.authorId, acceptedAt: createdAt, unread: createdAt > (Number(seenAt) || 0), visibility: post.visibility === "friends" ? "friends" : "public" }];
    }).sort((a, b) => b.acceptedAt - a.acceptedAt).slice(0, MAX_NOTIFICATIONS);
}

function relativeTime(timestamp) {
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 60) return "Just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderNotifications(items, names, signedIn, highlightAfter, errorMessage = "") {
    const unread = items.filter((item) => item.unread).length;
    const label = unread > 9 ? "9+" : String(unread);
    document.querySelectorAll("[data-notify-badge]").forEach((badge) => {
        badge.textContent = label;
        badge.hidden = unread === 0;
    });
    const button = document.getElementById("qcnavNotifyBtn");
    if (button) button.setAttribute("aria-label", unread ? `Notifications, ${unread} new` : "Notifications");
    const list = document.getElementById("qcnavNotifyList");
    if (!list) return;
    list.replaceChildren();
    if (errorMessage) {
        const error = document.createElement("p");
        error.className = "qcnav-notify-empty";
        error.setAttribute("role", "alert");
        error.textContent = errorMessage;
        list.append(error);
    }
    if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "qcnav-notify-empty";
        empty.textContent = signedIn
            ? "No notifications yet. Friends' new posts and accepted message requests show up here."
            : "Sign in to see notifications.";
        list.append(empty);
        return;
    }
    items.forEach((item) => {
        const link = document.createElement("a");
        link.className = `qcnav-notify-item${item.acceptedAt > highlightAfter ? " is-new" : ""}`;
        link.href = item.type === "post" ? `social.html#post-${encodeURIComponent(item.postId)}` : `message.html?to=${encodeURIComponent(item.peerId)}`;
        const icon = document.createElement("span");
        icon.className = "qcnav-notify-ico";
        icon.innerHTML = item.type === "post" ? '<i data-lucide="pencil-line"></i>' : '<i data-lucide="user-check"></i>';
        const copy = document.createElement("span");
        copy.className = "qcnav-notify-copy";
        const text = document.createElement("span");
        const name = document.createElement("b");
        name.textContent = names.get(item.peerId) || "A learner";
        text.append(name, item.type === "post"
            ? (item.visibility === "friends" ? " shared a friends-only post." : " shared a new post.")
            : " accepted your message request. You can start chatting now.");
        const time = document.createElement("small");
        time.textContent = item.acceptedAt ? relativeTime(item.acceptedAt) : "";
        copy.append(text, time);
        link.append(icon, copy);
        list.append(link);
    });
    window.lucide?.createIcons?.();
}

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
    let notify;
    const privateStops = new Map();
    const privatePosts = new Map();
    const allItems = () => [
        ...acceptedRequestNotifications(notify.uid, notify.contacts, notify.seenAt),
        ...friendPostNotifications(notify.uid, notify.contacts, Object.assign({}, notify.posts, ...privatePosts.values()), notify.seenAt)
    ].sort((a, b) => b.acceptedAt - a.acceptedAt).slice(0, MAX_NOTIFICATIONS);
    const panelOpen = () => document.getElementById("qcnavNotifyPanel")?.hidden === false;
    const refreshNotifications = () => {
        const items = allItems();
        const highlightAfter = panelOpen() && notify.openedSeenAt !== null ? notify.openedSeenAt : notify.seenAt;
        renderNotifications(items, notify.names, Boolean(notify.uid), highlightAfter, notify.error);
        return items;
    };
    const loadNames = (version, items) => {
        items.filter((item) => !notify.names.has(item.peerId)).forEach((item) => {
            notify.names.set(item.peerId, "");
            get(ref(db, `partnerDirectory/${item.peerId}/displayName`)).then((snapshot) => {
                if (version !== generation) return;
                const name = snapshot.val();
                if (typeof name === "string" && name.trim()) {
                    notify.names.set(item.peerId, name.trim());
                    refreshNotifications();
                }
            }).catch((error) => {
                if (version !== generation) return;
                console.error("[MessageNotifications] Could not load notification author:", error);
                notify.error = "Some notification names could not load. Refresh to retry.";
                refreshNotifications();
            });
        });
    };
    const markSeen = () => {
        if (!notify.uid) return;
        notify.openedSeenAt = notify.seenAt;
        const hasUnread = allItems().some((item) => item.unread);
        refreshNotifications();
        if (!hasUnread) return;
        const version = generation;
        set(ref(db, `notification_state/${notify.uid}`), { acceptedSeenAt: serverTimestamp() }).catch((error) => {
            if (version !== generation) return;
            console.error("[MessageNotifications] Could not mark notifications as seen:", error);
            notify.error = "Notifications could not be marked as read. Refresh to retry.";
            refreshNotifications();
        });
    };
    window.addEventListener?.("toefl-notifications-opened", markSeen);
    const stopListeners = () => {
        listeners.forEach((stop) => stop());
        listeners = [];
        privateStops.forEach((stop) => stop());
        privateStops.clear();
        privatePosts.clear();
    };
    const resetNotifications = (uid = null) => {
        notify = { uid, contacts: {}, posts: {}, error: "", seenAt: 0, openedSeenAt: null, names: new Map() };
        refreshNotifications();
    };
    renderBadges(0);
    resetNotifications();
    const stopAuth = onAuthStateChanged(auth, (user) => {
        const version = ++generation;
        stopListeners();
        renderBadges(0);
        resetNotifications(user?.uid || null);
        if (!user) return;
        const state = { messages: {}, preferences: {}, contacts: {} };
        const update = () => {
            if (version === generation) renderBadges(countUnreadMessages(user.uid, state.messages, state.preferences, state.contacts));
        };
        const fail = (error) => {
            if (version !== generation) return;
            console.error("[MessageNotifications] Notifications could not sync:", error);
            notify.error = "Notifications could not sync. Refresh to retry.";
            refreshNotifications();
        };
        listeners.push(
            onValue(query(ref(db, "community_posts"), orderByChild("createdAt"), limitToLast(100)), (snapshot) => {
                if (version !== generation) return;
                notify.posts = snapshot.val() || {};
                loadNames(version, refreshNotifications());
            }, fail),
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
                if (version !== generation) return;
                notify.contacts = state.contacts;
                const friends = new Set(Object.entries(state.contacts).filter(([uid, contact]) => uid !== user.uid && contact?.status === "connected").map(([uid]) => uid));
                privateStops.forEach((stop, uid) => {
                    if (!friends.has(uid)) {
                        stop();
                        privateStops.delete(uid);
                        privatePosts.delete(uid);
                        notify.names.delete(uid);
                    }
                });
                friends.forEach((uid) => {
                    if (privateStops.has(uid)) return;
                    const target = query(ref(db, `community_private_posts/${uid}`), orderByChild("createdAt"), limitToLast(MAX_NOTIFICATIONS));
                    let active = true;
                    const stop = onValue(target, (data) => {
                        if (!active || version !== generation || notify.contacts[uid]?.status !== "connected") return;
                        privatePosts.set(uid, data.val() || {});
                        loadNames(version, refreshNotifications());
                    }, (error) => {
                        if (!active || version !== generation || notify.contacts[uid]?.status !== "connected") return;
                        privatePosts.delete(uid);
                        fail(error);
                    });
                    privateStops.set(uid, () => { active = false; stop(); });
                });
                loadNames(version, refreshNotifications());
            }, fail),
            onValue(ref(db, `notification_state/${user.uid}`), (snapshot) => {
                if (version !== generation) return;
                notify.seenAt = Number(snapshot.val()?.acceptedSeenAt) || 0;
                refreshNotifications();
            }, fail)
        );
    }, (error) => {
        generation += 1;
        stopListeners();
        renderBadges(0);
        resetNotifications();
        console.error("[MessageNotifications] Authentication failed:", error);
    });
    return () => {
        generation += 1;
        stopAuth();
        stopListeners();
        window.removeEventListener?.("toefl-notifications-opened", markSeen);
    };
}

startMessageNotifications();
