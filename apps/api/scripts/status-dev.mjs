import { existsSync, mkdirSync, readFileSync, watch } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const runtimeDirectory = resolve(import.meta.dirname, "../../../.parcelis");
mkdirSync(runtimeDirectory, { recursive: true });
const runtimePath = resolve(runtimeDirectory, "dev-status.json");
if (process.argv.includes("--run")) {
  if (existsSync(runtimePath)) {
    Object.assign(process.env, JSON.parse(readFileSync(runtimePath, "utf8")));
  } else {
    console.warn("[status] Start pnpm dev to supply the selected development connection settings.");
  }
  await import("../src/status/server.ts");
} else {
  let child;
  let timer;
  let stopping = false;
  let restarting = false;
  let pending = false;

  function start() {
    child = spawn(process.execPath, [...process.execArgv, import.meta.filename, "--run"], {
      stdio: "inherit",
      env: process.env,
    });
  }

  async function restart() {
    if (stopping) return;
    if (restarting) {
      pending = true;
      return;
    }
    restarting = true;
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill("SIGTERM");
      });
    }
    if (!stopping) start();
    restarting = false;
    if (pending) {
      pending = false;
      void restart();
    }
  }

  const directories = [
    { path: resolve(import.meta.dirname, "../src"), workspace: false },
    { path: runtimeDirectory, workspace: false },
    ...["jobs", "db", "schemas"].map((name) => ({
      path: resolve(import.meta.dirname, `../../../packages/${name}`),
      workspace: true,
    })),
  ];
  const watchers = directories.map(({ path, workspace }) =>
    watch(path, { recursive: true }, (_event, filename) => {
      if (workspace && filename && !/^(src|dist)([/\\]|$)/.test(String(filename))) return;
      clearTimeout(timer);
      timer = setTimeout(() => void restart(), 200);
    }),
  );
  function shutdown() {
    stopping = true;
    clearTimeout(timer);
    watchers.forEach((watcher) => watcher.close());
    child.kill("SIGTERM");
  }
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  start();
}
