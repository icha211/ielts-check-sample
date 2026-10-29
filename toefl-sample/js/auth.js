import { auth, db, googleProvider } from "./firebase-config.js";
import {
    createUserWithEmailAndPassword,
    sendEmailVerification,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    get,
    ref,
    update
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

const DEVELOPER_EMAIL = "quickcheck.edu@gmail.com";
const developerFunctions = getFunctions(auth.app, "australia-southeast1");
const ensureDeveloperRole = httpsCallable(developerFunctions, "ensureDeveloperRole");
const authForm = document.getElementById("authForm");
const googleSignInButton = document.getElementById("google-signin-button");
const messageEl = document.getElementById("auth-message");
const authCard = document.getElementById("authCard");
const authHeading = document.getElementById("authHeading");
const submitButton = document.getElementById("submitBtn");
const authFooter = document.getElementById("authFooter");
const firstNameInput = document.getElementById("firstName");
const lastNameInput = document.getElementById("lastName");
const nationalityInput = document.getElementById("nationality");
const emailInput = document.getElementById("email");
const termsInput = document.getElementById("terms");
const passwordInput = document.getElementById("password");
let isSignUp = true;

function showMessage(message, type = "error") {
    messageEl.textContent = message;
    messageEl.dataset.type = type;
}

function getErrorMessage(error) {
    if (error.code === "developer/email-not-verified" || error.code === "auth/email-not-verified") {
        return error.message;
    }

    if (error.code === "functions/permission-denied") {
        return "Developer CRUD access requires a verified quickcheck.edu@gmail.com account. Verify that email, then sign in again.";
    }

    if (error.code === "auth/unauthorized-domain") {
        return `Google sign-in is blocked for "${window.location.hostname}". Add this hostname in Firebase Console under Authentication > Settings > Authorized domains, then try again.`;
    }

    const messages = {
        "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
        "auth/invalid-email": "Enter a valid email address.",
        "auth/invalid-credential": "The email or password is incorrect. For the developer account, use Forgot password to reset its Firebase password.",
        "auth/operation-not-allowed": "Email and password sign-up is not enabled in Firebase Authentication.",
        "auth/popup-closed-by-user": "The Google sign-in window was closed before sign-in finished.",
        "auth/user-not-found": "No account was found for this email. Check the address or create an account.",
        "auth/wrong-password": "The password is incorrect. Use Forgot password to reset it.",
        "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
        "auth/weak-password": "Choose a password with at least 6 characters."
    };
    return messages[error.code] || error.message || "Sign-up failed. Please try again.";
}

async function saveDeveloperSession(user, password) {
    if (!user.emailVerified) {
        await sendEmailVerification(user);
        throw Object.assign(
            new Error("A verification email was sent to quickcheck.edu@gmail.com. Verify the address, then sign in again to enable developer CRUD."),
            { code: "developer/email-not-verified" }
        );
    }

    await ensureDeveloperRole();
    await user.getIdToken(true);

    const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(auth.app.options.apiKey)}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: user.email,
                password,
                returnSecureToken: true
            })
        }
    );
    const session = await response.json();
    if (!response.ok) {
        throw new Error(session.error?.message || "Could not create the developer CRUD session.");
    }
    if (session.localId !== user.uid || !session.idToken || !session.refreshToken) {
        throw new Error("Firebase returned an invalid developer CRUD session.");
    }

    const encodedPayload = session.idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const tokenPayload = JSON.parse(atob(encodedPayload.padEnd(Math.ceil(encodedPayload.length / 4) * 4, "=")));
    if (tokenPayload.role !== "developer") {
        throw new Error("Firebase did not issue the developer role claim. Sign in again and retry.");
    }

    localStorage.setItem("toefl_firebase_id_token", session.idToken);
    localStorage.setItem("toefl_firebase_id_token_expiry", String(Date.now() + Number(session.expiresIn || 3600) * 1000));
    localStorage.setItem("toefl_firebase_refresh_token", session.refreshToken);
    localStorage.setItem("toefl_firebase_auth_email", DEVELOPER_EMAIL);
    localStorage.setItem("toefl_firebase_auth_mode", "developer");
}

async function requireVerifiedEmail(user) {
    if (user.emailVerified) return;

    try {
        await sendEmailVerification(user);
    } catch (error) {
        // Firebase rate-limits resends; the earlier link still works.
        console.warn("Could not resend verification email:", error);
    }
    await signOut(auth);
    throw Object.assign(
        new Error(`Your email is not verified yet. We sent a new verification link to ${user.email}. Open it, then sign in again.`),
        { code: "auth/email-not-verified" }
    );
}

