import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { OpenApiMeta } from "trpc-to-openapi";
import { publicRouter } from "../../router/public.router";
import { apiTokenAllowedProcedures } from "../../router/trpc";

const document = JSON.parse(readFileSync(new URL("../../../openapi/parcelis.openapi.json", import.meta.url), "utf8"));

test("OpenAPI authentication matches the REST token allowlist and keeps health public", () => {
  const protectedPaths = new Set<string>();
  let operations = 0;
  const procedures = publicRouter._def.procedures as unknown as Record<string, { _def: { meta?: OpenApiMeta } }>;
  for (const [path, procedure] of Object.entries(procedures)) {
    const meta = procedure._def.meta?.openapi;
    assert.ok(meta, `${path} needs OpenAPI metadata`);
    const operation = document.paths[meta.path]?.[meta.method.toLowerCase()];
    assert.ok(operation, `${path} must appear in the generated contract`);
    operations += 1;
    if (path === "health") {
      assert.equal(meta.protect, false);
      assert.equal(operation.security, undefined);
      assert.equal(operation.responses[401], undefined);
    } else {
      protectedPaths.add(path);
      assert.equal(meta.protect, true, `${path} must explicitly require authentication`);
      assert.deepEqual(operation.security, [{ Authorization: [] }]);
      assert.ok(operation.responses[401], `${path} needs a 401 response`);
    }
  }
  assert.deepEqual(protectedPaths, apiTokenAllowedProcedures);
  assert.equal(Object.values(document.paths).flatMap((path) => Object.keys(path as object)).length, operations);
  assert.equal(document.security, undefined);
  assert.equal(document.components.securitySchemes.Authorization.type, "http");
  assert.equal(document.components.securitySchemes.Authorization.scheme, "bearer");
  assert.match(document.components.securitySchemes.Authorization.description, /pcls_api_/);
});
