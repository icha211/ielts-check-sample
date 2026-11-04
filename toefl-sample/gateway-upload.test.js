const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "toefl-storage-sync.js"), "utf8");

function createStorage(fetch) {
    const values = new Map();
    const context = vm.createContext({
        console,
        URLSearchParams,
        Blob,
        FormData,
        setTimeout: (callback, delay) => {
            const timer = setTimeout(callback, delay);
            timer.unref();
            return timer;
        },
        fetch,
        window: {},
        localStorage: {
            getItem: (key) => values.get(key) || null,
            setItem: (key, value) => values.set(key, value),
            removeItem: (key) => values.delete(key)
        }
    });
    vm.runInContext(source, context);
    return { storage: context.window.toeflStorage, values };
}

test("gateway mutations require a developer session before obtaining a token", async () => {
    const { storage, values } = createStorage(() => assert.fail("Anonymous upload must not make a request"));
    storage._getAuthToken = () => assert.fail("Anonymous upload must not obtain an anonymous token");
    await assert.rejects(storage.getDeveloperGatewayHeaders(), /Sign in with the verified developer/);
    values.set("toefl_firebase_auth_mode", "developer");
    await assert.rejects(storage.getDeveloperGatewayHeaders(), /Sign in with the verified developer/);
});

test("gateway obtains a refreshed developer ID token rather than using a stale token", async () => {
    const { storage, values } = createStorage(async (url, options) => {
        assert.match(url, /securetoken\.googleapis\.com/);
        assert.equal(options.body.get("refresh_token"), "refresh-session");
        return { ok: true, json: async () => ({ id_token: "fresh-id-token", refresh_token: "refresh-session", expires_in: 3600 }) };
    });
    values.set("toefl_firebase_auth_mode", "developer");
    values.set("toefl_firebase_refresh_token", "refresh-session");
    values.set("toefl_firebase_id_token", "stale-id-token");
    values.set("toefl_firebase_id_token_expiry", String(Date.now() + 3600000));
    const headers = await storage.getDeveloperGatewayHeaders();
    assert.equal(headers.Authorization, "Bearer fresh-id-token");
});

test("failed session refresh does not fall back to an anonymous token or upload", async () => {
    const { storage, values } = createStorage(async () => ({ ok: false, status: 401 }));
    values.set("toefl_firebase_auth_mode", "developer");
    values.set("toefl_firebase_refresh_token", "expired-session");
    await assert.rejects(storage.getDeveloperGatewayHeaders(), /session refresh failed \(401\)/);
});

for (const fallback of [false, true]) {
    test(`gateway ${fallback ? "presigned fallback" : "proxy"} forwards authentication without leaking it to R2`, async () => {
        const calls = [];
        const key = "audio/listening/sets/test_set/part_1.mp3";
        const { storage, values } = createStorage(async (url, options) => {
            calls.push({ url, options });
            if (url.endsWith("upload-proxy")) {
                return fallback
                    ? { ok: false, status: 502, text: async () => "proxy unavailable" }
                    : { ok: true, json: async () => ({ objectKey: key }) };
            }
            if (url.endsWith("upload-url")) {
                return { ok: true, json: async () => ({ objectKey: key, uploadUrl: "https://r2.example/upload" }) };
            }
            assert.equal(url, "https://r2.example/upload");
            return { ok: true };
        });
        values.set("toefl_firebase_auth_mode", "developer");
        values.set("toefl_firebase_refresh_token", "refresh-session");
        storage._getAuthToken = async (forceRefresh) => {
            assert.equal(forceRefresh, true);
            return "fresh-token";
        };
        storage._getApiGatewayBase = () => "https://gateway.example";
        storage._prepareAudioUpload = async () => ({
            blob: new Blob(["audio"]), originalName: "part_1.mp3",
            contentType: "audio/mpeg", uploadedSize: 5, originalSize: 5
        });
        const writes = [];
        storage._put = async (key, value) => writes.push({ key, value });
        const result = await storage.saveAudioViaGateway("test_set", new Blob(["audio"]), 1);
        assert.equal(result.success, true);
        assert.equal(result.objectKey, key);
        assert.equal(writes.length, 1);
        assert.equal(writes[0].value.objectKey, key);
        assert.equal(calls.length, fallback ? 3 : 1);
        for (const call of calls) {
            if (call.url.startsWith("https://gateway.example")) {
                assert.equal(call.options.headers.Authorization, "Bearer fresh-token");
            } else {
                assert.equal(call.options.headers.Authorization, undefined);
            }
        }
    });
}

test("every direct listening editor mutation forwards developer authentication", () => {
    const html = fs.readFileSync(path.join(__dirname, "section 1.html"), "utf8");
    const calls = [...html.matchAll(/fetch\(`\$\{apiBase\}\/api\/developer\/(?:upload-proxy|upload-url|ensure-audio-folder|align-transcript)`[\s\S]*?body:/g)];
    assert.equal(calls.length, 8);
    calls.forEach(([call]) => assert.match(call, /headers:[\s\S]*getDeveloperGatewayHeaders\(\)/));
});