async function saveUserProfile(user, profile = {}) {
    const userRef = ref(db, `users/${user.uid}`);
    const existingProfile = await get(userRef);
    const currentProfile = existingProfile.val() || {};
    const nameParts = (user.displayName || "").trim().split(/\s+/);
    const firstName = profile.firstName ?? currentProfile.first_name ?? currentProfile.firstName ?? nameParts.shift() ?? "";
    const lastName = profile.lastName ?? currentProfile.last_name ?? currentProfile.lastName ?? nameParts.join(" ");
    const userProfile = {
        uid: user.uid,
        email: user.email || "",
        first_name: firstName,
        last_name: lastName
    };

    const nationality = profile.nationality || currentProfile.nationality;
    const phone = profile.phone || currentProfile.phone_number;
    if (nationality) userProfile.nationality = nationality;
    if (phone) userProfile.phone_number = phone;
    if (!existingProfile.exists()) userProfile.created_at = Date.now();

    await update(userRef, userProfile);
}

function setSubmitting(isSubmitting) {
    submitButton.disabled = isSubmitting;
    googleSignInButton.disabled = isSubmitting;
}

function setAuthMode(signUp) {
    isSignUp = signUp;
    if (!isSignUp) emailInput.value = DEVELOPER_EMAIL;
    authCard.classList.toggle("signin-mode", !isSignUp);
    authHeading.textContent = isSignUp ? "Master Your TOEFL ITP Journey" : "Welcome Back";
    submitButton.textContent = isSignUp ? "Sign Up" : "Sign In";
    passwordInput.autocomplete = isSignUp ? "new-password" : "current-password";
    passwordInput.minLength = isSignUp ? 6 : 0;
    firstNameInput.required = isSignUp;
    lastNameInput.required = isSignUp;
    nationalityInput.required = isSignUp;
    termsInput.required = isSignUp;
    authFooter.innerHTML = isSignUp
        ? 'Already have an account? <a href="#" id="toggleAuthMode">Sign In</a>'
        : 'Don\'t have an account? <a href="#" id="toggleAuthMode">Sign Up</a><br><a href="#" id="resetPassword">Forgot password?</a>';
    messageEl.textContent = "";
}

export async function handleEmailAuth(event) {
    event.preventDefault();
    setSubmitting(true);

    const email = emailInput.value.trim();

    try {
        let user;
        if (isSignUp) {
            showMessage("Creating your account...", "info");
            const firstName = firstNameInput.value.trim();
            const lastName = lastNameInput.value.trim();
            const nationality = nationalityInput.value;
            const phone = document.getElementById("phone").value.trim();
            const credential = await createUserWithEmailAndPassword(auth, email, passwordInput.value);
            user = credential.user;
            const displayName = `${firstName} ${lastName}`.trim();
            await updateProfile(user, { displayName });
            await saveUserProfile(user, { firstName, lastName, nationality, phone });
            // The account stays locked until the user proves the inbox exists by opening the link.
            await sendEmailVerification(user);
            await signOut(auth);
            setAuthMode(false);
            emailInput.value = email;
            passwordInput.value = "";
            showMessage(`We sent a verification link to ${email}. Open it to activate your account, then sign in. Check your spam folder if you don't see it.`, "info");
            setSubmitting(false);
            return;
        } else {
            showMessage("Signing in...", "info");
            const credential = await signInWithEmailAndPassword(auth, email, passwordInput.value);
            user = credential.user;
            if (user.email?.toLowerCase() === DEVELOPER_EMAIL) {
                await saveUserProfile(user);
                showMessage("Preparing developer access...", "info");
                await saveDeveloperSession(user, passwordInput.value);
            } else {
                await requireVerifiedEmail(user);
                await saveUserProfile(user);
            }
        }
        window.location.assign("index.html");
    } catch (error) {
        console.error(isSignUp ? "Sign-up error:" : "Sign-in error:", error);
        showMessage(getErrorMessage(error));
        setSubmitting(false);
    }
}

export async function handleGoogleSignIn() {
    setSubmitting(true);
    showMessage("Connecting to Google...", "info");

    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        await saveUserProfile(user);
        window.location.assign("index.html");
    } catch (error) {
        console.error("Google sign-in error:", error);
        showMessage(getErrorMessage(error));
        setSubmitting(false);
    }
}

if (new URLSearchParams(window.location.search).get("verify") === "required") {
    setAuthMode(false);
    emailInput.value = "";
    showMessage("Please verify your email address before continuing. Sign in to receive a new verification link.", "error");
}

authForm.addEventListener("submit", handleEmailAuth);
googleSignInButton.addEventListener("click", handleGoogleSignIn);
authFooter.addEventListener("click", (event) => {
    if (event.target.closest("#toggleAuthMode")) {
        event.preventDefault();
        setAuthMode(!isSignUp);
        return;
    }

    if (event.target.closest("#resetPassword")) {
        event.preventDefault();
        const email = emailInput.value.trim();
        if (!email) {
            showMessage("Enter your account email first, then choose Forgot password.", "error");
            return;
        }

        sendPasswordResetEmail(auth, email)
            .then(() => showMessage("Password reset email sent. Check your inbox and spam folder.", "info"))
            .catch((error) => {
                console.error("Password reset error:", error);
                showMessage(getErrorMessage(error));
            });
    }
});
