import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkApplicationServices } from "../modules/application-checks";
import { checkBackgroundServices, checkDependencies } from "../modules/service-checks";
import { runApiCleanup } from "../modules/runtime-cleanup";
import { renderStatusPage } from "./page";
import { getStatusTheme } from "./theme";
import { drainStatusServer } from "./shutdown";
import { applyCheckResults, overallStatus, visibleComponent, type Component } from "./state";
import { statusRefreshScript } from "./refresh";

process.env.REDIS_HOST ??= "localhost";
process.env.REDIS_PORT ??= "63790";

const brandAssets = new Map(
  [
    "parcelis-fullmark-light.svg",
    "parcelis-light-background.svg",
    "parcelis-fullmark-dark.svg",
    "parcelis-dark-background.svg",
  ].map((name) => [`/brand/${name}`, readFileSync(resolve(process.cwd(), "../web/public/brand", name))]),
);
const components = new Map<string, Component>();
const port = Number(process.env.STATUS_PORT ?? 40020);
const host = process.env.STATUS_HOST ?? "127.0.0.1";
const webUrl = process.env.STATUS_WEB_URL ?? "http://localhost:30000/login";
const apiUrl = process.env.STATUS_API_URL ?? "http://localhost:40010/api/v1/health";
const docsUrl = process.env.STATUS_DOCS_URL ?? "http://localhost:40000/";
let stopping = false;

async function poll() {
  const checks = (
    await Promise.all([
      checkApplicationServices(webUrl, apiUrl, docsUrl),
      checkDependencies(true),
      checkBackgroundServices(),
    ])
  ).flat();
  const alerts = applyCheckResults(components, checks);
  for (const alert of alerts) console.info(JSON.stringify(alert));
  const webhookUrl = process.env.STATUS_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;
  await Promise.all(
    alerts.map(async (alert) => {
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(alert),
          signal: AbortSignal.timeout(3_000),
        });
        await response.body?.cancel();
        if (!response.ok) console.error("[status] Alert webhook rejected the notification.");
      } catch (error) {
        console.error("[status] Alert webhook failed.", error);
      }
    }),
  );
}

const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
  );
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const requestPath = request.url?.split("?")[0] ?? "/";
  const path =
    requestPath === "/status" ? "/" : requestPath.startsWith("/status/") ? requestPath.slice(7) : requestPath;
  const asset = brandAssets.get(path ?? "");
  if (asset) {
    response.setHeader("Content-Type", "image/svg+xml");
    response.setHeader("Cache-Control", "public, max-age=86400");
    response.end(asset);
    return;
  }
  if (path === "/refresh.js") {
    response.setHeader("Content-Type", "text/javascript; charset=utf-8");
    response.end(statusRefreshScript);
    return;
  }
  const items = [...components.values()].map((component) => visibleComponent(component));
  const status = overallStatus(items);
  if (path === "/api/status") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ status, components: items }));
  } else if (path === "/") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    const { theme, cookie } = getStatusTheme(
      new URL(request.url ?? "/", "http://status.local"),
      request.headers.cookie,
    );
    if (cookie) response.setHeader("Set-Cookie", cookie);
    response.end(renderStatusPage(status, items, theme));
  } else response.writeHead(404).end();
});

server.listen(port, host, () => console.info(`[status] http://${host}:${port}`));
let timer: ReturnType<typeof setTimeout>;
let inFlight: Promise<void>;
function schedule() {
  inFlight = poll()
    .catch((error) => console.error("[status] Check cycle failed.", error))
    .finally(() => {
      if (!stopping) timer = setTimeout(schedule, 30_000);
    });
}
schedule();
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  const deadline = setTimeout(() => process.exit(1), 10_000);
  try {
    await drainStatusServer(server, inFlight, runApiCleanup);
  } finally {
    clearTimeout(deadline);
  }
}
const handleShutdown = () =>
  void shutdown().catch((error) => {
    console.error("[status] Shutdown failed.", error);
    process.exit(1);
  });
process.once("SIGINT", handleShutdown);
process.once("SIGTERM", handleShutdown);
