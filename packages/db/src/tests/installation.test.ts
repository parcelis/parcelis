import assert from "node:assert/strict";
import test from "node:test";
import type { Installation, PrismaClient } from "@prisma/client";
import { initializeInstallationIdentity } from "../installation.js";

function database() {
  let record: Installation | null = null;
  let writes = 0;
  const prisma = {
    installation: {
      findUnique: async () => record && structuredClone(record),
      upsert: async ({ create }: { create: Omit<Installation, "createdAt"> }) => {
        writes++;
        record ??= { ...create, createdAt: new Date() };
        return structuredClone(record);
      },
    },
  } as unknown as Pick<PrismaClient, "installation">;
  return {
    prisma,
    get record() {
      return record;
    },
    get writes() {
      return writes;
    },
  };
}

test("account setup creates a local installation UUID without licensing state", async () => {
  const db = database();
  const identity = await initializeInstallationIdentity(db.prisma);
  assert.equal(identity.id, "installation");
  assert.match(identity.installationId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(Object.keys(identity).sort(), ["createdAt", "id", "installationId"]);
});

test("later account setup preserves the installation ID and creation timestamp", async () => {
  const db = database();
  const saved = await initializeInstallationIdentity(db.prisma);
  assert.deepEqual(await initializeInstallationIdentity(db.prisma), saved);
  assert.equal(db.writes, 1);
});

test("concurrent account setup shares one installation ID", async () => {
  const db = database();
  const identities = await Promise.all(Array.from({ length: 8 }, () => initializeInstallationIdentity(db.prisma)));
  assert.equal(new Set(identities.map(({ installationId }) => installationId)).size, 1);
});

test("setup storage errors propagate to the account transaction", async () => {
  const db = database();
  db.prisma.installation.upsert = () => {
    throw new Error("Storage unavailable");
  };
  await assert.rejects(initializeInstallationIdentity(db.prisma), /Storage unavailable/);
  assert.equal(db.record, null);
});
