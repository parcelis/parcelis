import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { default: loadConfig } = require("next/dist/server/config");
const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");
const webDirectory = fileURLToPath(new URL("../apps/web/", import.meta.url));
const originalDirectory = process.cwd();
let nextConfig;
for (const directory of [fileURLToPath(new URL("../", import.meta.url)), webDirectory]) {
  try {
    process.chdir(directory);
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, webDirectory, { silent: true });
    assert.ok((await config.redirects()).length > 0);
    nextConfig = config;
  } finally {
    process.chdir(originalDirectory);
  }
}

const { unstable_getResponseFromNextConfig, getRedirectUrl } = require("next/experimental/testing/server");

test("legacy documentation links redirect without a local documentation server", async () => {
  const cases = [
    ["/docs", "/"],
    ["/docs/", "/"],
    ["/docs/getting-started", "/docs/contributor-getting-started"],
    ["/docs/getting-started/deploy-with-docker-compose", "/docs/deploy-with-docker-compose"],
    ["/docs/getting-started/deploy-with-docker-compose/", "/docs/deploy-with-docker-compose"],
    ["/docs/platform-user-guide/core-concepts/lease", "/docs/lease"],
    ["/docs/api-reference/properties-list", "/docs/api/properties-list"],
    ["/docs/api-authentication", "/docs/api-authentication"],
    ["/docs/unknown-page", "/"],
  ];
  for (const [source, destination] of cases) {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://app.example.test${source}?from=bookmark`,
      nextConfig,
    });
    assert.equal(response.status, 308, source);
    assert.equal(getRedirectUrl(response), `https://docs.parcelis.dev${destination}?from=bookmark`, source);
  }
});

test("documentation redirects leave application and API routes available", async () => {
  for (const source of ["/login", "/properties", "/api/v1/health", "/trpc/auth.me"]) {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://app.example.test${source}`,
      nextConfig,
    });
    assert.equal(getRedirectUrl(response), null, source);
  }
});

test("legacy diagram downloads use the verified immutable archive", async () => {
  for (const file of [
    "parcelis-database-erd.vsdx",
    "parcelis-database-erd-overview.vsdx",
    "parcelis-database-erd-overview.png",
  ]) {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://app.example.test/docs/diagrams/${file}`,
      nextConfig,
    });
    assert.equal(response.status, 308);
    assert.equal(
      getRedirectUrl(response),
      `https://raw.githubusercontent.com/parcelis/parcelis/ac46b31332e17ac40879c48e3e886e5ee015294b/apps/docs/static/diagrams/${file}`,
    );
  }
});
