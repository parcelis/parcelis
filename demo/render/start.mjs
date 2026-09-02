#!/usr/bin/env node
import { spawn } from "node:child_process";

const apiPort = "40010";
const webPort = process.env.PORT ?? "30000";
const sharedEnvironment = {
  ...process.env,
  API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
  NEXT_PUBLIC_API_URL: "",
};

const processes = [
  spawn("pnpm", ["--filter", "@parcelis/api", "exec", "node", "dist/main.js"], {
    detached: process.platform !== "win32",
    env: { ...sharedEnvironment, API_PORT: apiPort },
    shell: process.platform === "win32",
    stdio: "inherit",
  }),
  spawn("pnpm", ["--filter", "@parcelis/web", "exec", "next", "start", "--hostname", "0.0.0.0", "--port", webPort], {
    detached: process.platform !== "win32",
    env: sharedEnvironment,
    shell: process.platform === "win32",
    stdio: "inherit",
  }),
];

let shuttingDown = false;

function stopProcess(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== "win32" && child.pid) {
    process.kill(-child.pid, signal);
    return;
  }
  child.kill(signal);
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  processes.forEach((child) => stopProcess(child, signal));
}

processes.forEach((child) => {
  child.on("exit", (code) => {
    if (!shuttingDown) shutdown("SIGTERM");
    process.exitCode = code ?? 1;
  });
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
