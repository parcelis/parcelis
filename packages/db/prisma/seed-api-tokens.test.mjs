import assert from "node:assert/strict";
import test from "node:test";
import { seedApiTokens } from "./seed-api-tokens.mjs";

function database() {
  const rows = new Map();
  return {
    rows,
    apiToken: {
      upsert({ where, create, update }) {
        const existing = rows.get(where.id);
        rows.set(where.id, existing ? { ...existing, ...update } : structuredClone(create));
        return Promise.resolve(rows.get(where.id));
      },
    },
    $transaction: (operations) => Promise.all(operations),
  };
}

const organization = { id: 1 };
const administrator = { id: 2, name: "Administrator" };

test("demo active token remains active without rerunning the seed", async () => {
  const prisma = database();
  await seedApiTokens(prisma, organization, administrator, new Date("2026-10-22T12:00:00Z"));
  const active = [...prisma.rows.values()].find((row) => row.name === "Demo active token");
  assert.equal(active.expiresAt, null);
  assert.equal(active.revokedAt, null);
  const revoked = [...prisma.rows.values()].find((row) => row.name === "Demo revoked token");
  assert.ok(revoked.revokedAt instanceof Date);
});

test("rerunning the seed preserves every existing token value", async () => {
  const prisma = database();
  prisma.rows.set("user-created", { id: "user-created", name: "Demo active token" });
  await seedApiTokens(prisma, organization, administrator, new Date("2026-10-22T12:00:00Z"));
  const before = structuredClone(prisma.rows);
  await seedApiTokens(prisma, organization, administrator, new Date("2026-12-22T12:00:00Z"));
  assert.equal(prisma.rows.size, 3);
  assert.deepEqual(prisma.rows, before);
});
