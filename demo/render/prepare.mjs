#!/usr/bin/env node
import { spawn } from "node:child_process";

function run(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      env,
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

await run(["--filter", "@parcelis/db", "exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]);
await run(["--filter", "@parcelis/db", "exec", "prisma", "db", "seed", "--", "--demo"], {
  ...process.env,
  SEED_ORGANIZATION_NAME: process.env.SEED_ORGANIZATION_NAME?.trim() || "Parcelis Property Management",
});
