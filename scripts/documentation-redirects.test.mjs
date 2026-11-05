import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import nextConfig from "../apps/web/next.config.mjs";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
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
    ["/docs/diagrams/parcelis-database-erd.vsdx", "/diagrams/parcelis-database-erd.vsdx"],
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
