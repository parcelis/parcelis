import { deferred } from "./deferred";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, get } from "node:http";
import { setImmediate as nextTurn } from "node:timers/promises";
import test from "node:test";
import { drainStatusServer } from "../../status/shutdown";

test("shutdown waits for active HTTP responses as well as polling and cleanup", async (t) => {
  const poll = deferred<void>();
  const cleanup = deferred<void>();
  const started = deferred<() => void>();
  const server = createServer((_request, response) => {
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
  const request = get(`http://127.0.0.1:${address.port}`, { agent: false }, (response) => response.resume());
  request.on("error", () => {});
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
