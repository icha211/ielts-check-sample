const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) {
    console.error("Run this suite with npm run test:beta so the npm CLI path is available.");
    process.exit(1);
}
const commands = [
    ["python", ["-m", "unittest", "discover", "-s", "tests"], path.join(root, "apps", "api-gateway")],
    [process.execPath, [npmCli, "run", "test:beta:unit"], root],
    [process.execPath, [npmCli, "run", "test:beta:browser"], root]
];
for (const [command, args, cwd] of commands) {
    const result = spawnSync(command, args, {
        cwd, stdio: "inherit",
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
    });
    if (result.error) {
        console.error(`Could not run ${command}: ${result.error.message}`);
        process.exit(1);
    }
    if (result.status !== 0) process.exit(result.status || 1);
}
