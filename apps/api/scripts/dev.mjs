import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const apiRoot = resolve(import.meta.dirname, "..");
const emailSource = resolve(repositoryRoot, "packages/email/src");
const useOpenPort = process.argv.includes("--open-port");

let apiProcess;
let shuttingDown = false;
let restartTimer;
let restarting = false;
let emailWatcher;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      stdio: "inherit",
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0 || signal) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function startApi() {
  const command = useOpenPort ? process.execPath : "nest";
  const args = useOpenPort
    ? [
        resolve(repositoryRoot, "scripts/run-with-open-port.mjs"),
        "API_PORT",
        "40010",
        "nest",
        "start",
        "--watch",
      ]
    : ["start", "--watch"];

  apiProcess = spawn(command, args, {
    cwd: apiRoot,
    detached: process.platform !== "win32",
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  apiProcess.on("exit", (code, signal) => {
    if (shuttingDown || restarting || signal) return;
    process.exit(code ?? 0);
  });
}

function stopApi() {
  if (!apiProcess || apiProcess.exitCode !== null || apiProcess.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    apiProcess.once("exit", resolve);
    if (process.platform !== "win32" && apiProcess.pid) {
      process.kill(-apiProcess.pid, "SIGTERM");
      return;
    }

    apiProcess.kill("SIGTERM");
  });
}

async function rebuildEmailAndRestartApi() {
  try {
    await run("pnpm", ["--filter", "@parcelis/email", "build"]);
  } catch (error) {
    console.error(`[parcelis] Email build failed: ${error.message}`);
    return;
  }

  restarting = true;
  await stopApi();
  restarting = false;
  if (!shuttingDown) startApi();
}

function scheduleEmailRebuild() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(rebuildEmailAndRestartApi, 100);
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(restartTimer);
  emailWatcher?.close();
  await stopApi();
}

try {
  await run("pnpm", ["--filter", "@parcelis/email", "build"]);
} catch (error) {
  console.error(`[parcelis] Email build failed: ${error.message}`);
  process.exit(1);
}

startApi();
emailWatcher = watch(emailSource, { recursive: true }, scheduleEmailRebuild);
process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
