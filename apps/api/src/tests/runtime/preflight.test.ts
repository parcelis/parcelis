import assert from "node:assert/strict";
import test from "node:test";
import { OPTIONS as trpcOptions } from "../../app/trpc/[trpc]/route";
import { OPTIONS as healthOptions } from "../../app/api/v1/health/route";
import { OPTIONS as restOptions } from "../../app/api/v1/[...path]/route";

test("preflight methods match the route handlers", () => {
  for (const [handler, path, methods] of [
    [trpcOptions, "/trpc/auth.register", ["GET", "POST"]],
    [healthOptions, "/api/v1/health", ["GET", "HEAD"]],
    [restOptions, "/api/v1/tags", ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]],
  ] as const) {
    const response = handler(
      new Request(`http://localhost${path}`, {
        method: "OPTIONS",
        headers: { "access-control-request-method": "PUT" },
      }),
    );
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-methods"), methods.join(", "));
  }
});
