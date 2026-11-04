const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "ai-client.js"), "utf8");

function fixture(fetch) {
    const values = new Map([
        ["toefl_firebase_auth_mode", "developer"],
        ["toefl_firebase_refresh_token", "refresh-session"]
    ]);
    const window = {
        location: { href: "https://quickcheck-25590.web.app/toefl-sample/section%201.html" },
        toeflStorage: { _getAuthToken: async (force) => {
            assert.equal(force, true);
            return "fresh-token";
        } }
    };
    vm.runInNewContext(source, {
        window, URL, Headers, AbortController, setTimeout, clearTimeout, fetch,
        localStorage: { getItem: (key) => values.get(key) || null }
    });
    return window.toeflAi;
}

test("AI requests send a refreshed ID token only to a trusted backend", async () => {
    let calls = 0;
    const client = fixture(async (url, init) => {
        calls++;
        assert.equal(init.headers.get("Authorization"), "Bearer fresh-token");
        assert.equal(init.redirect, "error");
        return { ok: true };
    });
    await client.request("https://quickcheck-25590.web.app/api/chat", { method: "POST" });
    assert.equal(calls, 1);
    await assert.rejects(client.request("https://untrusted.example/api/chat"), /not a trusted/);
    assert.equal(calls, 1);
});

test("quota and authentication errors remain visible without retrying paid requests", async () => {
    for (const status of [401, 403, 429, 503]) {
        let calls = 0;
        const client = fixture(async () => {
            calls++;
            return { ok: false, status, json: async () => ({ detail: "AI request blocked" }) };
        });
        await assert.rejects(client.request("https://quickcheck-25590.web.app/api/chat"), (error) =>
            error.status === status && error.message === "AI request blocked");
        assert.equal(calls, 1);
    }
});

test("browser chat no longer asks for a provider key or contacts Gemini directly", () => {
    const review = fs.readFileSync(path.join(__dirname, "section 2-answered.html"), "utf8");
    assert.doesNotMatch(review, /generativelanguage\.googleapis\.com|toefl_gemini_api_key|TOEFL_GEMINI_API_KEY/);
    assert.match(review, /window\.toeflAi\.request\(/);
    assert.match(review, /<script src="ai-client\.js"><\/script>/);
});

test("paid listening requests use one authenticated endpoint rather than fallback retries", () => {
    const review = fs.readFileSync(path.join(__dirname, "section 1-answered.html"), "utf8");
    const start = review.indexOf("async function fetchAiWithFallback");
    const end = review.indexOf("var lastError", start);
    assert.match(review.slice(start, end), /path !== '\/api\/report-issue'/);
    assert.match(review.slice(start, end), /toeflAi\.request\(candidates\[0\]/);
    const storage = fs.readFileSync(path.join(__dirname, "toefl-storage-sync.js"), "utf8");
    assert.match(storage, /transcribeAudioBySetPart[\s\S]*?toeflAi\.request/);
    assert.match(storage, /transcribeAudioBlob[\s\S]*?toeflAi\.request/);
});
