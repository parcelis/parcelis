import { deferred } from "./deferred";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { once } from "node:events";
import { createServer as createHttpsServer, get } from "node:https";
import { setImmediate as nextTurn } from "node:timers/promises";
import test from "node:test";
import { drainStatusServer } from "../../status/shutdown";

function createLocalHttpsServer(handler: (request: unknown, response: { writeHead: Function; write: Function; end: Function }) => void) {
  const { privateKey, certificate } = generateKeyPairSync("rsa", {
    modulusLength: 2_048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    server: createHttpsServer({ key: privateKey, cert: certificate }, handler as any),
    certificate,
  };
}

test("shutdown waits for active HTTP responses as well as polling and cleanup", { timeout: 5_000 }, async (t) => {
  const poll = deferred<void>();
  const cleanup = deferred<void>();
  const started = deferred<() => void>();
  const { server, certificate } = createLocalHttpsServer((_request, response) => {
    response.writeHead(200);
    response.write("in progress");
    started.resolve(() => response.end());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const request = get(
    `https://127.0.0.1:${address.port}`,
    { agent: false, ca: certificate, checkServerIdentity: () => undefined },
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
