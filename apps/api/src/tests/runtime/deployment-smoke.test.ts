import assert from "node:assert/strict";
import test from "node:test";
import { readSmokeMutationResult } from "./deployment-smoke";

test("smoke mutation failures identify the procedure and HTTP status for non-JSON responses", async () => {
  for (const status of [502, 504]) {
    await assert.rejects(
      readSmokeMutationResult(new Response("<html>Bad gateway</html>", { status }), "leases.finalizeDraft"),
      /leases\.finalizeDraft: HTTP 50[24]: <html>Bad gateway<\/html>/,
    );
  }
});

test("smoke mutation diagnostics limit the response body excerpt", async () => {
  await assert.rejects(
    readSmokeMutationResult(new Response(`${"x".repeat(500)}hidden-tail`, { status: 502 }), "auth.register"),
    (error: Error) => {
      assert.ok(error instanceof assert.AssertionError);
      assert.ok(error.message.includes("auth.register: HTTP 502"));
      assert.ok(!error.message.includes("hidden-tail"));
      return true;
    },
  );
});

test("smoke mutation failures report malformed JSON and missing results on HTTP 200", async () => {
  await assert.rejects(
    readSmokeMutationResult(new Response("<html>Unexpected page</html>"), "auth.register"),
    /auth\.register: HTTP 200: .*invalid JSON/,
  );
  for (const body of ["null", JSON.stringify({ error: { message: "Procedure failed" } })]) {
    await assert.rejects(readSmokeMutationResult(new Response(body), "auth.register"), /auth\.register: HTTP 200/);
  }
});

test("smoke mutations preserve successful result data", async () => {
  assert.deepEqual(
    await readSmokeMutationResult(Response.json({ result: { data: { id: 3 } } }), "leases.createDraft"),
    { id: 3 },
  );
});
