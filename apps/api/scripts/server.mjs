import { createServer } from "node:http";
import { resolve } from "node:path";
import next from "next";
import { config } from "dotenv";
import { getDatabaseConfig } from "../src/modules/database-config.ts";

export async function closeApiResources() {
  const callbacks = globalThis.parcelisApiCleanup;
  delete globalThis.parcelisApiCleanup;
  const results = await Promise.allSettled(Array.from(callbacks ?? [], (cleanup) => Promise.resolve().then(cleanup)));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      "API cleanup failed.",
    );
}

export function createApiShutdown(server, app, cleanup = closeApiResources) {
  let shutdown;
  return () => {
    shutdown ??= (async () => {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      try {
        await app.close();
      } finally {
        await cleanup();
      }
    })();
    return shutdown;
  };
}

export async function startNextApi() {
  config({ path: resolve(import.meta.dirname, "../../../.env") });
  const port = Number(process.env.API_PORT ?? 40010);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid API_PORT.");
  const hostname = process.env.API_HOSTNAME ?? "0.0.0.0";
  const dev = process.argv.includes("--dev");
  process.env.NODE_ENV ??= dev ? "development" : "production";
  getDatabaseConfig();
  const apiRoot = resolve(import.meta.dirname, "..");
  process.env.PARCELIS_API_ROOT = apiRoot;
  const app = next({ dev, hostname, port, dir: apiRoot, turbopack: dev });
  await app.prepare();
  const handler = app.getRequestHandler();
  const server = createServer((request, response) => {
    void handler(request, response).catch((error) => {
      console.error("API request failed.", error);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  if (dev) server.on("upgrade", app.getUpgradeHandler());
  const close = createApiShutdown(server, app);
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => {
      console.error("API shutdown timed out.");
      process.exit(1);
    }, 15_000);
    void close().then(
      () => {
        clearTimeout(timeout);
        process.exit(0);
      },
      (error) => {
        console.error("API shutdown failed.", error);
        clearTimeout(timeout);
        process.exit(1);
      },
    );
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, resolve);
  });
  console.log(`Parcelis Next.js API listening on http://${hostname}:${port}`);
}
