import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { onValue, ref, query, orderByChild, limitToLast, push, set, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { validatePost, validateMediaFile, GROUPS } from "./community-model.js?v=20261104-short-video";
import { compressImageToLimit } from "./image-compress.js?v=20261031-compress";

const postLocations = new Map();
function postPath(id) {
    const location = postLocations.get(id);
    if (!location) throw new Error("This post is no longer available. Refresh the feed.");
    return location;
}
function activityPath(id, kind) {
    const location = postPath(id);
    return location.startsWith("community_private_posts/")
        ? location.replace("community_private_posts/", `community_private_${kind}/`)
        : `community_${kind}/${id}`;
}
export function subscribeCommunity(callback, onError) {
    let generation = 0;
    let listeners = [];
    const stop = onAuthStateChanged(auth, (user) => {
        const version = ++generation;
        listeners.forEach((unsubscribe) => unsubscribe());
        listeners = [];
        postLocations.clear();
        const state = { uid: user?.uid || null, user, loading: Boolean(user), connected: false, profile: {}, profiles: {}, posts: {}, members: {}, blocks: {} };
        callback({ ...state });
        if (!user) {
            state.loading = false;
            callback({ ...state });
            return;
        }
        const publicPosts = {};
        const privatePosts = new Map();
        const privateStops = new Map();
        const publish = () => {
            if (version !== generation) return;
            const merged = Object.assign({}, publicPosts.value || {}, ...privatePosts.values());
            const visible = Object.fromEntries(Object.entries(merged).filter(([, post]) => !state.blocks[post.authorId]));
            state.posts = Object.fromEntries(Object.entries(visible).sort(([, a], [, b]) => b.createdAt - a.createdAt));
            postLocations.clear();
            Object.keys(publicPosts.value || {}).forEach((id) => postLocations.set(id, `community_posts/${id}`));
            privatePosts.forEach((posts, author) => Object.keys(posts).forEach((id) => postLocations.set(id, `community_private_posts/${author}/${id}`)));
            callback({ ...state });
        };
        listeners.push(onValue(query(ref(db, "community_posts"), orderByChild("createdAt"), limitToLast(100)), (snapshot) => {
            if (version !== generation) return;
            publicPosts.value = snapshot.val() || {};
            publish();
        }, onError));
        const ready = new Set();
        listeners.push(onValue(ref(db, ".info/connected"), (snapshot) => {
            if (version !== generation) return;
            state.connected = snapshot.val() === true;
            callback({ ...state });
        }, onError));
        [
            ["profile", ref(db, `users/${user.uid}`)],
            ["profiles", ref(db, "partnerDirectory")],
            ["members", ref(db, "community_members")],
            ["blocks", ref(db, `community_blocks/${user.uid}`)]
        ].forEach(([key, target]) => {
            listeners.push(onValue(target, (snapshot) => {
                if (version !== generation) return;
                state[key] = snapshot.val() || {};
                ready.add(key);
                state.loading = ready.size < 4;
                publish();
            }, (error) => { if (version === generation) onError(error); }));
        });
        listeners.push(() => privateStops.forEach((dispose) => dispose()));
        listeners.push(onValue(ref(db, `message_contacts/${user.uid}`), (snapshot) => {
            if (version !== generation) return;
            const authors = new Set([user.uid, ...Object.entries(snapshot.val() || {}).filter(([, contact]) => contact.status === "connected").map(([uid]) => uid)]);
            privateStops.forEach((dispose, author) => {
                if (!authors.has(author)) {
                    dispose();
                    privateStops.delete(author);
                    privatePosts.delete(author);
                }
            });
            publish();
            authors.forEach((author) => {
                if (privateStops.has(author)) return;
                const target = query(ref(db, `community_private_posts/${author}`), orderByChild("createdAt"), limitToLast(100));
                privateStops.set(author, onValue(target, (data) => {
                    if (version !== generation) return;
                    privatePosts.set(author, data.val() || {});
                    publish();
                }, (error) => {
                    if (version !== generation) return;
                    privateStops.delete(author);
                    privatePosts.delete(author);
                    publish();
                    onError(error);
                }));
            });
        }, onError));
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
            ? query(ref(db, activityPath(id, "comments")), orderByChild("createdAt"), limitToLast(100))
            : ref(db, activityPath(id, "likes"));
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
        const location = postPath(editingId);
        if ((post.visibility === "friends") !== location.startsWith("community_private_posts/")) throw new Error("Audience cannot be changed after publishing. Create a new post instead.");
        await update(ref(db, location), { ...post, updatedAt: serverTimestamp() });
        return editingId;
    }
    if (file) {
        const mediaType = validateMediaFile(file);
        if (mediaType === "image") {
            try {
                const result = await compressImageToLimit(file, 2 * 1024 * 1024);
                file = result.blob;
            } catch (error) {
                throw new Error("This picture could not be compressed. Choose another picture and try again.", { cause: error });
            }
            if (file.size > 2 * 1024 * 1024) throw new Error("The compressed picture must be 2 MB or smaller.");
        }
        if (auth.currentUser?.uid !== user.uid) throw new Error("Your account changed. Sign in again before posting.");
    }
    const collection = post.visibility === "friends" ? `community_private_posts/${user.uid}` : "community_posts";
    const target = push(ref(db, collection));
    let uploaded = null;
    const media = { mediaURL: "", mediaPath: "", mediaType: "", mediaKey: "", mediaIV: "", ...(post.visibility === "friends" ? { mediaMime: file?.type || "" } : {}) };
    try {
        if (file) {
            media.mediaType = validateMediaFile(file);
            media.mediaPath = `${post.visibility === "friends" ? "community-private" : "community"}/${user.uid}/${target.key}/attachment`;
            uploaded = storageRef(getStorage(auth.app), media.mediaPath);
            if (post.visibility === "friends") {
                const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await file.arrayBuffer());
                media.mediaKey = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("raw", key))));
                media.mediaIV = btoa(String.fromCharCode(...iv));
                await uploadBytes(uploaded, new Blob([encrypted]), { contentType: "application/octet-stream" });
            } else {
                await uploadBytes(uploaded, file, { contentType: file.type });
            }
        }
        if (uploaded) {
            media.mediaURL = await getDownloadURL(uploaded);
        }
        const functions = getFunctions(auth.app, "asia-southeast1");
        await httpsCallable(functions, "publishCommunityPost")({ postId: target.key, post: { ...post, ...media } });
        postLocations.set(target.key, `${collection}/${target.key}`);
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
    await update(ref(db, postPath(id)), { deletedAt: serverTimestamp() });
}
export async function setPostLike(id, liked) {
    const user = requireUser();
    requireId(id);
    await set(ref(db, `${activityPath(id, "likes")}/${user.uid}`), liked ? serverTimestamp() : null);
}
export async function addComment(id, text) {
    requireUser();
    requireId(id);
    const body = String(text || "").trim();
    if (!body || body.length > 2000) throw new Error("Write a comment of 1 to 2,000 characters.");
    const functions = getFunctions(auth.app, "asia-southeast1");
    await httpsCallable(functions, "createCommunityComment")({ postId: id, postLocation: postPath(id), body });
}
export async function reportCommunityContent(id, targetType, targetId, reason) {
    requireUser();
    requireId(id);
    if (!["post", "comment"].includes(targetType)) throw new Error("Choose a valid report target.");
    if (targetType === "comment") requireId(targetId);
    const functions = getFunctions(auth.app, "asia-southeast1");
    await httpsCallable(functions, "createCommunityReport")({
        postId: id, postLocation: postPath(id), targetType, targetId: targetType === "post" ? id : targetId, reason
    });
}
export async function setCommunityBlock(uid, blocked) {
    const user = requireUser();
    requireId(uid);
    if (uid === user.uid) throw new Error("You cannot block your own account.");
    await set(ref(db, `community_blocks/${user.uid}/${uid}`), blocked ? true : null);
}
export async function deleteComment(postId, commentId) {
    requireUser();
    requireId(postId);
    requireId(commentId);
    await set(ref(db, `${activityPath(postId, "comments")}/${commentId}`), null);
}
export async function loadPrivateMedia(post, signal) {
    const decode = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    const response = await fetch(post.mediaURL, { signal });
    if (!response.ok) throw new Error("This attachment could not load.");
    const key = await crypto.subtle.importKey("raw", decode(post.mediaKey), "AES-GCM", false, ["decrypt"]);
    const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(post.mediaIV) }, key, await response.arrayBuffer());
    return new Blob([bytes], { type: post.mediaMime });
}
export async function setGroupMembership(id, joined) {
    const user = requireUser();
    if (!GROUPS.some((group) => group.id === id)) throw new Error("Choose a valid community group.");
    await set(ref(db, `community_members/${id}/${user.uid}`), joined ? true : null);
}
export async function recordExploreInteraction(id, kind, enabled = true, details = {}) {
    requireUser();
    requireId(id);
    const functions = getFunctions(auth.app, "asia-southeast1");
    return (await httpsCallable(functions, "recordExploreInteraction")({
        ...details, postId: id, postLocation: postPath(id), kind, enabled
    })).data;
}
