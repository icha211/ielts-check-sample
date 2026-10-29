import { auth, db, googleProvider } from "./firebase-config.js";
import {
    getAdditionalUserInfo,
    isSignInWithEmailLink,
    sendEmailVerification,
    sendPasswordResetEmail,
    sendSignInLinkToEmail,
    signInWithEmailAndPassword,
    signInWithEmailLink,
    signInWithPopup,
    signOut,
    updatePassword,
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
const passwordGroup = document.getElementById("passwordGroup");
const phoneInput = document.getElementById("phone");
const PENDING_SIGNUP_KEY = "toefl_pending_signup";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const DISPOSABLE_EMAIL_DOMAINS = new Set([
    "10minutemail.com", "20minutemail.com", "dispostable.com", "emailondeck.com", "fakeinbox.com",
    "getnada.com", "guerrillamail.com", "guerrillamail.net", "maildrop.cc", "mailinator.com",
    "mailnesia.com", "mintemail.com", "mohmal.com", "sharklasers.com", "spamgourmet.com",
    "temp-mail.org", "tempmail.com", "tempmail.dev", "tempmailo.com", "throwawaymail.com",
    "trashmail.com", "yopmail.com"
]);
let isSignUp = true;
let isCompletingSignUp = false;
let activatedUser = null;

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
        "auth/operation-not-allowed": "Email sign-up is not enabled. In Firebase Console, open Authentication > Sign-in method > Email/Password and turn on Email link (passwordless sign-in).",
        "auth/popup-closed-by-user": "The Google sign-in window was closed before sign-in finished.",
        "auth/user-not-found": "No account was found for this email. Check the address or create an account.",
        "auth/wrong-password": "The password is incorrect. Use Forgot password to reset it.",
        "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
        "auth/disposable-email": "Temporary or disposable email addresses are not allowed. Use an email you can access long term.",
        "auth/email-domain-unreachable": "This email domain cannot receive mail. Check the address for typos.",
        "auth/invalid-action-code": "This activation link is invalid or was already used. Sign up again to get a new link.",
        "auth/expired-action-code": "This activation link has expired. Sign up again to get a new link.",
        "auth/unauthorized-continue-uri": `Activation links are blocked for "${window.location.hostname}". Add this hostname in Firebase Console under Authentication > Settings > Authorized domains.`,
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
    isCompletingSignUp = false;
    emailInput.readOnly = false;
    authCard.classList.toggle("signin-mode", !isSignUp);
    authHeading.textContent = isSignUp ? "Master Your TOEFL ITP Journey" : "Welcome Back";
    submitButton.textContent = isSignUp ? "Send Activation Link" : "Sign In";
    // During sign-up the password is created after the inbox is confirmed.
    passwordGroup.style.display = isSignUp ? "none" : "";
    passwordInput.required = !isSignUp;
    passwordInput.autocomplete = "current-password";
    passwordInput.minLength = 0;
    firstNameInput.required = isSignUp;
    lastNameInput.required = isSignUp;
    nationalityInput.required = isSignUp;
    termsInput.required = isSignUp;
    authFooter.innerHTML = isSignUp
        ? 'Already have an account? <a href="#" id="toggleAuthMode">Sign In</a>'
        : 'Don\'t have an account? <a href="#" id="toggleAuthMode">Sign Up</a><br><a href="#" id="resetPassword">Forgot password?</a>';
    messageEl.textContent = "";
}

function readPendingSignUp() {
    try {
        return JSON.parse(localStorage.getItem(PENDING_SIGNUP_KEY) || "null");
    } catch {
        return null;
    }
}

function clearActivationLink() {
    window.history.replaceState(null, "", window.location.pathname);
}

