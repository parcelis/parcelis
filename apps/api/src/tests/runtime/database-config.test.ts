import assert from "node:assert/strict";
import test from "node:test";
import { getDatabaseConfig } from "../../modules/database-config";

test("only development and test environments allow the local database fallback", () => {
  for (const NODE_ENV of ["development", "test"]) {
    assert.deepEqual(getDatabaseConfig({ NODE_ENV, POSTGRES_PORT: "54321" }), {
      connectionString: "postgresql://parcelis:parcelis@localhost:54321/parcelis?schema=public",
      schema: "public",
    });
  }
  for (const NODE_ENV of ["production", "staging", undefined]) {
    assert.throws(() => getDatabaseConfig({ NODE_ENV }), /^Error: DATABASE_URL is required\.$/);
  }
});

test("invalid database URLs fail without exposing their contents", () => {
  for (const DATABASE_URL of ["", "   ", "private-database-secret", "https://user:secret@db.example/app"]) {
    for (const NODE_ENV of ["development", "test", "production"]) {
      assert.throws(
        () => getDatabaseConfig({ NODE_ENV, DATABASE_URL }),
        /^Error: DATABASE_URL must be a valid PostgreSQL URL\.$/,
      );
    }
  }
});

test("explicit PostgreSQL URLs preserve connection settings and select the schema", () => {
  for (const protocol of ["postgres", "postgresql"]) {
    const DATABASE_URL = `${protocol}://user:secret@db.example/app?schema=tenant&sslmode=require`;
    assert.deepEqual(getDatabaseConfig({ NODE_ENV: "production", DATABASE_URL }), {
      connectionString: DATABASE_URL,
      schema: "tenant",
    });
  }
  assert.equal(getDatabaseConfig({ DATABASE_URL: "postgresql://localhost/app" }).schema, "public");
});
