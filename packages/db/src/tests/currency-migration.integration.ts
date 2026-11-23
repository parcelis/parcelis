import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { createIsolatedTestSchema, validateOutboxTestDatabaseUrl } from "../../../../scripts/outbox-test-database.mjs";

const databaseUrl = process.env.OUTBOX_TEST_DATABASE_URL;
if (databaseUrl) validateOutboxTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);

function monetarySnapshot(prisma: PrismaClient) {
  return prisma.$transaction([
    prisma.unit.findMany({ select: { id: true, marketRateCents: true }, orderBy: { id: "asc" } }),
    prisma.application.findMany({ select: { id: true, annualIncomeCents: true }, orderBy: { id: "asc" } }),
    prisma.lease.findMany({
      select: { id: true, monthlyRentCents: true, securityDepositCents: true },
      orderBy: { id: "asc" },
    }),
    prisma.leaseTenant.findMany({
      select: { leaseId: true, tenantId: true, rentShareCents: true, depositShareCents: true },
      orderBy: [{ leaseId: "asc" }, { tenantId: "asc" }],
    }),
    prisma.invoice.findMany({ select: { id: true, amountCents: true, balanceCents: true }, orderBy: { id: "asc" } }),
    prisma.invoiceItem.findMany({ select: { id: true, rateCents: true, amountCents: true }, orderBy: { id: "asc" } }),
    prisma.invoicePayment.findMany({ select: { id: true, amountCents: true }, orderBy: { id: "asc" } }),
  ]);
}

test(
  "currency migration preserves amounts and distinguishes legacy records from new defaults",
  { skip: !databaseUrl, timeout: 60_000 },
  async () => {
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "currency_migration_test").catch(
      async (error) => {
        await admin.$disconnect();
        throw error;
      },
    );
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
    });
    const connection = new Client({ connectionString: databaseUrl!, options: `-c search_path=${isolated.schema}` });

    try {
      await connection.connect();
      const organization = await prisma.organization.create({ data: { name: "Legacy", slug: "legacy" } });
      const emptyOrganization = await prisma.organization.create({
        data: { name: "Legacy empty", slug: "legacy-empty" },
      });
      const property = await prisma.property.create({
        data: {
          organizationId: organization.id,
          name: "Migration property",
          line1: "1 Test Street",
          city: "Test",
          region: "IL",
          postalCode: "60000",
          unitCount: 1,
        },
      });
      const unit = await prisma.unit.create({ data: { propertyId: property.id, name: "1A", marketRateCents: 0 } });
      const tenant = await prisma.tenant.create({
        data: {
          organizationId: organization.id,
          firstName: "Test",
          lastName: "Tenant",
          email: "tenant@example.test",
        },
      });
      const applicant = await prisma.applicant.create({
        data: {
          organizationId: organization.id,
          firstName: "Test",
          lastName: "Applicant",
          email: "applicant@example.test",
        },
      });
      const applicationStatus = await prisma.applicationStatus.create({
        data: { organizationId: organization.id, label: "New" },
      });
      await prisma.application.create({
        data: {
          organizationId: organization.id,
          propertyId: property.id,
          applicantId: applicant.id,
          statusId: applicationStatus.id,
          annualIncomeCents: 7_200_000,
        },
      });
      const leaseData = { organizationId: organization.id, propertyId: property.id, unitId: unit.id };
      const emptyDraft = await prisma.lease.create({ data: leaseData });
      const zeroDepositDraft = await prisma.lease.create({ data: { ...leaseData, securityDepositCents: 0 } });
      const rentDraft = await prisma.lease.create({ data: { ...leaseData, monthlyRentCents: 120_000 } });
      const depositDraft = await prisma.lease.create({ data: { ...leaseData, securityDepositCents: 50_000 } });
      const allocationDraft = await prisma.lease.create({ data: leaseData });
      await prisma.leaseTenant.create({
        data: {
          organizationId: organization.id,
          leaseId: allocationDraft.id,
          tenantId: tenant.id,
          rentShareCents: 0,
          depositShareCents: 0,
        },
      });
      const completed = await prisma.lease.create({ data: { ...leaseData, status: "ended", archivedAt: new Date() } });
      const invoiceDraft = await prisma.lease.create({ data: leaseData });
      await prisma.leaseTenant.create({
        data: {
          organizationId: organization.id,
          leaseId: invoiceDraft.id,
          tenantId: tenant.id,
        },
      });
      const invoice = await prisma.invoice.create({
        data: {
          organizationId: organization.id,
          leaseId: invoiceDraft.id,
          propertyId: property.id,
          tenantId: tenant.id,
          periodStartsOn: new Date("2026-01-01"),
          periodEndsOn: new Date("2026-01-31"),
          dueOn: new Date("2026-01-01"),
          amountCents: 12_000,
          balanceCents: 7_000,
          items: { create: { item: "Rent", quantity: 2, rateCents: 6_000, amountCents: 12_000 } },
          recipients: { create: { tenantId: tenant.id } },
        },
      });
      await prisma.invoicePayment.create({
        data: {
          organizationId: organization.id,
          invoiceId: invoice.id,
          tenantId: tenant.id,
          amountCents: 5_000,
          paymentMethod: "cash",
          paidOn: new Date("2026-01-01"),
        },
      });
      const before = await monetarySnapshot(prisma);

      await connection.query(`
      ALTER TABLE "Organization" DROP COLUMN "currencyCode", DROP COLUMN "currencyLockedAt";
      ALTER TABLE "Lease" DROP COLUMN "currencyCode";
      ALTER TABLE "Invoice" DROP COLUMN "currencyCode";
    `);
      const migration = await readFile(
        new URL("../../prisma/migrations/20261112000000_add_currency_models/migration.sql", import.meta.url),
        "utf8",
      );
      await connection.query(migration);

      assert.deepEqual(await monetarySnapshot(prisma), before);
      const organizations = await prisma.organization.findMany({
        where: { id: { in: [organization.id, emptyOrganization.id] } },
      });
      assert.equal(organizations.length, 2);
      for (const legacy of organizations) {
        assert.equal(legacy.currencyCode, "USD");
        assert.ok(legacy.currencyLockedAt instanceof Date);
      }
      for (const id of [rentDraft.id, depositDraft.id, allocationDraft.id, completed.id, invoiceDraft.id]) {
        assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id } })).currencyCode, "USD");
      }
      for (const id of [emptyDraft.id, zeroDepositDraft.id]) {
        assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id } })).currencyCode, null);
      }
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).currencyCode, "USD");

      const fresh = await prisma.organization.create({ data: { name: "Fresh", slug: "fresh" } });
      assert.equal(fresh.currencyCode, "USD");
      assert.equal(fresh.currencyLockedAt, null);
      const freshDraft = await prisma.lease.create({ data: { organizationId: fresh.id } });
      assert.equal(freshDraft.currencyCode, null);
      const freshInvoice = await prisma.invoice.create({
        data: {
          organizationId: organization.id,
          leaseId: invoiceDraft.id,
          propertyId: property.id,
          tenantId: tenant.id,
          periodStartsOn: new Date("2026-02-01"),
          periodEndsOn: new Date("2026-02-28"),
          dueOn: new Date("2026-02-01"),
          amountCents: 400,
          balanceCents: 400,
        },
      });
      assert.equal(freshInvoice.currencyCode, "USD");
    } finally {
      await connection.end();
      await prisma.$disconnect();
      try {
        await isolated.cleanup();
      } finally {
        await admin.$disconnect();
      }
    }
  },
);
