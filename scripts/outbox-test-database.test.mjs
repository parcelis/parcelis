import assert from "node:assert/strict";
import test from "node:test";
import { createIsolatedTestSchema, validateOutboxTestDatabaseUrl } from "./outbox-test-database.mjs";

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

test("isolated schema rejects a prefix that would exceed PostgreSQL's identifier limit", async () => {
  await assert.rejects(
    createIsolatedTestSchema({}, "postgresql://localhost/outbox_test", "a".repeat(31)),
    /cannot exceed 30 characters/,
  );
});
