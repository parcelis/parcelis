import assert from "node:assert/strict";
import test from "node:test";
import { getTrustedProxyHops, parseTrustedProxyHops } from "../../modules/proxy-config";

test("proxy trust defaults to zero and accepts non-negative safe integers", () => {
  assert.equal(parseTrustedProxyHops(undefined), 0);
  assert.equal(parseTrustedProxyHops("0"), 0);
  assert.equal(parseTrustedProxyHops("2"), 2);
});

test("invalid proxy trust values fail with a configuration error", () => {
  for (const value of ["-1", "1.5", "invalid", "NaN", "Infinity", "9007199254740992"]) {
    assert.throws(() => parseTrustedProxyHops(value), /API_TRUST_PROXY_HOPS must be a non-negative integer/);
  }
});

test("proxy trust is cached after initialization", (t) => {
  const original = process.env.API_TRUST_PROXY_HOPS;
  t.after(() => {
    if (original === undefined) delete process.env.API_TRUST_PROXY_HOPS;
    else process.env.API_TRUST_PROXY_HOPS = original;
  });
  process.env.API_TRUST_PROXY_HOPS = "2";
  assert.equal(getTrustedProxyHops(), 2);
  process.env.API_TRUST_PROXY_HOPS = "invalid";
  assert.equal(getTrustedProxyHops(), 2);
});
