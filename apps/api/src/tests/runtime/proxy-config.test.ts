import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseTrustedProxyHops } from "../../modules/proxy-config";

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

test("proxy trust is cached after initialization", () => {
  const require = createRequire(import.meta.url);
  const modulePath = fileURLToPath(new URL("../../modules/proxy-config.ts", import.meta.url));
  const script = `
    const assert = require("node:assert/strict");
    const { getTrustedProxyHops } = require(${JSON.stringify(modulePath)});
    assert.equal(getTrustedProxyHops(), 2);
    process.env.API_TRUST_PROXY_HOPS = "invalid";
    assert.equal(getTrustedProxyHops(), 2);
  `;
  const result = spawnSync(process.execPath, ["--import", require.resolve("tsx"), "--eval", script], {
    env: { ...process.env, API_TRUST_PROXY_HOPS: "2" },
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, `${result.error?.message ?? result.stderr}; signal=${result.signal}`);
});
