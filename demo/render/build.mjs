#!/usr/bin/env node
import { spawn } from "node:child_process";

const child = spawn("pnpm", ["build"], {
  env: {
    ...process.env,
    API_INTERNAL_URL: "http://127.0.0.1:40010",
    NEXT_PUBLIC_API_URL: "",
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
