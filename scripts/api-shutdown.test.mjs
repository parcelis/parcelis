import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request } from "node:http";
import test from "node:test";
import { createApiShutdown } from "../apps/api/scripts/server.mjs";
import { registerApiCleanup, runApiCleanup } from "../apps/api/src/modules/runtime-cleanup.ts";

test("shutdown drains requests before closing Next and resources, once for repeated signals", async () => {
  const events = [];
  let drained;
  const shutdown = createApiShutdown(
    {
      on() {},
      close: (callback) => {
        events.push("drain");
        drained = callback;
      },
    },
    {
      close: async () => {
        events.push("next");
      },
    },
    async () => {
      events.push("resources");
    },
  );
  const first = shutdown();
  assert.equal(shutdown(), first);
  assert.deepEqual(events, ["drain"]);
  drained();
  await first;
  assert.deepEqual(events, ["drain", "next", "resources"]);
});

test("resource cleanup still runs if Next shutdown fails", async () => {
  let cleaned = false;
  const shutdown = createApiShutdown(
    { on() {}, close: (callback) => callback() },
    {
      close: async () => {
        throw new Error("Next close failed");
      },
    },
    async () => {
      cleaned = true;
    },
  );
  await assert.rejects(shutdown(), /Next close failed/);
  assert.equal(cleaned, true);
});

test("shutdown closes an active upgraded socket before Next and resource cleanup", { timeout: 5000 }, async (t) => {
  const server = createServer();
  const events = [];
  let upgradedSocket;
  let clientSocket;
  const shutdown = createApiShutdown(
    server,
    { close: async () => events.push("next") },
    async () => events.push("resources"),
    (_request, socket) => {
      upgradedSocket = socket;
      socket.write("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n");
    },
  );
  t.after(() => {
    clientSocket?.destroy();
    upgradedSocket?.destroy();
    server.close();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const client = request({
    hostname: "127.0.0.1",
    port: server.address().port,
    headers: { Connection: "Upgrade", Upgrade: "websocket" },
  });
  client.end();
  [, clientSocket] = await once(client, "upgrade");
  assert.equal(upgradedSocket.destroyed, false);
  const first = shutdown();
  assert.equal(shutdown(), first);
  await first;
  assert.equal(upgradedSocket.destroyed, true);
  assert.deepEqual(events, ["next", "resources"]);
});

test("production rejects upgraded sockets immediately", { timeout: 5000 }, async (t) => {
  const server = createServer();
  const shutdown = createApiShutdown(server, { close: async () => {} }, async () => {});
  t.after(() => server.close());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const client = request({
    hostname: "127.0.0.1",
    port: server.address().port,
    headers: { Connection: "Upgrade", Upgrade: "websocket" },
  });
  t.after(() => client.destroy());
  const rejected = once(client, "error");
  client.end();
  const [error] = await rejected;
  assert.equal(error.code, "ECONNRESET");
  await shutdown();
});

test("cleanup attempts every resource and reports failures without rerunning callbacks", async () => {
  let attempts = 0;
  let closed = 0;
  const failure = new Error("Redis unavailable");
  registerApiCleanup(async () => {
    attempts++;
    throw failure;
  });
  registerApiCleanup(async () => {
    closed++;
  });
  await assert.rejects(runApiCleanup(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [failure]);
    return true;
  });
  assert.equal(attempts, 1);
  assert.equal(closed, 1);
  await runApiCleanup();
  assert.equal(attempts, 1);
  assert.equal(closed, 1);
});
