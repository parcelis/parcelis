import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";
import { Prisma, PrismaClient, PrismaPg } from "@parcelis/db";
import {
  createIsolatedTestSchema,
  validateOutboxTestDatabaseUrl,
} from "../../../../../scripts/outbox-test-database.mjs";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

const databaseUrl = process.env.API_TOKEN_TEST_DATABASE_URL;
if (databaseUrl) validateOutboxTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);

test("invoice and payment writes preserve currency atomically", { skip: !databaseUrl, timeout: 60_000 }, async (t) => {
  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "invoice_currency_test").catch(async (error) => {
    await admin.$disconnect();
    throw error;
  });
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
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "${isolated.schema}".reject_currency_payment() RETURNS trigger AS $$
    BEGIN
      IF NEW."amountCents" = 12345 THEN RAISE EXCEPTION 'Currency test rejects payment'; END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_currency_payment BEFORE INSERT ON "${isolated.schema}"."InvoicePayment"
    FOR EACH ROW EXECUTE FUNCTION "${isolated.schema}".reject_currency_payment()`);
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "${isolated.schema}".reject_currency_note() RETURNS trigger AS $$
    BEGIN
      IF NEW.body LIKE '%reject reversal%' THEN RAISE EXCEPTION 'Currency test rejects reversal'; END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_currency_note BEFORE INSERT ON "${isolated.schema}"."Note"
    FOR EACH ROW EXECUTE FUNCTION "${isolated.schema}".reject_currency_note()`);

  async function fixture(slug: string, currencyCode = "USD") {
    const organization = await prisma.organization.create({ data: { name: slug, slug, currencyCode } });
    const property = await prisma.property.create({
      data: {
        organizationId: organization.id,
        name: slug,
        line1: "1 Main St",
        city: "Madison",
        region: "WI",
        postalCode: "53703",
        unitCount: 1,
      },
    });
    const unit = await prisma.unit.create({ data: { propertyId: property.id, name: "1A", marketRateCents: 100 } });
    const tenant = await prisma.tenant.create({
      data: { organizationId: organization.id, firstName: "Alex", lastName: "Smith", email: "alex@example.test" },
    });
    const lease = await prisma.lease.create({
      data: {
        organizationId: organization.id,
        propertyId: property.id,
        unitId: unit.id,
        status: "active",
        currencyCode,
      },
    });
    await prisma.leaseTenant.create({
      data: { organizationId: organization.id, leaseId: lease.id, tenantId: tenant.id },
    });
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: 1, name: "Administrator", role: "administrator" } },
      organization: { organizationId: organization.id, organization },
    } as unknown as Context);
    const input = {
      propertyId: property.id,
      leaseId: lease.id,
      dueOn: new Date("2030-01-01"),
      paidCents: 0,
      items: [{ item: "Rent", quantity: 1, rateCents: 20_000 }],
    };
    const payment = {
      paidByTenantId: tenant.id,
      paidOn: new Date("2030-01-02"),
      paymentMethod: "cash" as const,
      amountCents: 1_000,
    };
    const state = () => prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    const unlock = () =>
      prisma.organization.update({ where: { id: organization.id }, data: { currencyLockedAt: null } });
    return { organization, property, tenant, lease, caller, input, payment, state, unlock };
  }

  await t.test("manual invoices inherit stored lease currency with initial payments", async () => {
    const f = await fixture("invoice-stored", "TZS");
    const invoice = await f.caller.invoices.createManual({ ...f.input, paidCents: 500 });
    assert.equal(invoice.currencyCode, "TZS");
    assert.equal(invoice.balanceCents, 19_500);
    assert.equal(await prisma.invoicePayment.count({ where: { invoiceId: invoice.id, amountCents: 500 } }), 1);
    assert.ok((await f.state()).currencyLockedAt);
  });

  await t.test("edits, single and batch payments, and reversals preserve currency and the lock", async () => {
    const f = await fixture("invoice-writers");
    const invoice = await f.caller.invoices.createManual(f.input);
    for (const operation of ["update", "single", "batch", "reverse"] as const) {
      await f.unlock();
      if (operation === "update")
        await f.caller.invoices.update({ id: invoice.id, dueOn: f.input.dueOn, items: f.input.items });
      if (operation === "single") await f.caller.invoices.recordPayment({ id: invoice.id, ...f.payment });
      if (operation === "batch")
        await f.caller.invoices.recordPayments({ id: invoice.id, payments: [f.payment, f.payment] });
      if (operation === "reverse") {
        const payment = await prisma.invoicePayment.findFirstOrThrow({ where: { invoiceId: invoice.id } });
        await f.caller.invoices.reversePayment({ id: payment.id, reason: "Correction" });
        await f.caller.invoices.reversePayment({ id: payment.id, reason: "Correction" });
      }
      assert.ok((await f.state()).currencyLockedAt);
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).currencyCode, "USD");
    }
    const lock = (await f.state()).currencyLockedAt;
    await f.caller.invoices.update({ id: invoice.id, dueOn: f.input.dueOn, items: f.input.items });
    assert.equal((await f.state()).currencyLockedAt?.getTime(), lock?.getTime());
    assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).balanceCents, 18_000);
  });

  await t.test("failed initial and batch payments roll back invoices, payments, balances, and locks", async () => {
    const f = await fixture("invoice-payment-failure");
    await assert.rejects(
      f.caller.invoices.createManual({ ...f.input, paidCents: 12_345 }),
      /Currency test rejects payment/,
    );
    assert.equal(await prisma.invoice.count({ where: { organizationId: f.organization.id } }), 0);
    assert.equal((await f.state()).currencyLockedAt, null);
    const invoice = await f.caller.invoices.createManual(f.input);
    await f.unlock();
    await assert.rejects(
      f.caller.invoices.recordPayment({ id: invoice.id, ...f.payment, amountCents: 12_345 }),
      /Currency test rejects payment/,
    );
    await assert.rejects(
      f.caller.invoices.recordPayments({
        id: invoice.id,
        payments: [f.payment, { ...f.payment, amountCents: 12_345 }],
      }),
      /Currency test rejects payment/,
    );
    assert.equal(await prisma.invoicePayment.count({ where: { invoiceId: invoice.id } }), 0);
    assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).balanceCents, 20_000);
    assert.equal((await f.state()).currencyLockedAt, null);
  });

  await t.test("failed reversal restores payment history, balance, and the new lock", async () => {
    const f = await fixture("invoice-reversal-failure");
    const invoice = await f.caller.invoices.createManual(f.input);
    const payment = await f.caller.invoices.recordPayment({ id: invoice.id, ...f.payment });
    await f.unlock();
    await assert.rejects(
      f.caller.invoices.reversePayment({ id: payment.id, reason: "reject reversal" }),
      /Currency test rejects reversal/,
    );
    assert.equal((await prisma.invoicePayment.findUniqueOrThrow({ where: { id: payment.id } })).reversedAt, null);
    assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).balanceCents, 19_000);
    assert.equal((await f.state()).currencyLockedAt, null);
  });

  await t.test("mismatched invoice, lease, and organization currencies reject every writer", async () => {
    const f = await fixture("invoice-mismatch");
    const invoice = await f.caller.invoices.createManual(f.input);
    const payment = await f.caller.invoices.recordPayment({ id: invoice.id, ...f.payment });
    await f.unlock();
    await prisma.invoice.update({ where: { id: invoice.id }, data: { currencyCode: "TZS" } });
    await assert.rejects(f.caller.invoices.update({ id: invoice.id, dueOn: f.input.dueOn, items: f.input.items }), {
      code: "CONFLICT",
    });
    await assert.rejects(f.caller.invoices.recordPayment({ id: invoice.id, ...f.payment }), { code: "CONFLICT" });
    await assert.rejects(f.caller.invoices.recordPayments({ id: invoice.id, payments: [f.payment] }), {
      code: "CONFLICT",
    });
    await assert.rejects(f.caller.invoices.reversePayment({ id: payment.id, reason: "Correction" }), {
      code: "CONFLICT",
    });
    await prisma.organization.update({ where: { id: f.organization.id }, data: { currencyCode: "TZS" } });
    await assert.rejects(f.caller.invoices.createManual({ ...f.input, dueOn: new Date("2030-02-01") }), {
      code: "CONFLICT",
    });
    assert.equal((await f.state()).currencyLockedAt, null);
  });

  await t.test("foreign organizations cannot lock or modify invoice currency", async () => {
    const own = await fixture("invoice-own");
    const foreign = await fixture("invoice-foreign");
    const invoice = await foreign.caller.invoices.createManual(foreign.input);
    await foreign.unlock();
    await assert.rejects(own.caller.invoices.createManual(foreign.input), { code: "BAD_REQUEST" });
    await assert.rejects(
      own.caller.invoices.recordPayment({ id: invoice.id, ...foreign.payment }),
      (error: unknown) =>
        error instanceof TRPCError &&
        error.cause instanceof Prisma.PrismaClientKnownRequestError &&
        error.cause.code === "P2025",
    );
    assert.equal(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).balanceCents,
      invoice.balanceCents,
    );
    assert.equal(await prisma.invoicePayment.count({ where: { invoiceId: invoice.id } }), 0);
    assert.equal((await own.state()).currencyLockedAt, null);
    assert.equal((await foreign.state()).currencyLockedAt, null);
  });
});
