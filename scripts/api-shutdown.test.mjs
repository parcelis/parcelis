import assert from "node:assert/strict";
import test from "node:test";
import { closeApiResources, createApiShutdown } from "../apps/api/scripts/server.mjs";

test("shutdown drains requests before closing Next and resources, once for repeated signals", async () => {
  const events = [];
  let drained;
  const shutdown = createApiShutdown(
    {
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
    { close: (callback) => callback() },
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

test("cleanup attempts every resource and reports failures without rerunning callbacks", async () => {
  let closed = false;
  globalThis.parcelisApiCleanup = new Set([
    () => {
      throw new Error("Redis unavailable");
    },
    async () => {
      closed = true;
    },
  ]);
  await assert.rejects(closeApiResources(), AggregateError);
  assert.equal(closed, true);
  assert.equal(globalThis.parcelisApiCleanup, undefined);
  await closeApiResources();
});
