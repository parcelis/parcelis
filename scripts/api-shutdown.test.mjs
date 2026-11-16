import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter, once } from "node:events";
import { createServer as createHttpsServer, request as httpsRequest } from "node:https";
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

function createLocalHttpsServer(handler) {
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
  const server = createHttpsServer({ key, cert: certificate }, handler);
  return {
    server,
    certificate,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

test("shutdown closes an active upgraded socket before Next and resource cleanup", { timeout: 5000 }, async (t) => {
  const { server, cleanup } = createLocalHttpsServer();
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
    cleanup?.();
    clientSocket?.destroy();
    upgradedSocket?.destroy();
    server.close();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const client = httpsRequest({
    hostname: "127.0.0.1",
    port: server.address().port,
    rejectUnauthorized: process.env.CI === "true",
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
  const { server, cleanup } = createLocalHttpsServer();
  const shutdown = createApiShutdown(server, { close: async () => {} }, async () => {});
  t.after(() => {
    cleanup();
    server.close();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const client = httpsRequest({
    hostname: "127.0.0.1",
    port: server.address().port,
    rejectUnauthorized: process.env.CI === "true",
    headers: { Connection: "Upgrade", Upgrade: "websocket" },
  });
  t.after(() => client.destroy());
  const rejected = once(client, "error");
  client.end();
  const [error] = await rejected;
  assert.equal(error.code, "ECONNRESET");
  await shutdown();
});

for (const failure of ["socket error", "synchronous throw", "promise rejection"]) {
  test(`upgrade ${failure} closes the socket and permits cleanup`, async () => {
    const events = [];
    const server = Object.assign(new EventEmitter(), { close: (callback) => callback() });
    const socket = Object.assign(new EventEmitter(), {
      destroyed: false,
      destroy() {
        if (!this.destroyed) {
          this.destroyed = true;
          this.emit("close");
        }
      },
    });
    const shutdown = createApiShutdown(
      server,
      { close: async () => events.push("next") },
      async () => events.push("resources"),
      () => {
        if (failure === "socket error") socket.emit("error", new Error("Handshake reset"));
        if (failure === "synchronous throw") throw new Error("Handshake failed");
        if (failure === "promise rejection") return Promise.reject(new Error("Handshake failed"));
      },
    );
    assert.doesNotThrow(() => server.emit("upgrade", {}, socket, Buffer.alloc(0)));
    await Promise.resolve();
    assert.equal(socket.destroyed, true);
    await shutdown();
    assert.deepEqual(events, ["next", "resources"]);
  });
}

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
