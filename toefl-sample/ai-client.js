(() => {
    const trustedOrigins = new Set([
        "https://quickcheck-25590.web.app",
        "https://quickcheck-25590.firebaseapp.com",
        "https://ielts-api-gateway-753959270698.asia-southeast1.run.app",
        "http://127.0.0.1:8787", "http://localhost:8787",
        "http://127.0.0.1:8000", "http://localhost:8000",
        "http://127.0.0.1:8788", "http://localhost:8788"
    ]);

    async function getAuthHeaders() {
        if (localStorage.getItem("toefl_firebase_auth_mode") === "developer"
            && localStorage.getItem("toefl_firebase_refresh_token")
            && window.toeflStorage) {
            return { Authorization: `Bearer ${await window.toeflStorage._getAuthToken(true)}` };
        }
        const { auth } = await import("./js/firebase-config.js");
        await auth.authStateReady();
        const user = auth.currentUser;
        if (!user || user.isAnonymous) {
            throw new Error("Sign in to your account before using AI.");
        }
        return { Authorization: `Bearer ${await user.getIdToken(true)}` };
    }

    async function request(endpoint, init = {}) {
        const url = new URL(endpoint, window.location.href);
        if (!trustedOrigins.has(url.origin)) {
            throw new Error("AI server is not a trusted endpoint. Configure an approved server origin.");
        }
        const headers = new Headers(init.headers || {});
        const authHeaders = await getAuthHeaders();
        headers.set("Authorization", authHeaders.Authorization);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 65000);
        try {
            const response = await fetch(url.href, { ...init, headers, signal: controller.signal, redirect: "error" });
            if (!response.ok) {
                const data = await response.json();
                const error = new Error(data.detail || data.error || `AI request failed (${response.status})`);
                error.status = response.status;
                throw error;
            }
            return response;
        } finally {
            clearTimeout(timeout);
        }
    }

    window.toeflAi = { getAuthHeaders, request };
})();
