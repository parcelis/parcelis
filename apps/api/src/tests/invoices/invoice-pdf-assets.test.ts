import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const apiRoot = fileURLToPath(new URL("../../../", import.meta.url));
const apiRequire = createRequire(resolve(apiRoot, "package.json"));
const assetScript = String.raw`
  const assert = require("node:assert/strict");
  const { readFileSync } = require("node:fs");
  const { invoicePdfAssets } = require(${JSON.stringify(resolve(apiRoot, "src/modules/invoice-pdf-assets.ts"))});
  for (const key of ["font", "boldFont"]) {
    assert.equal(readFileSync(invoicePdfAssets[key]).subarray(0, 4).toString(), "wOFF");
  }
  for (const key of ["banner", "background"]) {
    assert.equal(readFileSync(invoicePdfAssets[key]).subarray(1, 4).toString(), "PNG");
  }
`;

test("invoice fonts and brand images resolve independently of the working directory", () => {
  for (const cwd of [apiRoot, resolve(apiRoot, "../..")]) {
    for (const useLauncherRoot of [false, true]) {
      const env = { ...process.env };
      if (useLauncherRoot) env.PARCELIS_API_ROOT = apiRoot;
      else delete env.PARCELIS_API_ROOT;
      const result = spawnSync(process.execPath, ["--import", apiRequire.resolve("tsx"), "--eval", assetScript], {
        cwd,
        env,
        encoding: "utf8",
        timeout: 30_000,
      });
      assert.equal(result.status, 0, `${cwd}, launcher root=${useLauncherRoot}: ${result.stderr}`);
    }
  }
});
