#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { runPostgresCompose } from "./compose-postgres.mjs";

const rootDirectory = resolve(import.meta.dirname, "..");

function runCompose(args) {
  execFileSync("docker", ["compose", "-f", "docker-compose-dev.yml", ...args], {
    cwd: rootDirectory,
    stdio: "inherit",
  });
}

try {
  console.log("[parcelis] Refreshing nginx, PostgreSQL, Redis, and MinIO");
  runCompose(["up", "-d", "--wait", "--force-recreate", "proxy-service", "redis-service", "minio-service"]);
  runPostgresCompose(runCompose, ["up", "-d", "--wait", "--force-recreate", "postgres-service"]);
  runCompose(["up", "--force-recreate", "minio-init-service"]);
} catch {
  console.error("[parcelis] Could not refresh local services. Ensure Docker is running, then try again.");
  process.exit(1);
}
