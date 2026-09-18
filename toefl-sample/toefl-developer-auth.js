(() => {
    const FIREBASE_API_KEY = "AIzaSyBtaZOok-Kj91qzCo_6ClCZ8Lfgam7qRxg";
    const DEVELOPER_EMAIL = "quickcheck.edu@gmail.com";
    const STORAGE_KEYS = {
        token: "toefl_firebase_id_token",
        expiry: "toefl_firebase_id_token_expiry",
        refreshToken: "toefl_firebase_refresh_token",
        email: "toefl_firebase_auth_email",
        mode: "toefl_firebase_auth_mode"
    };

    function clearSession() {
        Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    }

    function saveSession(payload) {
        const token = String(payload.idToken || "");
        const refreshToken = String(payload.refreshToken || "");
        const expiresIn = Number(payload.expiresIn || 3600);
        if (!token || !refreshToken) throw new Error("Firebase returned an incomplete session.");
        localStorage.setItem(STORAGE_KEYS.token, token);
        localStorage.setItem(STORAGE_KEYS.expiry, String(Date.now() + expiresIn * 1000));
        localStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken);
        localStorage.setItem(STORAGE_KEYS.email, DEVELOPER_EMAIL);
        localStorage.setItem(STORAGE_KEYS.mode, "developer");
    }

    function isSignedIn() {
        return localStorage.getItem(STORAGE_KEYS.mode) === "developer"
            && localStorage.getItem(STORAGE_KEYS.email) === DEVELOPER_EMAIL
            && Boolean(localStorage.getItem(STORAGE_KEYS.refreshToken));
    }

    function friendlyError(code) {
        const messages = {
            EMAIL_EXISTS: "This developer account already exists. Use Sign in instead.",
            INVALID_LOGIN_CREDENTIALS: "The email or password is incorrect.",
            INVALID_PASSWORD: "The email or password is incorrect.",
            MISSING_PASSWORD: "Enter a password.",
            WEAK_PASSWORD: "Use a password with at least 6 characters.",
            OPERATION_NOT_ALLOWED: "Enable Email/Password in Firebase Authentication, then try again.",
            TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Try again later."
        };
        return messages[code] || "Authentication failed. Please try again.";
    }

    async function authenticate(mode, password) {
        const operation = mode === "signup" ? "signUp" : "signInWithPassword";
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: DEVELOPER_EMAIL, password, returnSecureToken: true })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(friendlyError(payload?.error?.message));
        saveSession(payload);
    }

    function createDialog() {
        const modal = document.createElement("div");
        modal.className = "developer-auth-modal";
        modal.setAttribute("aria-hidden", "true");
        modal.innerHTML = `
            <section class="developer-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="developerAuthTitle">
                <button class="developer-auth-close" type="button" aria-label="Close developer authentication">&times;</button>
                <p class="developer-auth-eyebrow">Developer access</p>
                <h2 id="developerAuthTitle">Sign in to Quick Check</h2>
                <p class="developer-auth-copy">Manage TOEFL content with the authorized developer account.</p>
                <div class="developer-auth-tabs" role="tablist" aria-label="Authentication mode">
                    <button class="is-active" type="button" role="tab" data-auth-mode="signin" aria-selected="true">Sign in</button>
                    <button type="button" role="tab" data-auth-mode="signup" aria-selected="false">Sign up</button>
                </div>
                <form class="developer-auth-form">
                    <label>Email<input type="email" value="${DEVELOPER_EMAIL}" readonly></label>
                    <label>Password<input name="password" type="password" minlength="6" autocomplete="current-password" required placeholder="Enter password"></label>
                    <p class="developer-auth-message" aria-live="polite"></p>
                    <button class="developer-auth-submit" type="submit">Sign in</button>
                </form>
            </section>`;
        document.body.appendChild(modal);
        return modal;
    }

    function setup() {
        const profile = document.querySelector(".nav-profile, .sidebar-profile");
        if (!profile) return;

        const profileName = profile.querySelector(".nav-profile-name, .sidebar-profile-name");
        const profilePlan = profile.querySelector(".nav-profile-plan, .sidebar-profile-plan");
        const action = profile.querySelector(".nav-profile-action");
        const modal = createDialog();
        const form = modal.querySelector(".developer-auth-form");
        const passwordInput = form.elements.password;
        const message = modal.querySelector(".developer-auth-message");
        const submitButton = modal.querySelector(".developer-auth-submit");
        const tabs = [...modal.querySelectorAll("[data-auth-mode]")];
        let mode = "signin";

        function renderProfile() {
            const signedIn = isSignedIn();
            if (profileName) profileName.textContent = signedIn ? "Quick Check Developer" : "Developer sign in";
            if (profilePlan) profilePlan.textContent = signedIn ? DEVELOPER_EMAIL : "Secure workspace access";
            profile.dataset.authenticated = String(signedIn);
            profile.setAttribute("role", "button");
            profile.setAttribute("tabindex", "0");
            profile.setAttribute("aria-label", signedIn ? `Signed in as ${DEVELOPER_EMAIL}. Activate to sign out.` : "Open developer sign in");
            if (action) {
                action.setAttribute("aria-label", signedIn ? "Sign out" : "Sign in");
                action.title = signedIn ? "Sign out" : "Sign in";
                action.innerHTML = `<i data-lucide="${signedIn ? "log-out" : "log-in"}" aria-hidden="true"></i>`;
            }
            if (typeof lucide !== "undefined") lucide.createIcons({ attrs: { "stroke-width": 1.5 } });
        }

        function openDialog() {
            modal.classList.add("is-open");
            modal.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";
            passwordInput.focus();
        }

        function closeDialog() {
            modal.classList.remove("is-open");
            modal.setAttribute("aria-hidden", "true");
            document.body.style.overflow = "";
            form.reset();
            message.textContent = "";
            profile.focus({ preventScroll: true });
        }

        function activateProfile() {
            if (isSignedIn()) {
                clearSession();
                renderProfile();
                return;
            }
            openDialog();
        }

        profile.addEventListener("click", activateProfile);
        profile.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activateProfile();
            }
        });
        action?.addEventListener("click", (event) => event.stopPropagation());
        action?.addEventListener("click", activateProfile);
        modal.querySelector(".developer-auth-close").addEventListener("click", closeDialog);
        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeDialog();
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && modal.classList.contains("is-open")) closeDialog();
        });
        tabs.forEach((tab) => tab.addEventListener("click", () => {
            mode = tab.dataset.authMode;
            tabs.forEach((item) => {
                const active = item === tab;
                item.classList.toggle("is-active", active);
                item.setAttribute("aria-selected", String(active));
            });
            passwordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
            submitButton.textContent = mode === "signup" ? "Create developer account" : "Sign in";
            message.textContent = "";
        }));
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            submitButton.disabled = true;
            submitButton.textContent = mode === "signup" ? "Creating account..." : "Signing in...";
            message.textContent = "";
            try {
                await authenticate(mode, passwordInput.value);
                renderProfile();
                closeDialog();
            } catch (error) {
                message.textContent = error.message;
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = mode === "signup" ? "Create developer account" : "Sign in";
            }
        });

        renderProfile();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", setup, { once: true });
    } else {
        setup();
    }
})();