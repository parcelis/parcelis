#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { findOpenPort } from "./port-utils.mjs";

const envPath = resolve(import.meta.dirname, "../.env");

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const apiPort = await findOpenPort(process.env.API_PORT ?? 40010);
const webPort = await findOpenPort(process.env.WEB_PORT ?? process.env.PORT ?? 30000);
const docsPort = await findOpenPort(process.env.DOCS_PORT ?? 40000);
const postgresPort = process.env.POSTGRES_PORT ?? 54320;
const minioPort = process.env.MINIO_API_PORT ?? 9001;
const databaseUrl =
  process.env.DATABASE_URL ?? `postgresql://parcelis:parcelis@localhost:${postgresPort}/parcelis?schema=public`;
const objectStorageEndpoint = process.env.S3_ENDPOINT ?? `http://localhost:${minioPort}`;
const objectStoragePublicEndpoint =
  process.env.S3_PUBLIC_ENDPOINT ?? process.env.NEXT_PUBLIC_S3_URL ?? `http://localhost:${minioPort}`;
const objectStorageBucket = process.env.S3_BUCKET ?? process.env.MINIO_BUCKET ?? "parcelis-images";
const objectStorageAccessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.MINIO_ROOT_USER ?? "parcelis-minio";
const objectStorageSecretAccessKey =
  process.env.S3_SECRET_ACCESS_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? "parcelis-minio-secret";
const brandLogoUrl =
  process.env.NEXT_PUBLIC_BRAND_LOGO_URL ??
  `${objectStoragePublicEndpoint}/${process.env.MINIO_ASSETS_BUCKET ?? "parcelis-assets"}/brand/parcelis-light.png`;
const darkBrandLogoUrl =
  process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL ??
  `${objectStoragePublicEndpoint}/${process.env.MINIO_ASSETS_BUCKET ?? "parcelis-assets"}/brand/parcelis-dark.png`;

function runCompose(args) {
  execFileSync("docker", ["compose", "-f", "docker-compose-dev.yml", ...args], {
    cwd: resolve(import.meta.dirname, ".."),
    stdio: "inherit",
  });
}

function startDevelopmentServices() {
  try {
    console.log("[parcelis] Ensuring local services are running");
    runCompose(["up", "-d", "--wait", "postgres"]);
    runCompose(["up", "-d", "minio"]);
    runCompose(["up", "minio-init"]);
  } catch {
    console.error("[parcelis] Could not start local services. Install and start Docker, then run pnpm dev again.");
    process.exit(1);
  }
}

startDevelopmentServices();

const processes = [
  {
    name: "api",
    args: ["--filter", "@parcelis/api", "dev:fixed"],
    env: {
      API_PORT: String(apiPort),
      DATABASE_URL: databaseUrl,
      S3_ACCESS_KEY_ID: objectStorageAccessKeyId,
      S3_BUCKET: objectStorageBucket,
      S3_ENDPOINT: objectStorageEndpoint,
      S3_PUBLIC_ENDPOINT: objectStoragePublicEndpoint,
      S3_REGION: process.env.S3_REGION ?? "us-east-1",
      S3_SECRET_ACCESS_KEY: objectStorageSecretAccessKey,
      WEB_ORIGIN: `http://localhost:${webPort}`,
    },
  },
  {
    name: "web",
    args: ["--filter", "@parcelis/web", "dev:fixed"],
    env: {
      NEXT_PUBLIC_S3_URL: objectStoragePublicEndpoint,
      NEXT_PUBLIC_BRAND_LOGO_URL: brandLogoUrl,
      NEXT_PUBLIC_DARK_BRAND_LOGO_URL: darkBrandLogoUrl,
      PORT: String(webPort),
      NEXT_PUBLIC_API_URL: `http://localhost:${apiPort}`,
    },
  },
  {
    name: "docs",
    args: ["--filter", "@parcelis/docs", "dev:fixed"],
    env: {
      PORT: String(docsPort),
    },
  },
];

console.log("[parcelis] Starting local development");
console.log(`[parcelis] Web:  http://localhost:${webPort}`);
console.log(`[parcelis] API:  http://localhost:${apiPort}`);
console.log(`[parcelis] Docs: http://localhost:${docsPort}`);
console.log(`[parcelis] Object storage: ${objectStoragePublicEndpoint} (${objectStorageBucket})`);

const children = processes.map(({ name, args, env }) => {
  const child = spawn("pnpm", args, {
    detached: process.platform !== "win32",
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });

  child.on("exit", (code) => {
    if (code && !shuttingDown) {
      console.error(`[parcelis] ${name} exited with code ${code}`);
      shutdown(code);
    }
  });

  return child;
});

let shuttingDown = false;

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform !== "win32" && child.pid) {
    process.kill(-child.pid, "SIGTERM");
    return;
  }

  child.kill("SIGTERM");
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => child.once("exit", resolve));
}

async function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  children.forEach(stopChild);
  await Promise.race([Promise.all(children.map(waitForExit)), new Promise((resolve) => setTimeout(resolve, 5000))]);
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