function enterActivationMode() {
    setAuthMode(true);
    isCompletingSignUp = true;
    const pending = readPendingSignUp();
    if (pending) {
        firstNameInput.value = pending.firstName || "";
        lastNameInput.value = pending.lastName || "";
        nationalityInput.value = pending.nationality || "";
        phoneInput.value = pending.phone || "";
        emailInput.value = pending.email || "";
        emailInput.readOnly = Boolean(pending.email);
    }
    authHeading.textContent = "Activate Your Account";
    submitButton.textContent = "Activate Account";
    passwordGroup.style.display = "";
    passwordInput.required = true;
    passwordInput.autocomplete = "new-password";
    passwordInput.minLength = 6;
    showMessage(pending?.email
        ? "Your activation link is ready. Create a password to finish setting up your account."
        : "Enter the email address you signed up with, your details, and a new password to activate your account.", "info");
}

async function validateSignUpEmail(email) {
    if (!EMAIL_PATTERN.test(email)) {
        throw Object.assign(new Error("Enter a valid email address."), { code: "auth/invalid-email" });
    }

    const domain = email.split("@").pop().toLowerCase();
    if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
        throw Object.assign(new Error("Disposable email"), { code: "auth/disposable-email" });
    }

    let response;
    try {
        response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
    } catch (error) {
        // If the DNS check is unreachable, the activation link is still the real proof of ownership.
        console.warn("Email domain check skipped:", error);
        return;
    }
    if (!response.ok) return;

    const result = await response.json();
    const mailServers = (result.Answer || []).filter((answer) => answer.type === 15 && answer.data.trim() !== "0 .");
    if (result.Status !== 0 || !mailServers.length) {
        throw Object.assign(new Error("Unreachable email domain"), { code: "auth/email-domain-unreachable" });
    }
}

async function sendActivationLink(email) {
    showMessage("Checking your email address...", "info");
    await validateSignUpEmail(email);

    const pending = {
        email,
        firstName: firstNameInput.value.trim(),
        lastName: lastNameInput.value.trim(),
        nationality: nationalityInput.value,
        phone: phoneInput.value.trim()
    };
    await sendSignInLinkToEmail(auth, email, {
        url: new URL("signup.html", window.location.href).href,
        handleCodeInApp: true
    });
    localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(pending));
    showMessage(`We sent an activation link to ${email}. Open it to finish creating your account. Your account is only created after you open that link. Check your spam folder if you don't see it.`, "info");
}

async function completeActivation(email) {
    showMessage("Activating your account...", "info");
    if (!activatedUser) {
        const result = await signInWithEmailLink(auth, email, window.location.href);
        if (!getAdditionalUserInfo(result)?.isNewUser) {
            await signOut(auth);
            localStorage.removeItem(PENDING_SIGNUP_KEY);
            clearActivationLink();
            setAuthMode(false);
            emailInput.value = email;
            throw Object.assign(new Error("Account exists"), { code: "auth/email-already-in-use" });
        }
        activatedUser = result.user;
        clearActivationLink();
    }

    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    await updatePassword(activatedUser, passwordInput.value);
    await updateProfile(activatedUser, { displayName: `${firstName} ${lastName}`.trim() });
    await saveUserProfile(activatedUser, {
        firstName,
        lastName,
        nationality: nationalityInput.value,
        phone: phoneInput.value.trim()
    });
    localStorage.removeItem(PENDING_SIGNUP_KEY);
}

export async function handleEmailAuth(event) {
    event.preventDefault();
    setSubmitting(true);

    const email = emailInput.value.trim();

    try {
        let user;
        if (isCompletingSignUp) {
            await completeActivation(email);
        } else if (isSignUp) {
            await sendActivationLink(email);
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
        if (isCompletingSignUp && !activatedUser && ["auth/invalid-action-code", "auth/expired-action-code"].includes(error.code)) {
            clearActivationLink();
            setAuthMode(true);
        }
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

if (isSignInWithEmailLink(auth, window.location.href)) {
    enterActivationMode();
} else if (new URLSearchParams(window.location.search).get("verify") === "required") {
    setAuthMode(false);
    emailInput.value = "";
    showMessage("Please verify your email address before continuing. Sign in to receive a new verification link.", "error");
} else {
    setAuthMode(true);
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
