import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import { currencyMetadata } from "@parcelis/schemas";
import {
  createIsolatedTestSchema,
  validateOutboxTestDatabaseUrl,
} from "../../../../../scripts/outbox-test-database.mjs";
import { createApiToken, getApiTokenDisplayPrefix, hashApiToken } from "../../modules/api-tokens";
import { handleRestRequest } from "../../router/rest-handler";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

const databaseUrl = process.env.API_TOKEN_TEST_DATABASE_URL;
if (databaseUrl) validateOutboxTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);

test(
  "currency settings and demo seeds preserve the organization boundary",
  { skip: !databaseUrl, timeout: 180_000 },
  async (t) => {
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "currency_settings_test").catch(
      async (error) => {
        await admin.$disconnect();
        throw error;
      },
    );
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
    });
    t.after(async () => {
      try {
        await prisma.$disconnect();
      } finally {
        try {
          await isolated.cleanup();
        } finally {
          await admin.$disconnect();
        }
      }
    });

    async function fixture(slug: string, role = "owner", currencyCode = "USD") {
      const organization = await prisma.organization.create({ data: { name: slug, slug, currencyCode } });
      const caller = appRouter.createCaller({
        prisma,
        session: { userId: 1, user: { id: 1, name: "Administrator", role: "administrator" } },
        organization: { organizationId: organization.id, organization, role },
      } as unknown as Context);
      const input = { name: organization.name, slug, address: null, phone: null };
      const state = () => prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
      return { organization, caller, input, state };
    }

    await t.test("USD defaults, supported metadata, and change restrictions are typed and scoped", async () => {
      const f = await fixture("currency-defaults");
      const settings = await f.caller.organizations.currency();
      assert.equal(settings.currencyCode, "USD");
      assert.equal(settings.currencyLockedAt, null);
      assert.equal(settings.canChangeCurrency, true);
      assert.equal(settings.restrictionReason, null);
      assert.deepEqual(settings.supportedCurrencies, [currencyMetadata.USD]);
      const member = await fixture("currency-member", "member");
      assert.equal((await member.caller.organizations.currency()).restrictionReason, "insufficient_permissions");
      await assert.rejects(member.caller.organizations.update({ ...member.input, currencyCode: "USD" }), {
        code: "FORBIDDEN",
      });
      await assert.rejects(f.caller.organizations.update({ ...f.input, currencyCode: "EUR" as "USD" }), {
        code: "BAD_REQUEST",
      });
      await prisma.organization.update({ where: { id: f.organization.id }, data: { currencyLockedAt: new Date() } });
      assert.equal((await f.caller.organizations.currency()).restrictionReason, "monetary_data_saved");
    });

    await t.test("omitted currency is preserved and only an unlocked organization can change it", async () => {
      const f = await fixture("currency-preserve", "administrator", "TZS");
      await f.caller.organizations.update(f.input);
      assert.equal((await f.state()).currencyCode, "TZS");
      await prisma.organization.update({ where: { id: f.organization.id }, data: { currencyLockedAt: new Date() } });
      await assert.rejects(f.caller.organizations.update({ ...f.input, name: "Must roll back", currencyCode: "USD" }), {
        code: "CONFLICT",
      });
      assert.equal((await f.state()).name, f.organization.name);
      assert.equal((await f.state()).currencyCode, "TZS");
      await prisma.organization.update({ where: { id: f.organization.id }, data: { currencyLockedAt: null } });
      await f.caller.organizations.update({ ...f.input, currencyCode: "USD" });
      assert.equal((await f.state()).currencyCode, "USD");
      const timestamp = new Date("2020-01-01T00:00:00Z");
      await prisma.organization.update({ where: { id: f.organization.id }, data: { currencyLockedAt: timestamp } });
      await f.caller.organizations.update({ ...f.input, currencyCode: "USD", name: "Edited" });
      assert.equal((await f.state()).currencyLockedAt?.getTime(), timestamp.getTime());
    });

    await t.test("a settings change racing a first unit save cannot relabel the saved money", async () => {
      const f = await fixture("currency-settings-race", "owner", "TZS");
      const property = await prisma.property.create({
        data: {
          organizationId: f.organization.id,
          name: "Race",
          line1: "1 Main St",
          city: "Madison",
          region: "WI",
          postalCode: "53703",
          unitCount: 0,
        },
      });
      const [setting, unit] = await Promise.allSettled([
        f.caller.organizations.update({ ...f.input, currencyCode: "USD" }),
        f.caller.units.create({ propertyId: property.id, name: "1A", unitType: "Residential", marketRateCents: 0 }),
      ]);
      assert.equal(unit.status, "fulfilled");
      if (setting.status === "rejected") assert.equal(setting.reason.code, "CONFLICT");
      const saved = await f.state();
      assert.ok(saved.currencyLockedAt);
      if (unit.status === "fulfilled") assert.equal(unit.value.currencyCode, saved.currencyCode);
      assert.equal(saved.currencyCode, setting.status === "fulfilled" ? "USD" : "TZS");
    });

    await t.test("REST tokens read only their organization's currency without gaining settings access", async () => {
      const f = await fixture("currency-rest");
      const token = createApiToken();
      await prisma.apiToken.create({
        data: {
          organizationId: f.organization.id,
          name: "Currency",
          createdByLabel: "Test",
          tokenHash: hashApiToken(token),
          tokenPrefix: getApiTokenDisplayPrefix(token),
        },
      });
      const response = await handleRestRequest(
        prisma,
        new Request("http://localhost/api/v1/organization/currency", { headers: { authorization: `Bearer ${token}` } }),
      );
      assert.equal(response.status, 200);
      const { data } = await response.json();
      assert.equal(data.currencyCode, "USD");
      assert.equal(data.canChangeCurrency, false);
      assert.equal(data.restrictionReason, "insufficient_permissions");
      assert.equal(
        (await handleRestRequest(prisma, new Request("http://localhost/api/v1/organization/currency"))).status,
        401,
      );
    });

    await t.test("seed and reseed bind USD, preserve the permanent timestamp, and reject relabeling", async () => {
      const url = new URL(databaseUrl!);
      url.searchParams.set("schema", isolated.schema);
      const seed = () =>
        promisify(execFile)(process.execPath, ["prisma/seed.mjs"], {
          cwd: new URL("../../../../../packages/db/", import.meta.url),
          env: {
            ...process.env,
            DATABASE_URL: url.href,
            SEED_ADMIN_PASSWORD: randomUUID(),
            SEED_ADMIN_EMAIL: "currency-seed@example.test",
          },
          timeout: 90_000,
        });
      await seed();
      const demo = await prisma.organization.findUniqueOrThrow({ where: { seedKey: "parcelis-demo" } });
      assert.equal(demo.currencyCode, "USD");
      assert.ok(demo.currencyLockedAt);
      async function amounts() {
        const [units, applications, leases, allocations, invoices, items, payments] = await Promise.all([
          prisma.unit.findMany({ where: { property: { organizationId: demo.id } }, select: { marketRateCents: true } }),
          prisma.application.findMany({ where: { organizationId: demo.id }, select: { annualIncomeCents: true } }),
          prisma.lease.findMany({
            where: { organizationId: demo.id },
            select: { monthlyRentCents: true, securityDepositCents: true, currencyCode: true },
          }),
          prisma.leaseTenant.findMany({
            where: { organizationId: demo.id },
            select: { rentShareCents: true, depositShareCents: true },
          }),
          prisma.invoice.findMany({
            where: { organizationId: demo.id },
            select: { amountCents: true, balanceCents: true, currencyCode: true },
          }),
          prisma.invoiceItem.findMany({
            where: { invoice: { organizationId: demo.id } },
            select: { rateCents: true, amountCents: true },
          }),
          prisma.invoicePayment.findMany({ where: { organizationId: demo.id }, select: { amountCents: true } }),
        ]);
        assert.ok(units.length && applications.length && leases.length && invoices.length && payments.length);
        assert.ok([...leases, ...invoices].every(({ currencyCode }) => currencyCode === "USD"));
        return [units, applications, leases, allocations, invoices, items, payments].map((records) =>
          records.map((record) => JSON.stringify(record)).sort(),
        );
      }
      const before = await amounts();
      await seed();
      assert.deepEqual(await amounts(), before);
      assert.equal(
        (await prisma.organization.findUniqueOrThrow({ where: { id: demo.id } })).currencyLockedAt?.getTime(),
        demo.currencyLockedAt?.getTime(),
      );
      await prisma.organization.update({
        where: { id: demo.id },
        data: { currencyCode: "TZS", currencyLockedAt: null },
      });
      await assert.rejects(seed(), /USD demo data cannot be seeded/);
      assert.equal((await prisma.organization.findUniqueOrThrow({ where: { id: demo.id } })).currencyLockedAt, null);
      assert.deepEqual(await amounts(), before);
    });
  },
);
