import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

function databaseIdentity(value) {
  const url = new URL(value);
  return JSON.stringify([
    url.hostname.toLowerCase(),
    url.port || "5432",
    decodeURIComponent(url.pathname.slice(1)),
    url.searchParams.get("schema") || "public",
  ]);
}

export function validateOutboxTestDatabaseUrl(databaseUrl, configuredDatabaseUrl) {
  const url = new URL(databaseUrl);
  if (!decodeURIComponent(url.pathname.slice(1)).toLowerCase().includes("test")) {
    throw new Error("OUTBOX_TEST_DATABASE_URL must point to a database with 'test' in its name.");
  }
  if (configuredDatabaseUrl && databaseIdentity(databaseUrl) === databaseIdentity(configuredDatabaseUrl)) {
    throw new Error("OUTBOX_TEST_DATABASE_URL must be different from DATABASE_URL.");
  }
}

export async function createOutboxTestSchema(prisma, databaseUrl) {
  const url = new URL(databaseUrl);
  const schema = `outbox_test_${randomUUID().replaceAll("-", "")}`;
  const quote = (value) => `"${value.replaceAll('"', '""')}"`;
  const cleanup = () => prisma.$executeRawUnsafe(`DROP SCHEMA ${quote(schema)} CASCADE`);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA ${quote(schema)}`);
  try {
    url.searchParams.set("schema", schema);
    const packageDir = resolve(import.meta.dirname, "../packages/db");
    await promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "db", "push"], {
      cwd: packageDir,
      env: { ...process.env, DATABASE_URL: url.href },
      timeout: 60_000,
    });
    return { schema, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
