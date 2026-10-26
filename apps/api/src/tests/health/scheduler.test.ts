import assert from "node:assert/strict";
import test from "node:test";
import { getScheduledRunHeartbeat, leaseReconciliationJobName, scheduledHeartbeatTtlSeconds } from "@parcelis/jobs";
import { isScheduledRunHealthy } from "../../modules/service-checks";

const schedulerId = leaseReconciliationJobName;
const now = 1_000_000;
const scheduledAt = now - 1_000;
const job = {
  name: schedulerId,
  repeatJobKey: schedulerId,
  id: `repeat:${schedulerId}:${scheduledAt}`,
};
const scheduler = { name: schedulerId, key: schedulerId, next: now + 59_000 };

test("only an actual scheduler-generated reconciliation run can publish its completion proof", () => {
  const proof = getScheduledRunHeartbeat(job, schedulerId, now);
  assert.ok(proof);
  assert.equal(isScheduledRunHealthy(scheduler, JSON.stringify(proof), now), true);
  assert.equal(getScheduledRunHeartbeat({ name: schedulerId, id: "manual" }, schedulerId, now), undefined);
  assert.equal(getScheduledRunHeartbeat({ ...job, repeatJobKey: undefined }, schedulerId, now), undefined);
  assert.equal(getScheduledRunHeartbeat({ ...job, id: "manual" }, schedulerId, now), undefined);
});

test("registered schedulers with manual, stale, or mismatched heartbeat data remain unhealthy", () => {
  const proof = getScheduledRunHeartbeat(job, schedulerId, now)!;
  for (const value of [
    null,
    String(now),
    "invalid",
    JSON.stringify({ ...proof, jobId: "manual" }),
    JSON.stringify({ ...proof, schedulerId: "another-scheduler" }),
  ]) {
    assert.equal(isScheduledRunHealthy(scheduler, value, now), false);
  }
  assert.equal(isScheduledRunHealthy(undefined, JSON.stringify(proof), now), false);
  assert.equal(isScheduledRunHealthy({ ...scheduler, next: scheduledAt }, JSON.stringify(proof), now), false);
  assert.equal(
    isScheduledRunHealthy(scheduler, JSON.stringify(proof), now + scheduledHeartbeatTtlSeconds * 1_000),
    false,
  );
  assert.equal(isScheduledRunHealthy(scheduler, JSON.stringify({ ...proof, completedAt: now + 1 }), now), false);
});
