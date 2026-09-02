#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const apiPort = "40010";
const webPort = process.env.PORT ?? "30000";
const rootDirectory = resolve(import.meta.dirname, "../..");
const sharedEnvironment = {
  ...process.env,
  API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
  NEXT_PUBLIC_API_URL: "",
};

async function prepareDatabase() {
  console.log("[render] Applying database migrations and demo data");

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["demo/render/prepare.mjs"], {
      cwd: rootDirectory,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Database preparation stopped with ${signal}`));
        return;
      }
      if (code === 0) resolve();
      else reject(new Error(`Database preparation exited with ${code}`));
    });
  });
}

await prepareDatabase();

const processes = [
  {
    name: "api",
    child: spawn(process.execPath, ["dist/main.js"], {
      cwd: resolve(rootDirectory, "apps/api"),
      detached: process.platform !== "win32",
      env: { ...sharedEnvironment, API_PORT: apiPort },
      stdio: "inherit",
    }),
  },
  {
    name: "web",
    child: spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "0.0.0.0",
        "--port",
        webPort,
      ],
      {
        cwd: resolve(rootDirectory, "apps/web"),
        detached: process.platform !== "win32",
        env: sharedEnvironment,
        stdio: "inherit",
      },
    ),
  },
];

let shuttingDown = false;

function stopProcess({ child }, signal) {
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

processes.forEach(({ child, name }) => {
  child.on("error", (error) => {
    console.error(`[render] ${name} failed to start: ${error.message}`);
    shutdown("SIGTERM");
  });

  child.on("exit", (code) => {
    console.error(`[render] ${name} exited with ${code ?? "a signal"}`);
    if (!shuttingDown) shutdown("SIGTERM");
    process.exitCode = code ?? 1;
  });
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
