#!/usr/bin/env node
import { spawn } from "node:child_process";
import { findOpenPort } from "./port-utils.mjs";

const apiPort = await findOpenPort(process.env.API_PORT ?? 4000);
const webPort = await findOpenPort(process.env.WEB_PORT ?? process.env.PORT ?? 3000);
const docsPort = await findOpenPort(process.env.DOCS_PORT ?? 3001);
const postgresPort = process.env.POSTGRES_PORT ?? 55432;
const minioPort = process.env.MINIO_API_PORT ?? 9000;
const databaseUrl =
  process.env.DATABASE_URL ??
  `postgresql://parcelis:parcelis@localhost:${postgresPort}/parcelis?schema=public`;
const objectStorageEndpoint = process.env.OBJECT_STORAGE_ENDPOINT ?? `http://localhost:${minioPort}`;
const objectStoragePublicEndpoint =
  process.env.OBJECT_STORAGE_PUBLIC_ENDPOINT ?? process.env.NEXT_PUBLIC_OBJECT_STORAGE_URL ?? `http://localhost:${minioPort}`;
const objectStorageBucket = process.env.OBJECT_STORAGE_BUCKET ?? process.env.MINIO_BUCKET ?? "parcelis-images";
const objectStorageAccessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID ?? process.env.MINIO_ROOT_USER ?? "parcelis-minio";
const objectStorageSecretAccessKey =
  process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? "parcelis-minio-secret";
const brandLogoUrl =
  process.env.NEXT_PUBLIC_BRAND_LOGO_URL ??
  `${objectStoragePublicEndpoint}/${process.env.MINIO_ASSETS_BUCKET ?? "parcelis-assets"}/brand/parcelis-light.png`;
const darkBrandLogoUrl =
  process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL ??
  `${objectStoragePublicEndpoint}/${process.env.MINIO_ASSETS_BUCKET ?? "parcelis-assets"}/brand/parcelis-dark.png`;

const processes = [
  {
    name: "api",
    args: ["--filter", "@parcelis/api", "dev:fixed"],
    env: {
      API_PORT: String(apiPort),
      DATABASE_URL: databaseUrl,
      OBJECT_STORAGE_ACCESS_KEY_ID: objectStorageAccessKeyId,
      OBJECT_STORAGE_BUCKET: objectStorageBucket,
      OBJECT_STORAGE_ENDPOINT: objectStorageEndpoint,
      OBJECT_STORAGE_PUBLIC_ENDPOINT: objectStoragePublicEndpoint,
      OBJECT_STORAGE_REGION: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
      OBJECT_STORAGE_SECRET_ACCESS_KEY: objectStorageSecretAccessKey,
      WEB_ORIGIN: `http://localhost:${webPort}`,
    },
  },
  {
    name: "web",
    args: ["--filter", "@parcelis/web", "dev:fixed"],
    env: {
      NEXT_PUBLIC_OBJECT_STORAGE_URL: objectStoragePublicEndpoint,
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

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
