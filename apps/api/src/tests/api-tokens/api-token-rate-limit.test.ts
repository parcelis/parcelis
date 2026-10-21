import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
  consumeApiTokenCreationRateLimit,
  consumeLoginRateLimit,
  getLoginRateLimitKey,
  resetRateLimits,
} from "../../modules/login-rate-limit";

beforeEach(resetRateLimits);

test("token creation budgets are separate by user, organization, and sign-in", () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    consumeApiTokenCreationRateLimit(1, 7);
  }

  assert.throws(() => consumeApiTokenCreationRateLimit(1, 7), { code: "TOO_MANY_REQUESTS" });
  assert.doesNotThrow(() => consumeApiTokenCreationRateLimit(2, 7));
  assert.doesNotThrow(() => consumeApiTokenCreationRateLimit(1, 8));

  const loginKey = getLoginRateLimitKey(undefined, "owner@example.test");
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.doesNotThrow(() => consumeLoginRateLimit(loginKey));
  }

  assert.throws(() => consumeLoginRateLimit(loginKey), { code: "TOO_MANY_REQUESTS" });
  assert.throws(() => consumeApiTokenCreationRateLimit(1, 7), { code: "TOO_MANY_REQUESTS" });
});

test("the creation allowance resets at the fifteen-minute boundary", (t) => {
  const start = Date.parse("2026-10-21T12:00:00.000Z");
  t.mock.timers.enable({ apis: ["Date"], now: start });

  for (let attempt = 0; attempt < 10; attempt++) {
    consumeApiTokenCreationRateLimit(1, 7);
  }

  t.mock.timers.setTime(start + 15 * 60 * 1000 - 1);
  assert.throws(() => consumeApiTokenCreationRateLimit(1, 7), { code: "TOO_MANY_REQUESTS" });

  t.mock.timers.setTime(start + 15 * 60 * 1000);
  assert.doesNotThrow(() => consumeApiTokenCreationRateLimit(1, 7));
});
