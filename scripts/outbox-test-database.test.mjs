import assert from "node:assert/strict";
import test from "node:test";
import { validateOutboxTestDatabaseUrl } from "./outbox-test-database.mjs";

test("test database validation rejects equivalent identities despite URL differences", () => {
  for (const configured of [
    "postgresql://other:secret@localhost:5432/outbox_test?schema=public&sslmode=disable",
    "postgres://localhost/outbox_test",
    "postgresql://localhost:5432/outbox%5Ftest?schema=public",
  ]) {
    assert.throws(
      () => validateOutboxTestDatabaseUrl("postgresql://user:password@localhost/outbox_test", configured),
      /must be different/,
    );
  }
});

test("test database validation requires a test name and permits a separate identity", () => {
  assert.throws(() => validateOutboxTestDatabaseUrl("postgresql://localhost/parcelis"), /'test'/);
  validateOutboxTestDatabaseUrl("postgresql://localhost/outbox_test", "postgresql://localhost/parcelis");
});
