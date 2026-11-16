import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createIsolatedTestSchema, validateOutboxTestDatabaseUrl } from "../../../../scripts/outbox-test-database.mjs";
import { lockOrganizationCurrency } from "../index.ts";

const databaseUrl = process.env.OUTBOX_TEST_DATABASE_URL;
if (databaseUrl) validateOutboxTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);

test(
  "organization currency locks share the monetary transaction",
  { skip: !databaseUrl, timeout: 60_000 },
  async (t) => {
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "currency_lock_test").catch(async (error) => {
      await admin.$disconnect();
      throw error;
    });
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
    });

    async function createProperty(slug: string, currencyCode = "USD") {
      const organization = await prisma.organization.create({ data: { name: slug, slug, currencyCode } });
      const property = await prisma.property.create({
        data: {
          organizationId: organization.id,
          name: slug,
          line1: "1 Test Street",
          city: "Test",
          region: "IL",
          postalCode: "60000",
          unitCount: 1,
        },
      });
      return { organization, property };
    }

    try {
      await t.test("a saved zero amount locks only its organization and returns the stored currency", async () => {
        const { organization, property } = await createProperty("zero");
        const other = await prisma.organization.create({ data: { name: "Other", slug: "other" } });
        assert.equal(organization.currencyLockedAt, null);

        const code = await prisma.$transaction(async (tx) => {
          const currencyCode = await lockOrganizationCurrency(tx, organization.id);
          await tx.unit.create({ data: { propertyId: property.id, name: "1A", marketRateCents: 0 } });
          return currencyCode;
        });

        assert.equal(code, "USD");
        const saved = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
        assert.ok(saved.currencyLockedAt instanceof Date);
        assert.equal((await prisma.organization.findUniqueOrThrow({ where: { id: other.id } })).currencyLockedAt, null);
        assert.equal(await prisma.unit.count({ where: { propertyId: property.id } }), 1);
      });

      await t.test("repeated saves preserve the original lock timestamp and current currency", async () => {
        const { organization, property } = await createProperty("locked", "TZS");
        const originalLock = new Date("2026-01-01T00:00:00Z");
        await prisma.organization.update({ where: { id: organization.id }, data: { currencyLockedAt: originalLock } });

        const code = await prisma.$transaction(async (tx) => {
          assert.equal(await lockOrganizationCurrency(tx, organization.id), "TZS");
          await tx.unit.create({ data: { propertyId: property.id, name: "1A", marketRateCents: 100_000 } });
          return lockOrganizationCurrency(tx, organization.id);
        });

        assert.equal(code, "TZS");
        const saved = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
        assert.equal(saved.currencyLockedAt?.getTime(), originalLock.getTime());
        assert.equal(saved.currencyCode, "TZS");
      });

      await t.test("a failed transaction rolls back both the monetary record and the lock", async () => {
        const { organization, property } = await createProperty("rollback");
        await assert.rejects(
          prisma.$transaction(async (tx) => {
            await lockOrganizationCurrency(tx, organization.id);
            await tx.unit.create({ data: { propertyId: property.id, name: "1A", marketRateCents: 10_000 } });
            throw new Error("Save failed");
          }),
          /Save failed/,
        );
        const saved = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
        assert.equal(saved.currencyLockedAt, null);
        assert.equal(await prisma.unit.count({ where: { propertyId: property.id } }), 0);
        assert.equal(await prisma.$transaction((tx) => lockOrganizationCurrency(tx, organization.id)), "USD");
        assert.ok((await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } })).currencyLockedAt);
      });

      await t.test("concurrent saves and a conditional currency change agree on one currency", async () => {
        const { organization, property } = await createProperty("concurrent");
        const results = await Promise.all([
          ...["1A", "1B", "1C"].map((name) =>
            prisma.$transaction(async (tx) => {
              const currencyCode = await lockOrganizationCurrency(tx, organization.id);
              await tx.unit.create({ data: { propertyId: property.id, name, marketRateCents: 10_000 } });
              return currencyCode;
            }),
          ),
          prisma.organization.updateMany({
            where: { id: organization.id, currencyLockedAt: null },
            data: { currencyCode: "TZS" },
          }),
        ]);
        const saved = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
        assert.ok(saved.currencyLockedAt instanceof Date);
        assert.deepEqual(results.slice(0, 3), [saved.currencyCode, saved.currencyCode, saved.currencyCode]);
        assert.equal(await prisma.unit.count({ where: { propertyId: property.id } }), 3);
        const changed = await prisma.organization.updateMany({
          where: { id: organization.id, currencyLockedAt: null },
          data: { currencyCode: saved.currencyCode === "USD" ? "TZS" : "USD" },
        });
        assert.equal(changed.count, 0);
      });

      await t.test("a missing organization fails before returning a currency", async () => {
        await assert.rejects(
          prisma.$transaction((tx) => lockOrganizationCurrency(tx, -1)),
          { code: "P2025" },
        );
      });
    } finally {
      try {
        await prisma.$disconnect();
      } finally {
        try {
          await isolated.cleanup();
        } finally {
          await admin.$disconnect();
        }
      }
    }
  },
);
