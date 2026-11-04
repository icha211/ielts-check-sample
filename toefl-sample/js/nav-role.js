import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Navigation hint only; marketplace rules and callables enforce teacher access server-side.
export function watchNavRole(callback) {
    let stopRole = () => {};
    const stopAuth = onAuthStateChanged(auth, (user) => {
        stopRole();
        stopRole = () => {};
        if (!user) return callback("student");
        stopRole = onValue(ref(db, `tutor_roles/${user.uid}`),
            (snap) => callback(snap.val() === "teacher" ? "teacher" : "student"),
            (error) => console.error("[NavRole] Could not load account role:", error));
    });
    return () => { stopRole(); stopAuth(); };
}
