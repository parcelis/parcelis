#!/usr/bin/env node
import { spawn } from "node:child_process";
import { findOpenPort } from "./port-utils.mjs";

const [envName, preferredPort, ...commandParts] = process.argv.slice(2);

if (!envName || !preferredPort || commandParts.length === 0) {
  console.error(
    "Usage: run-with-open-port <ENV_NAME> <PREFERRED_PORT> <command...>",
  );
  process.exit(1);
}

const port = await findOpenPort(preferredPort);
const env = { ...process.env, [envName]: String(port), PORT: String(port) };
const command = commandParts[0];
const args = commandParts
  .slice(1)
  .map((part) => part.replaceAll("{PORT}", String(port)));

console.log(`[parcelis] ${envName}=${port}`);

const child = spawn(command, args, {
  detached: process.platform !== "win32",
  stdio: "inherit",
  shell: process.platform === "win32",
  env,
});

let shuttingDown = false;

function stopChild(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  if (process.platform !== "win32" && child.pid) {
    process.kill(-child.pid, signal);
    return;
  }

  child.kill(signal);
}

process.on("SIGINT", () => stopChild("SIGINT"));
process.on("SIGTERM", () => stopChild("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(0);
    return;
  }

  process.exit(code ?? 0);
});
