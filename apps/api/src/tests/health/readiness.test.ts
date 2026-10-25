import assert from "node:assert/strict";
import test from "node:test";
import { createReadinessCheck, readinessTtlMs } from "../../modules/readiness";
import { deferred } from "./deferred";

test("readiness shares in-flight probes and caches results from completion", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  const probe = deferred<{ status: "operational" }[]>();
  let calls = 0;
  const ready = createReadinessCheck(() => {
    calls++;
    return probe.promise;
  });
  const first = ready();
  assert.equal(ready(), first);
  await Promise.resolve();
  assert.equal(calls, 1);
  t.mock.timers.tick(5_000);
  assert.equal(ready(), first);
  probe.resolve([{ status: "operational" }]);
  assert.equal(await first, true);
  t.mock.timers.tick(readinessTtlMs - 1);
  assert.equal(await ready(), true);
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  assert.equal(await ready(), true);
  assert.equal(calls, 2);
});

test("readiness caches unavailable results and recovers after the short TTL", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  let calls = 0;
  const ready = createReadinessCheck(async () => {
    if (++calls === 1) throw new Error("Backend unavailable");
    return [{ status: "operational" }];
  });
  assert.equal(await ready(), false);
  assert.equal(await ready(), false);
  assert.equal(calls, 1);
  t.mock.timers.tick(readinessTtlMs);
  assert.equal(await ready(), true);
  assert.equal(calls, 2);
  assert.equal(await createReadinessCheck(async () => [{ status: "down" }])(), false);
});
