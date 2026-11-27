import assert from "node:assert/strict";
import test from "node:test";
import { getDatabaseConfig } from "../../modules/database-config";

test("only development and test environments allow the local database fallback", () => {
  for (const ENVIRONMENT of ["development", "test"]) {
    assert.deepEqual(getDatabaseConfig({ ENVIRONMENT, POSTGRES_PORT: "54321" }), {
      connectionString: "postgresql://parcelis:parcelis@localhost:54321/parcelis?schema=public",
      schema: "public",
    });
  }
  for (const ENVIRONMENT of ["production", "staging", undefined]) {
    assert.throws(() => getDatabaseConfig({ ENVIRONMENT }), /^Error: DATABASE_URL is required\.$/);
  }
});

test("ENVIRONMENT takes precedence over NODE_ENV when both are set", () => {
  assert.throws(
    () => getDatabaseConfig({ ENVIRONMENT: "production", NODE_ENV: "development" }),
    /^Error: DATABASE_URL is required\.$/,
  );
});

test("invalid database URLs fail without exposing their contents", () => {
  for (const DATABASE_URL of ["", "   ", "private-database-secret", "mysql://db.example/app"]) {
    for (const ENVIRONMENT of ["development", "test", "production"]) {
      assert.throws(
        () => getDatabaseConfig({ ENVIRONMENT, DATABASE_URL }),
        /^Error: DATABASE_URL must be a valid PostgreSQL URL\.$/,
      );
    }
  }
});

test("explicit PostgreSQL URLs preserve connection settings and select the schema", () => {
  for (const protocol of ["postgres", "postgresql"]) {
    const DATABASE_URL = `${protocol}://user:secret@db.example/app?schema=tenant&sslmode=require`;
    assert.deepEqual(getDatabaseConfig({ ENVIRONMENT: "production", DATABASE_URL }), {
      connectionString: DATABASE_URL,
      schema: "tenant",
    });
  }
  assert.equal(getDatabaseConfig({ DATABASE_URL: "postgresql://localhost/app" }).schema, "public");
});
