import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkApplicationServices } from "../modules/application-checks";
import { checkBackgroundServices, checkDependencies } from "../modules/service-checks";
import { runApiCleanup } from "../modules/runtime-cleanup";
import { renderStatusPage } from "./page";
import { getStatusTheme } from "./theme";
import { drainStatusServer } from "./shutdown";
import { overallStatus, updateComponent, visibleComponent, type Component } from "./state";

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
  for (const check of checks) {
    const previous = components.get(check.id);
    const next = updateComponent(previous, check);
    components.set(check.id, next);
    const previousChecks = new Map(
      [previous, ...(previous?.checks ?? [])].filter((item) => item !== undefined).map((item) => [item.id, item]),
    );
    for (const current of [next, ...(next.checks ?? [])]) {
      const before = previousChecks.get(current.id);
      if (!before || before.status === current.status) continue;
      const alert = {
        component: next.name,
        ...(current === next ? {} : { check: current.name }),
        status: current.status,
        previous: before.status,
        at: current.checkedAt,
      };
      console.info(JSON.stringify(alert));
      if (process.env.STATUS_ALERT_WEBHOOK_URL) {
        try {
          const response = await fetch(process.env.STATUS_ALERT_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(alert),
            signal: AbortSignal.timeout(3_000),
          });
          if (!response.ok) console.error("[status] Alert webhook rejected the notification.");
        } catch {
          console.error("[status] Alert webhook failed.");
        }
      }
    }
  }
}

const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
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
    .catch(() => console.error("[status] Check cycle failed."))
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
  void shutdown().catch(() => {
    console.error("[status] Shutdown failed.");
    process.exit(1);
  });
process.once("SIGINT", handleShutdown);
process.once("SIGTERM", handleShutdown);
