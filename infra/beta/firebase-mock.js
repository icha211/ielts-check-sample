const listeners = new Set();
const authListeners = new Set();
const readUser = () => JSON.parse(localStorage.getItem("beta-user") || "null");
function user() {
    const value = readUser();
    if (!value) return null;
    return {
        ...value, isAnonymous: false, app: {}, getIdToken: async () => `beta-token-${value.uid}`,
        getIdTokenResult: async () => ({ claims: { email: value.email, role: value.role, email_verified: value.emailVerified } })
    };
}
export const auth = { app: {}, get currentUser() { return user(); }, authStateReady: async () => {} };
export const db = {};
export const googleProvider = {};
export const getStorage = () => ({});
export const getFunctions = () => ({});
export const httpsCallable = (_, name) => async input => {
    const calls = JSON.parse(localStorage.getItem("beta-call-counts") || "{}");
    calls[name] = (calls[name] || 0) + 1;
    localStorage.setItem("beta-call-counts", JSON.stringify(calls));
    const delay = Number(localStorage.getItem("beta-call-delay") || 0);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (localStorage.getItem("beta-deny-call") === name) throw new Error("Mock service unavailable. Please retry.");
    if (name === "getExploreFeed") {
        const data = readDb(), uid = user()?.uid;
        const preferences = data.explore_preferences?.[uid] || { viewTracking: false, discoverable: false, goals: [], level: "", skills: [], styles: [] };
        const custom = JSON.parse(localStorage.getItem("beta-explore-items") || "null");
        return { data: {
            items: custom || Object.entries(data.community_posts || {}).filter(([, post]) => !post.deletedAt).map(([id]) => ({ type: "post", id })),
            preferences, actions: data.explore_user_actions?.[uid] || {},
            keywords: ["IELTS", "TOEFL", "Speaking", "Listening", "Reading", "Writing", "Grammar", "Vocabulary"],
            practiceOptions: { goals: ["IELTS Preparation", "TOEFL ITP Preparation"], level: ["Beginner", "Intermediate", "Advanced"], skills: ["Speaking", "Listening", "Writing"], styles: ["Voice Call", "Video Call", "Text Conversation"] }
        } };
    }
    if (name === "saveExplorePreferences") {
        const data = readDb();
        (data.explore_preferences ||= {})[user().uid] = input;
        localStorage.setItem("beta-db", JSON.stringify(data));
        return { data: { preferences: input } };
    }
    if (name === "recordExploreInteraction") {
        const data = readDb();
        const key = input.postLocation.startsWith("community_private_posts/") ? `private:${input.postLocation.split("/")[1]}:${input.postId}` : input.postId;
        const actions = ((data.explore_user_actions ||= {})[user().uid] ||= {});
        (actions[key] ||= {})[input.kind] = input.enabled;
        localStorage.setItem("beta-db", JSON.stringify(data));
        return { data: { recorded: true } };
    }
    if (name === "publishCommunityPost") {
        const location = input.post.visibility === "friends" ? `community_private_posts/${user().uid}/${input.postId}` : `community_posts/${input.postId}`;
        await set({ path: location }, { ...input.post, authorId: user().uid, createdAt: Date.now() });
        return { data: { id: input.postId } };
    }
    if (name === "getTutorVerificationStatus") {
        return { data: JSON.parse(localStorage.getItem("beta-verification") || '{"status":"not_requested"}') };
    }
    if (name === "requestTutorVerification") {
        localStorage.setItem("beta-verification", JSON.stringify({ status: "pending", requestedAt: Date.now() }));
        return { data: { status: "pending" } };
    }
    if (name === "listTutorVerificationRequests") {
        return { data: { requests: JSON.parse(localStorage.getItem("beta-verification-queue") || "[]") } };
    }
    if (name === "reviewTutorVerification") {
        const queue = JSON.parse(localStorage.getItem("beta-verification-queue") || "[]");
        localStorage.setItem("beta-verification-queue", JSON.stringify(queue.filter(row => row.uid !== input.uid)));
        return { data: { status: input.status } };
    }
    return { data: {} };
};
export const ref = (_, path) => ({ path });
export const getAdditionalUserInfo = () => ({ isNewUser: true });
export const isSignInWithEmailLink = () => false;
export const sendEmailVerification = async () => {};
export const sendPasswordResetEmail = async () => {};
export const sendSignInLinkToEmail = async () => {};
export const updatePassword = async () => {};
export const updateProfile = async () => {};
export const uploadBytes = async (target, file) => {
    if (localStorage.getItem("beta-deny-media") === "upload") throw new Error("Mock media upload failed");
    const media = JSON.parse(localStorage.getItem("beta-media") || "{}");
    const bytes = new Uint8Array(await file.arrayBuffer());
    media[target.path] = { type: file.type, bytes: Array.from(bytes) };
    localStorage.setItem("beta-media", JSON.stringify(media));
};
export const getDownloadURL = async target => `https://beta-media.example/${encodeURIComponent(target.path)}`;
export const getBlob = async target => {
    if (localStorage.getItem("beta-deny-media") === "download") throw new Error("Mock media download failed");
    const media = JSON.parse(localStorage.getItem("beta-media") || "{}")[target.path];
    if (!media) throw new Error("Mock media is missing");
    return new Blob([new Uint8Array(media.bytes)], { type: media.type });
};
export const deleteObject = async target => {
    if (localStorage.getItem("beta-deny-media") === "delete") throw new Error("Mock media cleanup failed");
    const media = JSON.parse(localStorage.getItem("beta-media") || "{}");
    delete media[target.path];
    localStorage.setItem("beta-media", JSON.stringify(media));
};
export function onAuthStateChanged(_, callback) {
    authListeners.add(callback);
    queueMicrotask(() => callback(user()));
    return () => authListeners.delete(callback);
}
export async function signInWithEmailAndPassword(_, email, password) {
    if (password !== "beta-password") throw Object.assign(new Error("Invalid credentials"), { code: "auth/invalid-credential" });
    const value = { uid: email.startsWith("teacher") ? "teacher" : "student", email, emailVerified: true, displayName: "Beta Teacher" };
    localStorage.setItem("beta-user", JSON.stringify(value));
    authListeners.forEach(callback => callback(user()));
    return { user: user() };
}
export const signInWithPopup = () => { throw new Error("Use the beta email login"); };
export const signInWithEmailLink = signInWithPopup;
export async function signOut() {
    localStorage.removeItem("beta-user");
    authListeners.forEach(callback => callback(null));
}
const readDb = () => JSON.parse(localStorage.getItem("beta-db") || "{}");
function valueAt(target) {
    let value = target.path.split("/").reduce((node, key) => node?.[key], readDb()) ?? null;
    if (target.filter && Object.hasOwn(target.filter, "value") && value) {
        value = Object.fromEntries(Object.entries(value).filter(([, row]) => row?.[target.filter.key] === target.filter.value));
    }
    return value;
}
const snapshot = target => ({ val: () => valueAt(target), exists: () => valueAt(target) !== null });
export const get = async target => snapshot(target);
export function onValue(target, callback, error) {
    const listener = { target, callback };
    listeners.add(listener);
    queueMicrotask(() => {
        if (!listeners.has(listener)) return;
        if (localStorage.getItem("beta-deny-read") === target.path) {
            listeners.delete(listener);
            error?.(new Error("Mock database read failed"));
        } else callback(snapshot(target));
    });
    return () => listeners.delete(listener);
}
function notify() {
    listeners.forEach(({ target, callback }) => callback(snapshot(target)));
}
window.addEventListener("beta-db-updated", notify);
export async function set(target, value) {
    const delay = Number(localStorage.getItem("beta-write-delay") || 0);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (localStorage.getItem("beta-deny-write") === "true") throw new Error("Mock database rejected the save");
    if (localStorage.getItem("beta-deny-write-path") === target.path) throw new Error("Mock database rejected the save");
    if (target.path.startsWith("user_test_history/") && target.path.split("/")[1] !== user()?.uid) throw new Error("Mock owner check failed");
    const data = readDb();
    const parts = target.path.split("/");
    let node = data;
    for (const key of parts.slice(0, -1)) node = node[key] ||= {};
    if (value === null) delete node[parts.at(-1)];
    else node[parts.at(-1)] = value;
    localStorage.setItem("beta-db", JSON.stringify(data));
    // Firebase listeners run after writes, not synchronously inside a form submit.
    setTimeout(() => window.dispatchEvent(new Event("beta-db-updated")), 0);
}
export const update = async (target, values) => {
    if (target.path === "") {
        if (localStorage.getItem("beta-deny-write") === "true") throw new Error("Mock database rejected the save");
        for (const [path, value] of Object.entries(values)) await set({ path }, value);
        return;
    }
    return set(target, { ...(valueAt(target) || {}), ...values });
};
export const remove = target => set(target, null);
export const push = target => ({ path: `${target.path}/beta-${crypto.randomUUID()}`, get key() { return this.path.split("/").at(-1); } });
export const serverTimestamp = () => Date.now();
export const orderByChild = key => ({ key });
export const equalTo = value => ({ value });
export const limitToLast = value => ({ limit: value });
export const query = (target, ...filters) => ({ ...target, filter: { ...filters[0], ...filters[1] } });
export const onDisconnect = () => ({ remove: async () => {}, set: async () => {} });
