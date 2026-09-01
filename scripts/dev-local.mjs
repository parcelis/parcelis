#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { findOpenPort } from "./port-utils.mjs";

const envPath = resolve(import.meta.dirname, "../.env");

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const requestedApiPort = Number(process.env.API_PORT ?? 40010);
const requestedAppPort = Number(process.env.APP_PORT ?? process.env.PORT ?? 30000);
const requestedDocsPort = Number(process.env.DOCS_PORT ?? 40000);

function getListenerProcessIds(port) {
  try {
    return execFileSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(Number);
  } catch (error) {
    if (error?.status === 1) return [];
    throw error;
  }
}

function isRunning(processId) {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopListener(port) {
  if (process.platform === "win32") return;

  const processIds = getListenerProcessIds(port);
  if (!processIds.length) return;

  for (const processId of processIds) {
    process.kill(processId, "SIGTERM");
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  for (const processId of processIds) {
    if (isRunning(processId)) {
      process.kill(processId, "SIGKILL");
    }
  }

  console.log(`[parcelis] Stopped existing listener on port ${port}`);
}

await Promise.all([requestedAppPort, requestedDocsPort, requestedApiPort].map(stopListener));

const apiPort = await findOpenPort(requestedApiPort);
const appPort = await findOpenPort(requestedAppPort);
const docsPort = await findOpenPort(requestedDocsPort);
const proxyPort = process.env.PROXY_PORT ?? 80;
const proxyOrigin = Number(proxyPort) === 80 ? "http://localhost" : `http://localhost:${proxyPort}`;
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
const emailEnvironment = Object.fromEntries(
  ["EMAIL_FROM", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD"].flatMap((name) => {
    const value = process.env[name];
    return value === undefined ? [] : [[name, value]];
  }),
);

function runCompose(args) {
  execFileSync("docker", ["compose", "-f", "docker-compose-dev.yml", ...args], {
    cwd: resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      API_PORT: String(apiPort),
      DOCS_PORT: String(docsPort),
      APP_PORT: String(appPort),
    },
    stdio: "inherit",
  });
}

function startDevelopmentServices() {
  try {
    console.log("[parcelis] Ensuring local services are running");
    runCompose(["up", "-d", "proxy-service"]);
    runCompose(["up", "-d", "--wait", "postgres-service"]);
    runCompose(["up", "-d", "minio-service"]);
    runCompose(["up", "minio-init-service"]);
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
      ...emailEnvironment,
      WEB_ORIGIN: proxyOrigin,
    },
  },
  {
    name: "web",
    args: ["--filter", "@parcelis/web", "dev:fixed"],
    env: {
      NEXT_PUBLIC_S3_URL: objectStoragePublicEndpoint,
      NEXT_PUBLIC_BRAND_LOGO_URL: brandLogoUrl,
      NEXT_PUBLIC_DARK_BRAND_LOGO_URL: darkBrandLogoUrl,
      PORT: String(appPort),
      API_INTERNAL_URL: `http://localhost:${apiPort}`,
      DOCS_INTERNAL_URL: `http://localhost:${docsPort}`,
      NEXT_PUBLIC_API_URL: "",
    },
  },
  {
    name: "docs",
    args: ["--filter", "@parcelis/docs", "dev:fixed"],
    env: {
      PORT: String(docsPort),
      DOCS_BASE_URL: "/docs/",
    },
  },
];

console.log("[parcelis] Starting local development");
console.log(`[parcelis] Web:  ${proxyOrigin}`);
console.log(`[parcelis] API:  ${proxyOrigin}/api/v1`);
console.log(`[parcelis] Docs: ${proxyOrigin}/docs/`);
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
