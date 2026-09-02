#!/usr/bin/env node
import { spawn } from "node:child_process";

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Command stopped with ${signal}`));
        return;
      }
      if (code === 0) resolve();
      else reject(new Error(`Command exited with ${code}`));
    });
  });
}

await run(["exec", "prisma", "migrate", "deploy", "--schema", "packages/db/prisma/schema.prisma"]);
await run(["--filter", "@parcelis/db", "exec", "prisma", "db", "seed"]);
