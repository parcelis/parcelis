import assert from "node:assert/strict";
import test from "node:test";
import { withSeedCurrency } from "./seed-currency.mjs";

function database(currencyCode) {
  let organization = { id: 1, currencyCode, currencyLockedAt: null };
  return {
    get organization() {
      return organization;
    },
    async $transaction(write) {
      const pending = structuredClone(organization);
      const tx = {
        organization: {
          async updateMany({ where, data }) {
            assert.equal(where.id, pending.id);
            assert.equal(where.currencyLockedAt, null);
            if (pending.currencyLockedAt !== null) return { count: 0 };
            Object.assign(pending, data);
            return { count: 1 };
          },
          async findUniqueOrThrow({ where, select }) {
            assert.equal(where.id, pending.id);
            assert.deepEqual(select, { currencyCode: true });
            return { currencyCode: pending.currencyCode };
          },
        },
      };
      const result = await write(tx);
      organization = pending;
      return result;
    },
  };
}

test("USD seed writes use the currency transaction and commit its lock", async () => {
  const prisma = database("USD");
  let writes = 0;
  const result = await withSeedCurrency(prisma, 1, async (tx, currencyCode) => {
    writes += 1;
    assert.equal(currencyCode, "USD");
    assert.deepEqual(await tx.organization.findUniqueOrThrow({ where: { id: 1 }, select: { currencyCode: true } }), {
      currencyCode: "USD",
    });
    assert.equal(prisma.organization.currencyLockedAt, null);
    return "seeded";
  });
  assert.equal(result, "seeded");
  assert.equal(writes, 1);
  assert.ok(prisma.organization.currencyLockedAt instanceof Date);
});

test("non-USD organizations reject demo writes and roll back the currency lock", async () => {
  const prisma = database("EUR");
  const before = structuredClone(prisma.organization);
  await assert.rejects(
    withSeedCurrency(prisma, 1, () => assert.fail("Non-USD demo writes must not run.")),
    { message: "USD demo data cannot be seeded into a non-USD organization." },
  );
  assert.deepEqual(prisma.organization, before);
});

test("failed USD demo writes roll back the currency lock", async () => {
  const prisma = database("USD");
  const failure = new Error("Seed write failed.");
  await assert.rejects(
    withSeedCurrency(prisma, 1, () => {
      throw failure;
    }),
    (error) => error === failure,
  );
  assert.equal(prisma.organization.currencyLockedAt, null);
});
