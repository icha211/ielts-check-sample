import { auth, db, googleProvider } from "./firebase-config.js";
import {
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    get,
    ref,
    update
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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
const termsInput = document.getElementById("terms");
const passwordInput = document.getElementById("password");
let isSignUp = true;

function showMessage(message, type = "error") {
    messageEl.textContent = message;
    messageEl.dataset.type = type;
}

function getErrorMessage(error) {
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
        "auth/weak-password": "Choose a password with at least 6 characters."
    };
    return messages[error.code] || error.message || "Sign-up failed. Please try again.";
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

    const email = document.getElementById("email").value.trim();

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
        } else {
            showMessage("Signing in...", "info");
            const credential = await signInWithEmailAndPassword(auth, email, passwordInput.value);
            user = credential.user;
            await saveUserProfile(user);
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
        const email = document.getElementById("email").value.trim();
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
