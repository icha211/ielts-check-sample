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

    async function sendPasswordReset() {
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestType: "PASSWORD_RESET", email: DEVELOPER_EMAIL })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(friendlyError(payload?.error?.message));
        return payload;
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

    function injectStyles() {
        if (document.getElementById("developer-auth-styles")) return;
        const style = document.createElement("style");
        style.id = "developer-auth-styles";
        style.textContent = `
            .nav-profile,
            .sidebar-profile {
                cursor: pointer;
            }
            .nav-profile:focus-visible,
            .sidebar-profile:focus-visible {
                outline: 3px solid rgba(14, 165, 233, 0.28);
                outline-offset: 4px;
            }
            .developer-auth-modal {
                position: fixed !important;
                inset: 0 !important;
                z-index: 100000 !important;
                display: none;
                align-items: center !important;
                justify-content: center !important;
                padding: 20px !important;
                background: rgba(6, 34, 61, 0.65) !important;
                backdrop-filter: blur(8px) !important;
                -webkit-backdrop-filter: blur(8px) !important;
                box-sizing: border-box !important;
            }
            .developer-auth-modal.is-open {
                display: flex !important;
            }
            .developer-auth-dialog {
                position: relative !important;
                width: min(420px, 100%) !important;
                padding: 32px 28px !important;
                border: 1px solid #c9e2ee !important;
                border-radius: 16px !important;
                background: #ffffff !important;
                color: #10243a !important;
                box-shadow: 0 24px 70px rgba(6, 34, 61, 0.35) !important;
                font-family: "Plus Jakarta Sans", "Space Grotesk", sans-serif !important;
                box-sizing: border-box !important;
            }
            .developer-auth-close {
                position: absolute !important;
                top: 14px !important;
                right: 14px !important;
                width: 34px !important;
                height: 34px !important;
                padding: 0 !important;
                border: 0 !important;
                border-radius: 50% !important;
                background: #eef7fb !important;
                color: #40536a !important;
                font-size: 24px !important;
                line-height: 1 !important;
                cursor: pointer !important;
                display: grid !important;
                place-items: center !important;
            }
            .developer-auth-close:hover {
                background: #dbeaf2 !important;
            }
            .developer-auth-eyebrow {
                margin: 0 0 6px !important;
                color: #0d9488 !important;
                font-size: 11px !important;
                font-weight: 800 !important;
                text-transform: uppercase !important;
                letter-spacing: 0.06em !important;
            }
            .developer-auth-dialog h2 {
                margin: 0 !important;
                color: #06223d !important;
                font-size: 24px !important;
                font-weight: 800 !important;
                letter-spacing: -0.02em !important;
            }
            .developer-auth-copy {
                margin: 8px 0 20px !important;
                color: #61778d !important;
                font-size: 13px !important;
                line-height: 1.5 !important;
            }
            .developer-auth-tabs {
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                padding: 4px !important;
                border-radius: 10px !important;
                background: #edf5f8 !important;
                margin-bottom: 6px !important;
            }
            .developer-auth-tabs button {
                min-height: 38px !important;
                border: 0 !important;
                border-radius: 8px !important;
                background: transparent !important;
                color: #61778d !important;
                font: 700 13px "Plus Jakarta Sans", sans-serif !important;
                cursor: pointer !important;
                transition: all 0.15s ease !important;
            }
            .developer-auth-tabs button.is-active {
                background: #ffffff !important;
                color: #005faa !important;
                box-shadow: 0 2px 8px rgba(6, 34, 61, 0.1) !important;
            }
            .developer-auth-form {
                display: grid !important;
                gap: 14px !important;
                margin-top: 14px !important;
            }
            .developer-auth-form label {
                display: grid !important;
                gap: 7px !important;
                color: #29445d !important;
                font-size: 12px !important;
                font-weight: 700 !important;
                text-align: left !important;
            }
            .developer-auth-form input {
                width: 100% !important;
                min-height: 44px !important;
                padding: 10px 14px !important;
                border: 1px solid #c9dce8 !important;
                border-radius: 9px !important;
                outline: none !important;
                background: #fbfdfe !important;
                color: #10243a !important;
                font: 500 14px "Space Grotesk", sans-serif !important;
                box-sizing: border-box !important;
            }
            .developer-auth-form input:focus {
                border-color: #0d9488 !important;
                box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.14) !important;
            }
            .developer-auth-form input[readonly] {
                color: #526a80 !important;
                background: #f1f6f8 !important;
            }
            .developer-auth-actions-row {
                display: flex !important;
                justify-content: flex-end !important;
                margin-top: -6px !important;
            }
            .developer-auth-forgot {
                border: 0 !important;
                background: transparent !important;
                color: #005faa !important;
                font: 600 11px "Plus Jakarta Sans", sans-serif !important;
                cursor: pointer !important;
                padding: 0 !important;
                text-decoration: underline !important;
            }
            .developer-auth-forgot:hover {
                color: #0d9488 !important;
            }
            .developer-auth-message {
                min-height: 18px !important;
                margin: 0 !important;
                color: #b42318 !important;
                font-size: 12px !important;
                text-align: left !important;
            }
            .developer-auth-message.is-success {
                color: #0d9488 !important;
                font-weight: 700 !important;
            }
            .developer-auth-message.is-error {
                color: #b42318 !important;
            }
            .developer-auth-submit {
                min-height: 44px !important;
                border: 0 !important;
                border-radius: 9px !important;
                background: #0d9488 !important;
                color: #ffffff !important;
                font: 800 13px "Plus Jakarta Sans", sans-serif !important;
                cursor: pointer !important;
                transition: background 0.15s ease, transform 0.15s ease !important;
            }
            .developer-auth-submit:hover {
                background: #087f75 !important;
            }
            .developer-auth-submit:disabled {
                cursor: wait !important;
                opacity: 0.68 !important;
            }
            .developer-auth-status-view {
                display: grid !important;
                gap: 12px !important;
                margin-top: 14px !important;
                padding: 20px !important;
                border-radius: 12px !important;
                background: #f0fdf4 !important;
                border: 1px solid #bbf7d0 !important;
                text-align: left !important;
            }
            .developer-auth-badge {
                display: inline-flex !important;
                align-items: center !important;
                gap: 6px !important;
                color: #15803d !important;
                font-size: 12px !important;
                font-weight: 800 !important;
                text-transform: uppercase !important;
            }
            .status-dot-active {
                width: 8px !important;
                height: 8px !important;
                border-radius: 50% !important;
                background: #22c55e !important;
                box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.3) !important;
            }
            .developer-auth-status-email {
                margin: 0 !important;
                color: #166534 !important;
                font-size: 15px !important;
                font-weight: 700 !important;
                word-break: break-all !important;
            }
            .developer-auth-status-note {
                margin: 0 !important;
                color: #4b6354 !important;
                font-size: 12px !important;
                line-height: 1.4 !important;
            }
            .developer-auth-signout-btn {
                min-height: 40px !important;
                border: 1px solid #f87171 !important;
                border-radius: 8px !important;
                background: #ffffff !important;
                color: #dc2626 !important;
                font: 700 13px "Plus Jakarta Sans", sans-serif !important;
                cursor: pointer !important;
                margin-top: 6px !important;
                transition: background 0.18s ease !important;
            }
            .developer-auth-signout-btn:hover {
                background: #fee2e2 !important;
            }
            .developer-auth-help {
                margin-top: 18px !important;
                border-top: 1px solid #dbe7ed !important;
                padding-top: 14px !important;
                color: #40536a !important;
            }
            .developer-auth-help summary {
                color: #005faa !important;
                font: 700 12px "Plus Jakarta Sans", sans-serif !important;
                cursor: pointer !important;
                list-style-position: outside !important;
            }
            .developer-auth-help-content {
                max-height: 240px !important;
                margin-top: 12px !important;
                padding-right: 6px !important;
                overflow-y: auto !important;
                font: 400 11px/1.55 "Plus Jakarta Sans", sans-serif !important;
                text-align: left !important;
            }
            .developer-auth-help-content h3 {
                margin: 14px 0 6px !important;
                color: #06223d !important;
                font-size: 12px !important;
                line-height: 1.35 !important;
            }
            .developer-auth-help-content h3:first-child {
                margin-top: 0 !important;
            }
            .developer-auth-help-content ol,
            .developer-auth-help-content ul {
                margin: 0 !important;
                padding-left: 20px !important;
            }
            .developer-auth-help-content li + li {
                margin-top: 5px !important;
            }
            .developer-auth-help-content code {
                padding: 1px 4px !important;
                border-radius: 4px !important;
                background: #edf5f8 !important;
                color: #0a3560 !important;
                font-size: 10px !important;
            }
            .nav-avatar.is-developer-signed-in,
            .sidebar-avatar.is-developer-signed-in {
                position: relative !important;
                box-shadow: 0 0 0 2px #22c55e !important;
            }
            .nav-avatar.is-developer-signed-in::after,
            .sidebar-avatar.is-developer-signed-in::after {
                content: "" !important;
                position: absolute !important;
                bottom: -1px !important;
                right: -1px !important;
                width: 10px !important;
                height: 10px !important;
                border-radius: 50% !important;
                background: #22c55e !important;
                border: 2px solid #ffffff !important;
            }
        `;
        document.head.appendChild(style);
    }

    function createDialog() {
        injectStyles();
        const modal = document.createElement("div");
        modal.className = "developer-auth-modal";
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
        modal.innerHTML = `
            <section class="developer-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="developerAuthTitle">
                <button class="developer-auth-close" type="button" aria-label="Close developer authentication">&times;</button>
                <p class="developer-auth-eyebrow">Developer access</p>
                <h2 id="developerAuthTitle">Developer Authentication</h2>
                <p class="developer-auth-copy">Manage TOEFL content with the authorized developer account.</p>
                <div class="developer-auth-tabs" role="tablist" aria-label="Authentication mode">
                    <button class="is-active" type="button" role="tab" data-auth-mode="signin" aria-selected="true">Sign in</button>
                    <button type="button" role="tab" data-auth-mode="signup" aria-selected="false">Sign up</button>
                </div>
                <form class="developer-auth-form">
                    <label>Email<input type="email" value="${DEVELOPER_EMAIL}" readonly></label>
                    <label>Password<input name="password" type="password" minlength="6" autocomplete="current-password" required placeholder="Enter password"></label>
                    <div class="developer-auth-actions-row">
                        <button class="developer-auth-forgot" type="button">Forgot / Reset password?</button>
                    </div>
                    <p class="developer-auth-message" aria-live="polite"></p>
                    <button class="developer-auth-submit" type="submit">Sign in</button>
                </form>
                <div class="developer-auth-status-view" style="display:none;">
                    <div class="developer-auth-badge"><span class="status-dot-active"></span> Signed In</div>
                    <p class="developer-auth-status-email">${DEVELOPER_EMAIL}</p>
                    <p class="developer-auth-status-note">You have full developer read and write permissions to the Realtime Database.</p>
                    <button class="developer-auth-signout-btn" type="button">Sign out</button>
                </div>
                <details class="developer-auth-help">
                    <summary>How to set up developer access</summary>
                    <div class="developer-auth-help-content">
                        <h3>Method 1: Sign up from the website (easiest)</h3>
                        <ol>
                            <li>Click the profile icon in the bottom-left corner.</li>
                            <li>Choose the <strong>Sign up</strong> tab.</li>
                            <li>Enter a password with at least 6 characters.</li>
                            <li>Click <strong>Create developer account</strong>.</li>
                            <li>Wait for the green success confirmation for <code>${DEVELOPER_EMAIL}</code>.</li>
                            <li>Refresh the Firebase Console Users list to see the account.</li>
                        </ol>
                        <h3>Method 2: Create the account in Firebase first</h3>
                        <ol>
                            <li>Open Firebase Authentication, select <strong>Users</strong>, then click <strong>Add user</strong>.</li>
                            <li>Enter <code>${DEVELOPER_EMAIL}</code> and a password, then add the user.</li>
                            <li>Return here, choose <strong>Sign in</strong>, and enter the same password.</li>
                        </ol>
                        <h3>When logged in</h3>
                        <ul>
                            <li>The profile avatar displays a green active ring.</li>
                            <li>Clicking the profile shows the developer email, active status, and Sign out button.</li>
                        </ul>
                    </div>
                </details>
            </section>`;
        document.body.appendChild(modal);
        return modal;
    }

    function setup() {
        const profile = document.querySelector(".nav-profile, .sidebar-profile");
        if (!profile) return;

        const profileName = profile.querySelector(".nav-profile-name, .sidebar-profile-name");
        const profilePlan = profile.querySelector(".nav-profile-plan, .sidebar-profile-plan");
        const profileAvatar = profile.querySelector(".nav-avatar, .sidebar-avatar");
        const action = profile.querySelector(".nav-profile-action");
        const modal = createDialog();
        const dialog = modal.querySelector(".developer-auth-dialog");
        const form = modal.querySelector(".developer-auth-form");
        const tabsContainer = modal.querySelector(".developer-auth-tabs");
        const statusView = modal.querySelector(".developer-auth-status-view");
        const signOutBtn = modal.querySelector(".developer-auth-signout-btn");
        const forgotBtn = modal.querySelector(".developer-auth-forgot");
        const passwordInput = form.elements.password;
        const message = modal.querySelector(".developer-auth-message");
        const submitButton = modal.querySelector(".developer-auth-submit");
        const tabs = [...modal.querySelectorAll("[data-auth-mode]")];
        let mode = "signin";

        function renderProfile() {
            const signedIn = isSignedIn();
            if (profileName) profileName.textContent = signedIn ? "Developer" : "Sign in";
            if (profilePlan) profilePlan.textContent = signedIn ? "quickcheck.edu" : "Workspace";
            profile.dataset.authenticated = String(signedIn);
            profile.setAttribute("role", "button");
            profile.setAttribute("tabindex", "0");
            profile.setAttribute("title", signedIn ? `Signed in as ${DEVELOPER_EMAIL}` : "Click to Sign in as Developer");
            profile.dataset.tooltip = signedIn ? `Dev: ${DEVELOPER_EMAIL}` : "Developer Sign in";
            profile.setAttribute("aria-label", signedIn ? `Signed in as ${DEVELOPER_EMAIL}. Activate to view account.` : "Open developer sign in");
            if (profileAvatar) {
                profileAvatar.classList.toggle("is-developer-signed-in", signedIn);
            }
            if (action) {
                action.setAttribute("aria-label", signedIn ? "Account / Sign out" : "Sign in");
                action.title = signedIn ? "Account / Sign out" : "Sign in";
                action.innerHTML = `<i data-lucide="${signedIn ? "user-check" : "log-in"}" aria-hidden="true"></i>`;
            }
            if (typeof lucide !== "undefined") lucide.createIcons({ attrs: { "stroke-width": 1.5 } });
        }

        function openDialog() {
            const signedIn = isSignedIn();
            if (signedIn) {
                form.style.display = "none";
                tabsContainer.style.display = "none";
                statusView.style.display = "grid";
            } else {
                form.style.display = "grid";
                tabsContainer.style.display = "grid";
                statusView.style.display = "none";
                passwordInput.value = "";
                message.textContent = "";
                message.className = "developer-auth-message";
            }
            modal.style.display = "flex";
            modal.classList.add("is-open");
            modal.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";
            if (!signedIn) {
                setTimeout(() => passwordInput.focus(), 50);
            }
        }

        function closeDialog() {
            modal.style.display = "none";
            modal.classList.remove("is-open");
            modal.setAttribute("aria-hidden", "true");
            document.body.style.overflow = "";
            form.reset();
            message.textContent = "";
            message.className = "developer-auth-message";
            profile.focus({ preventScroll: true });
        }

        forgotBtn?.addEventListener("click", async () => {
            message.className = "developer-auth-message";
            message.textContent = "Sending password reset email...";
            try {
                await sendPasswordReset();
                message.className = "developer-auth-message is-success";
                message.textContent = "✉️ Password reset email sent to " + DEVELOPER_EMAIL + ". Check your inbox.";
            } catch (error) {
                message.className = "developer-auth-message is-error";
                message.textContent = error.message;
            }
        });

        signOutBtn.addEventListener("click", () => {
            clearSession();
            renderProfile();
            closeDialog();
        });

        profile.addEventListener("click", openDialog);
        profile.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openDialog();
            }
        });
        action?.addEventListener("click", (event) => event.stopPropagation());
        action?.addEventListener("click", openDialog);
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
            message.className = "developer-auth-message";
        }));
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            submitButton.disabled = true;
            submitButton.textContent = mode === "signup" ? "Creating account..." : "Signing in...";
            message.textContent = "";
            message.className = "developer-auth-message";
            try {
                await authenticate(mode, passwordInput.value);
                renderProfile();
                message.className = "developer-auth-message is-success";
                message.textContent = "✅ Success! Signed in as " + DEVELOPER_EMAIL;
                setTimeout(() => {
                    closeDialog();
                }, 1000);
            } catch (error) {
                message.className = "developer-auth-message is-error";
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