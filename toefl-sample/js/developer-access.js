import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export const DEVELOPER_EMAIL = "quickcheck.edu@gmail.com";

export function isDeveloperUser(user) {
    return Boolean(user?.emailVerified && user.email?.toLowerCase() === DEVELOPER_EMAIL);
}

// UI gate only; Firebase rules enforce the same email + verified + role check server-side.
export function watchDeveloperAccess(callback) {
    return onAuthStateChanged(auth, (user) => callback(isDeveloperUser(user), user));
}
