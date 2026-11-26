import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "pg";
import { validateOutboxTestDatabaseUrl } from "../../../../scripts/outbox-test-database.mjs";

const databaseUrl = process.env.OUTBOX_TEST_DATABASE_URL;
if (databaseUrl) validateOutboxTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);

const migrations = new URL("../../prisma/migrations/", import.meta.url);
const installMigration = new URL("20261124000000_add_installation_identity/migration.sql", migrations);
const upgradeMigration = new URL("20261125020000_backfill_and_enforce_installation_identity/migration.sql", migrations);

test(
  "Installation identity upgrade backfills existing installations and enforces one row",
  {
    skip: !databaseUrl,
  },
  async (t) => {
    const [installSql, upgradeSql] = await Promise.all([
      readFile(installMigration, "utf8"),
      readFile(upgradeMigration, "utf8"),
    ]);

    for (const scenario of ["fresh", "existing without an identity", "existing with an identity"]) {
      await t.test(scenario, async () => {
        const connection = new Client({ connectionString: databaseUrl });
        await connection.connect();
        const schema = `installation_migration_${randomUUID().replaceAll("-", "")}`;
        try {
          await connection.query(`CREATE SCHEMA "${schema}"`);
          await connection.query(`SET search_path TO "${schema}"`);
          await connection.query('CREATE TABLE "User" ("id" TEXT PRIMARY KEY)');
          await connection.query(installSql);
          if (scenario !== "fresh") {
            await connection.query('INSERT INTO "User" ("id") VALUES ($1)', [randomUUID()]);
          }
          if (scenario === "existing with an identity") {
            await connection.query('INSERT INTO "Installation" ("installationId") VALUES ($1)', [randomUUID()]);
          }
          const before = await connection.query('SELECT * FROM "Installation"');

          await connection.query(upgradeSql);
          const after = await connection.query('SELECT * FROM "Installation"');

          if (scenario === "existing without an identity") {
            assert.equal(after.rowCount, 1);
            assert.equal(after.rows[0].id, "installation");
            assert.match(after.rows[0].installationId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
          } else {
            assert.deepEqual(after.rows, before.rows);
          }
          await assert.rejects(
            connection.query('INSERT INTO "Installation" ("id", "installationId") VALUES ($1, $2)', [
              "second",
              randomUUID(),
            ]),
            { code: "23514" },
          );
        } finally {
          try {
            await connection.query("ROLLBACK");
            await connection.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
          } finally {
            await connection.end();
          }
        }
      });
    }
  },
);
