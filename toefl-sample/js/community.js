import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { onValue, ref, query, orderByChild, limitToLast, push, set, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { validatePost, GROUPS } from "./community-model.js";

export function subscribeCommunity(callback, onError) {
    let generation = 0;
    let listeners = [];
    const stop = onAuthStateChanged(auth, (user) => {
        const version = ++generation;
        listeners.forEach((unsubscribe) => unsubscribe());
        listeners = [];
        const state = { uid: user?.uid || null, user, loading: Boolean(user), connected: false, profile: {}, profiles: {}, posts: {}, members: {} };
        callback({ ...state });
        if (!user) return;
        const ready = new Set();
        listeners.push(onValue(ref(db, ".info/connected"), (snapshot) => {
            if (version !== generation) return;
            state.connected = snapshot.val() === true;
            callback({ ...state });
        }, onError));
        [
            ["profile", ref(db, `users/${user.uid}`)],
            ["profiles", ref(db, "partnerDirectory")],
            ["posts", query(ref(db, "community_posts"), orderByChild("createdAt"), limitToLast(100))],
            ["members", ref(db, "community_members")]
        ].forEach(([key, target]) => {
            listeners.push(onValue(target, (snapshot) => {
                if (version !== generation) return;
                state[key] = snapshot.val() || {};
                ready.add(key);
                state.loading = ready.size < 4;
                callback({ ...state });
            }, (error) => { if (version === generation) onError(error); }));
        });
    }, onError);
    return () => {
        generation++;
        stop();
        listeners.forEach((unsubscribe) => unsubscribe());
    };
}

function requireUser() {
    if (!auth.currentUser) throw new Error("Sign in to take part in the community.");
    return auth.currentUser;
}
function requireId(id) {
    if (typeof id !== "string" || !id || /[.#$/\[\]]/.test(id)) throw new Error("Choose a valid post.");
}
export function subscribePostActivity(id, callback, onError) {
    requireId(id);
    const state = { likes: {}, comments: {} };
    const stops = ["likes", "comments"].map((key) => {
        const target = key === "comments"
            ? query(ref(db, `community_comments/${id}`), orderByChild("createdAt"), limitToLast(100))
            : ref(db, `community_likes/${id}`);
        return onValue(target, (snapshot) => {
            state[key] = snapshot.val() || {};
            callback({ ...state });
        }, onError);
    });
    return () => stops.forEach((stop) => stop());
}

export async function savePost(input, file, developer, editingId = null) {
    const user = requireUser();
    const post = validatePost(input, developer);
    if (editingId) {
        requireId(editingId);
        await update(ref(db, `community_posts/${editingId}`), { ...post, updatedAt: serverTimestamp() });
        return editingId;
    }
    const target = push(ref(db, "community_posts"));
    let uploaded = null;
    const media = { mediaURL: "", mediaPath: "", mediaType: "" };
    if (file) {
        if (!["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"].includes(file.type)) throw new Error("Choose a PNG, JPEG, WebP, MP4, or WebM file.");
        if (file.size > 20 * 1024 * 1024) throw new Error("Media must be 20 MB or smaller.");
        media.mediaPath = `community/${user.uid}/${target.key}/attachment`;
        uploaded = storageRef(getStorage(auth.app), media.mediaPath);
        await uploadBytes(uploaded, file, { contentType: file.type });
    }
    try {
        if (uploaded) {
            media.mediaURL = await getDownloadURL(uploaded);
            media.mediaType = file.type.startsWith("video/") ? "video" : "image";
        }
        await set(target, { ...post, ...media, authorId: user.uid, createdAt: serverTimestamp() });
    } catch (error) {
        if (uploaded) {
            try { await deleteObject(uploaded); }
            catch (cleanupError) { console.error("[Community] Could not clean up an unpublished attachment:", cleanupError); }
        }
        throw error;
    }
    return target.key;
}
export async function removePost(id) {
    requireUser();
    requireId(id);
    await update(ref(db, `community_posts/${id}`), { deletedAt: serverTimestamp() });
}
export async function setPostLike(id, liked) {
    const user = requireUser();
    requireId(id);
    await set(ref(db, `community_likes/${id}/${user.uid}`), liked ? true : null);
}
export async function addComment(id, text) {
    const user = requireUser();
    requireId(id);
    const body = String(text || "").trim();
    if (!body || body.length > 2000) throw new Error("Write a comment of 1 to 2,000 characters.");
    await set(push(ref(db, `community_comments/${id}`)), { authorId: user.uid, body, createdAt: serverTimestamp() });
}
export async function deleteComment(postId, commentId) {
    requireUser();
    requireId(postId);
    requireId(commentId);
    await set(ref(db, `community_comments/${postId}/${commentId}`), null);
}
export async function setGroupMembership(id, joined) {
    const user = requireUser();
    if (!GROUPS.some((group) => group.id === id)) throw new Error("Choose a valid community group.");
    await set(ref(db, `community_members/${id}/${user.uid}`), joined ? true : null);
}
