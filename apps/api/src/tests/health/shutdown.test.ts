import { deferred } from "./deferred";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createServer as createHttpsServer, get } from "node:https";
import { setImmediate as nextTurn } from "node:timers/promises";
import test from "node:test";
import { drainStatusServer } from "../../status/shutdown";

function createLocalHttpsServer(handler: (request: unknown, response: { writeHead: Function; write: Function; end: Function }) => void) {
  const tempDir = mkdtempSync(join(tmpdir(), "parcelis-local-cert-"));
  execFileSync("openssl", [
    "req",
    "-x509",
    "-nodes",
    "-newkey",
    "rsa:2048",
    "-keyout",
    join(tempDir, "key.pem"),
    "-out",
    join(tempDir, "cert.pem"),
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ]);
  const key = readFileSync(join(tempDir, "key.pem"), "utf8");
  const certificate = readFileSync(join(tempDir, "cert.pem"), "utf8");
  const server = createHttpsServer({ key, cert: certificate }, handler as any);
  return {
    server,
    certificate,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

test("shutdown waits for active HTTP responses as well as polling and cleanup", { timeout: 5_000 }, async (t) => {
  const poll = deferred<void>();
  const cleanup = deferred<void>();
  const started = deferred<() => void>();
  const { server, cleanup: serverCleanup } = createLocalHttpsServer((_request, response) => {
    response.writeHead(200);
    response.write("in progress");
    started.resolve(() => response.end());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    serverCleanup();
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const request = get(
    `https://127.0.0.1:${address.port}`,
    { rejectUnauthorized: process.env.CI === "true" },
    (response) => response.resume(),
  );
  request.on("error", (error) => started.reject(error));
  const finishResponse = await started.promise;
  let completed = false;
  const draining = drainStatusServer(server, poll.promise, async () => {
    cleanup.resolve();
  }).then(() => {
    completed = true;
  });
  await nextTurn();
  assert.equal(completed, false);
  poll.resolve();
  await cleanup.promise;
  await nextTurn();
  assert.equal(completed, false);
  finishResponse();
  await draining;
  assert.equal(completed, true);
});
