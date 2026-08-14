#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const rootDirectory = resolve(import.meta.dirname, "..");

function runCompose(args) {
  execFileSync("docker", ["compose", "-f", "docker-compose-dev.yml", ...args], {
    cwd: rootDirectory,
    stdio: "inherit",
  });
}

try {
  console.log("[parcelis] Refreshing nginx, PostgreSQL, and MinIO");
  runCompose(["up", "-d", "--force-recreate", "proxy-service", "postgres-service", "minio-service"]);
  runCompose(["up", "--force-recreate", "minio-init-service"]);
} catch {
  console.error("[parcelis] Could not refresh local services. Ensure Docker is running, then try again.");
  process.exit(1);
}
