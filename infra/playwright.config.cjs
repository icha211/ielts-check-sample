const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "./beta",
    outputDir: "../test-results/beta",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: "list",
    use: {
        baseURL: "http://127.0.0.1:9460",
        browserName: "chromium",
        serviceWorkers: "block",
        trace: "retain-on-failure"
    },
    projects: [
        { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
        { name: "mobile", use: { viewport: { width: 390, height: 844 } } }
    ],
    webServer: {
        cwd: require("node:path").resolve(__dirname, ".."),
        env: { PYTHONDONTWRITEBYTECODE: "1" },
        command: "python infra/beta_server.py",
        url: "http://127.0.0.1:9460/__beta_health",
        reuseExistingServer: false,
        timeout: 15000
    }
});
