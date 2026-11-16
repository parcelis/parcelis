import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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

test("lease monetary writes bind currency atomically", { skip: !databaseUrl, timeout: 60_000 }, async (t) => {
  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "lease_currency_test").catch(async (error) => {
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

  // Fail real writes after currency locking to exercise transaction rollback.
  for (const table of ["Lease", "LeaseTenant"] as const) {
    const amount = table === "Lease" ? "securityDepositCents" : "depositShareCents";
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${isolated.schema}".reject_${table.toLowerCase()}_amount() RETURNS trigger AS $$
      BEGIN
        IF NEW."${amount}" = 12345 THEN RAISE EXCEPTION 'Currency test rejects amount'; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER reject_amount BEFORE INSERT OR UPDATE ON "${isolated.schema}"."${table}"
      FOR EACH ROW EXECUTE FUNCTION "${isolated.schema}".reject_${table.toLowerCase()}_amount()
    `);
  }
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "${isolated.schema}".reject_rent_invoice() RETURNS trigger AS $$
    BEGIN
      IF NEW."sourceKey" LIKE 'rent:2026-02:%' AND EXISTS (
        SELECT 1 FROM "${isolated.schema}"."Organization"
        WHERE id = NEW."organizationId" AND slug LIKE '%invoice-failure%'
      ) THEN RAISE EXCEPTION 'Currency test rejects invoice'; END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER reject_rent_invoice BEFORE INSERT ON "${isolated.schema}"."Invoice"
    FOR EACH ROW EXECUTE FUNCTION "${isolated.schema}".reject_rent_invoice()
  `);

  async function fixture(slug: string, role = "administrator") {
    const organization = await prisma.organization.create({ data: { name: slug, slug } });
    const property = await prisma.property.create({
      data: {
        organizationId: organization.id,
        name: slug,
        line1: "100 Main St",
        city: "Madison",
        region: "WI",
        postalCode: "53703",
        unitCount: 1,
      },
    });
    // Direct fixtures let lease tests exercise the first monetary save independently of unit locking.
    const unit = await prisma.unit.create({ data: { propertyId: property.id, name: "1A", marketRateCents: 100 } });
    const tenants = await Promise.all(
      ["Alex", "Sam"].map((firstName) =>
        prisma.tenant.create({
          data: { organizationId: organization.id, firstName, lastName: "Smith", email: `${firstName}@example.test` },
        }),
      ),
    );
    await prisma.invoiceCharge.create({ data: { organizationId: organization.id, name: "Rent", isDefault: true } });
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: 1, role } },
      organization: { organizationId: organization.id, organization, role },
    } as unknown as Context);
    const draftInput = { leaseDraftKey: randomUUID(), propertyId: property.id, unitId: unit.id };
    const draft = await prisma.lease.create({ data: { organizationId: organization.id, ...draftInput } });
    const save = (data: Parameters<typeof caller.leases.updateDraft>[0]["data"], expectedRevision = 0) =>
      caller.leases.updateDraft({ leaseId: draft.id, expectedRevision, data });
    const organizationState = () => prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    const leaseState = () => prisma.lease.findUniqueOrThrow({ where: { id: draft.id }, include: { tenants: true } });
    const completeInput = {
      propertyId: property.id,
      unitId: unit.id,
      tenantIds: tenants.map(({ id }) => id),
      monthlyRentCents: 10_000,
      securityDepositCents: 0,
      startsOn: new Date("2026-01-16T00:00:00Z"),
      endsOn: new Date("2026-03-31T00:00:00Z"),
      termType: "fixed" as const,
      status: "active" as const,
    };
    return {
      organization,
      property,
      unit,
      tenants,
      caller,
      draft,
      draftInput,
      save,
      organizationState,
      leaseState,
      completeInput,
    };
  }

  await t.test("empty, resumed, and metadata-only drafts stay unbound", async () => {
    const f = await fixture("lease-empty");
    assert.equal((await f.caller.leases.createDraft(f.draftInput)).id, f.draft.id);
    await f.save({
      tenantIds: [],
      monthlyRentCents: null,
      securityDepositCents: null,
      tenantAllocations: [],
    });
    await f.save({ tenantIds: f.tenants.map(({ id }) => id), draftStep: "terms" }, 1);
    await f.save({ tenantIds: f.tenants.map(({ id }) => id) }, 2);
    const saved = await f.leaseState();
    assert.equal(saved.currencyCode, null);
    assert.equal((await f.organizationState()).currencyLockedAt, null);
    assert.ok(
      saved.tenants.every(
        ({ rentShareCents, depositShareCents }) => rentShareCents === null && depositShareCents === null,
      ),
    );
    const fresh = await fixture("lease-new-empty");
    await fresh.caller.leases.delete({ id: fresh.draft.id });
    const created = await fresh.caller.leases.createDraft({ ...fresh.draftInput, leaseDraftKey: randomUUID() });
    assert.equal(created.currencyCode, null);
    assert.equal((await fresh.organizationState()).currencyLockedAt, null);
  });

  for (const [label, data] of [
    ["rent", { monthlyRentCents: 100 }],
    ["zero deposit", { securityDepositCents: 0 }],
  ] as const) {
    await t.test(`saving ${label} binds USD and locks the organization`, async () => {
      const f = await fixture(`lease-${label.replaceAll(" ", "-")}`);
      assert.equal((await f.save(data)).currencyCode, "USD");
      assert.ok((await f.organizationState()).currencyLockedAt);
    });
  }

  await t.test("zero allocations lock even before rent or deposit is entered", async () => {
    const f = await fixture("lease-zero-shares");
    await f.save({
      tenantIds: [f.tenants[0]!.id],
      billingResponsibility: "individual",
      tenantAllocations: [{ tenantId: f.tenants[0]!.id, rentShareCents: 0, depositShareCents: 0 }],
    });
    const saved = await f.leaseState();
    assert.equal(saved.currencyCode, "USD");
    assert.equal(saved.tenants[0]?.rentShareCents, 0);
    assert.equal(saved.tenants[0]?.depositShareCents, 0);
    assert.ok((await f.organizationState()).currencyLockedAt);
  });

  await t.test("allocations discarded by joint billing do not bind an empty draft", async () => {
    const f = await fixture("lease-joint-empty");
    await f.save({
      tenantIds: [f.tenants[0]!.id],
      billingResponsibility: "joint",
      tenantAllocations: [{ tenantId: f.tenants[0]!.id, rentShareCents: 0, depositShareCents: 0 }],
    });
    assert.equal((await f.leaseState()).currencyCode, null);
    assert.equal((await f.organizationState()).currencyLockedAt, null);
  });

  await t.test("clearing amounts, replacing allocations, and discarding drafts preserve the lock", async () => {
    const f = await fixture("lease-clear");
    await f.save({
      monthlyRentCents: 100,
      securityDepositCents: 0,
      tenantIds: [f.tenants[0]!.id],
      billingResponsibility: "individual",
      tenantAllocations: [{ tenantId: f.tenants[0]!.id, rentShareCents: 100, depositShareCents: 0 }],
    });
    const timestamp = new Date("2020-01-01T00:00:00Z");
    await prisma.organization.update({ where: { id: f.organization.id }, data: { currencyLockedAt: timestamp } });
    await f.save({ monthlyRentCents: null, securityDepositCents: null, tenantIds: [], tenantAllocations: [] }, 1);
    assert.equal((await f.leaseState()).currencyCode, "USD");
    assert.equal((await f.leaseState()).tenants.length, 0);
    const replacement = await f.caller.leases.createDraft({
      ...f.draftInput,
      leaseDraftKey: randomUUID(),
      replaceDraft: { id: f.draft.id, expectedRevision: 2 },
    });
    assert.equal(replacement.currencyCode, null);
    await f.caller.leases.archive({ id: replacement.id });
    await f.caller.leases.delete({ id: replacement.id });
    assert.equal((await f.organizationState()).currencyLockedAt?.getTime(), timestamp.getTime());
  });

  await t.test("an unbound draft reads the stored currency when amounts are first saved", async () => {
    const f = await fixture("lease-live-currency");
    await prisma.organization.update({ where: { id: f.organization.id }, data: { currencyCode: "TZS" } });
    assert.equal((await f.save({ securityDepositCents: 0 })).currencyCode, "TZS");
    assert.ok((await f.organizationState()).currencyLockedAt);
  });

  await t.test("a concurrent currency change and first save never commit mixed currencies", async () => {
    const f = await fixture("lease-currency-race");
    let notifyDraftRead!: () => void;
    let notifyCurrencyCommitted!: () => void;
    const draftRead = new Promise<void>((resolve) => {
      notifyDraftRead = resolve;
    });
    const currencyCommitted = new Promise<void>((resolve) => {
      notifyCurrencyCommitted = resolve;
    });
    const racePrisma = prisma.$extends({
      query: {
        lease: {
          async findFirst({ args, query }) {
            const lease = await query(args);
            if (args.where?.id === f.draft.id) {
              notifyDraftRead();
              await currencyCommitted;
            }
            return lease;
          },
        },
      },
    });
    const caller = appRouter.createCaller({
      prisma: racePrisma,
      session: { user: { id: 1, role: "administrator" } },
      organization: { organizationId: f.organization.id, organization: f.organization, role: "administrator" },
    } as unknown as Context);
    const { result } = await prisma
      .$transaction(async (tx) => {
        const change = await tx.organization.updateMany({
          where: { id: f.organization.id, currencyLockedAt: null },
          data: { currencyCode: "TZS" },
        });
        assert.equal(change.count, 1);
        const result = Promise.allSettled([
          caller.leases.updateDraft({
            leaseId: f.draft.id,
            expectedRevision: 0,
            data: { securityDepositCents: 0 },
          }),
        ]);
        // Establish the save's serializable snapshot before committing the currency change.
        await draftRead;
        return { result };
      })
      .finally(() => notifyCurrencyCommitted());
    const [save] = await result;
    assert.ok(save?.status === "rejected");
    assert.equal(save.reason.code, "CONFLICT");
    assert.equal((await f.leaseState()).currencyCode, null);
    assert.equal((await f.organizationState()).currencyLockedAt, null);
    assert.equal((await f.save({ securityDepositCents: 0 })).currencyCode, "TZS");
    assert.equal((await f.organizationState()).currencyCode, "TZS");
    assert.ok((await f.organizationState()).currencyLockedAt);
  });

  await t.test("failed draft amount writes roll back binding and lock", async () => {
    const f = await fixture("lease-draft-failure");
    await assert.rejects(
      f.save({ monthlyRentCents: 100, securityDepositCents: 12_345 }),
      /Currency test rejects amount/,
    );
    assert.equal((await f.leaseState()).currencyCode, null);
    assert.equal((await f.leaseState()).monthlyRentCents, null);
    assert.equal((await f.leaseState()).revision, 0);
    assert.equal((await f.organizationState()).currencyLockedAt, null);
  });

  await t.test("failed allocation replacement restores rows, amounts, revision, and lock", async () => {
    const f = await fixture("lease-allocation-failure");
    await prisma.leaseTenant.create({
      data: { organizationId: f.organization.id, leaseId: f.draft.id, tenantId: f.tenants[0]!.id },
    });
    await assert.rejects(
      f.save({
        monthlyRentCents: 100,
        billingResponsibility: "individual",
        tenantAllocations: [{ tenantId: f.tenants[0]!.id, rentShareCents: 100, depositShareCents: 12_345 }],
      }),
      /Currency test rejects amount/,
    );
    const saved = await f.leaseState();
    assert.equal(saved.currencyCode, null);
    assert.equal(saved.monthlyRentCents, null);
    assert.equal(saved.revision, 0);
    assert.equal(saved.tenants.length, 1);
    assert.equal(saved.tenants[0]?.depositShareCents, null);
    assert.equal((await f.organizationState()).currencyLockedAt, null);
  });

  for (const route of ["tenants", "leases"] as const) {
    for (const status of ["draft", "active"] as const) {
      await t.test(
        `${route} complete-input ${status} creation binds currency and generates matching invoices`,
        async () => {
          const f = await fixture(`lease-${route}-${status}`);
          const input = {
            ...f.completeInput,
            status,
            billingResponsibility: "individual" as const,
            tenantAllocations: f.tenants.map(({ id }) => ({
              tenantId: id,
              rentShareCents: 5_000,
              depositShareCents: 0,
            })),
          };
          const created =
            route === "tenants" ? await f.caller.tenants.createLease(input) : await f.caller.leases.create(input);
          assert.equal(created.currencyCode, "USD");
          assert.ok((await f.organizationState()).currencyLockedAt);
          const invoices = await prisma.invoice.findMany({ where: { leaseId: created.id }, include: { items: true } });
          assert.equal(invoices.length, status === "draft" ? 0 : 6);
          assert.ok(
            invoices.every(
              ({ currencyCode, amountCents, items }) =>
                currencyCode === "USD" && amountCents === items.reduce((sum, item) => sum + item.amountCents, 0),
            ),
          );
        },
      );
    }
    await t.test(`${route} invoice failure rolls back lease creation, allocations, and lock`, async () => {
      const f = await fixture(`lease-${route}-invoice-failure`);
      await assert.rejects(
        route === "tenants" ? f.caller.tenants.createLease(f.completeInput) : f.caller.leases.create(f.completeInput),
        /Currency test rejects invoice/,
      );
      assert.equal(await prisma.lease.count({ where: { organizationId: f.organization.id } }), 1);
      assert.equal(await prisma.invoice.count({ where: { organizationId: f.organization.id } }), 0);
      assert.equal(await prisma.leaseTenant.count({ where: { organizationId: f.organization.id } }), 0);
      assert.equal((await f.organizationState()).currencyLockedAt, null);
      assert.equal((await prisma.property.findUniqueOrThrow({ where: { id: f.property.id } })).occupiedUnits, 0);
    });
  }

  async function readyDraft(
    f: Awaited<ReturnType<typeof fixture>>,
    startsOn = f.completeInput.startsOn,
    endsOn = f.completeInput.endsOn,
  ) {
    return f.save({
      monthlyRentCents: 10_000,
      securityDepositCents: 0,
      startsOn,
      endsOn,
      termType: "fixed",
      tenantIds: f.tenants.map(({ id }) => id),
      billingResponsibility: "joint",
    });
  }

  await t.test("finalization copies stored currency into prorated invoices and retries once", async () => {
    const f = await fixture("lease-finalize");
    await prisma.organization.update({ where: { id: f.organization.id }, data: { currencyCode: "TZS" } });
    await readyDraft(f);
    const lock = (await f.organizationState()).currencyLockedAt;
    const input = { leaseId: f.draft.id, expectedRevision: 1 };
    const first = await f.caller.leases.finalizeDraft(input);
    const retry = await f.caller.leases.finalizeDraft(input);
    assert.equal(first.currencyCode, "TZS");
    assert.deepEqual(retry.invoiceSummary, first.invoiceSummary);
    const invoices = await prisma.invoice.findMany({
      where: { leaseId: f.draft.id },
      orderBy: { periodStartsOn: "asc" },
    });
    assert.equal(invoices.length, 3);
    assert.ok(invoices.every(({ currencyCode }) => currencyCode === "TZS"));
    assert.equal(invoices[0]?.amountCents, Math.round((10_000 * 16) / 31));
    assert.equal((await f.organizationState()).currencyLockedAt?.getTime(), lock?.getTime());
  });

  await t.test("scheduled finalization retains currency and creates only one schedule", async () => {
    const f = await fixture("lease-scheduled");
    const year = new Date().getUTCFullYear() + 1;
    await readyDraft(f, new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year, 1, 28)));
    const input = { leaseId: f.draft.id, expectedRevision: 1 };
    const [first, second] = await Promise.all([
      f.caller.leases.finalizeDraft(input),
      f.caller.leases.finalizeDraft(input),
    ]);
    assert.equal(first.status, "scheduled");
    assert.equal(second.currencyCode, "USD");
    assert.deepEqual(first.invoiceSummary, second.invoiceSummary);
    assert.equal(await prisma.invoice.count({ where: { leaseId: f.draft.id, currencyCode: "USD" } }), 2);
  });

  await t.test("failed finalization rolls back invoices, status, and a newly established lock", async () => {
    const f = await fixture("lease-finalize-invoice-failure");
    await readyDraft(f);
    await prisma.organization.update({ where: { id: f.organization.id }, data: { currencyLockedAt: null } });
    await assert.rejects(
      f.caller.leases.finalizeDraft({ leaseId: f.draft.id, expectedRevision: 1 }),
      /Currency test rejects invoice/,
    );
    assert.equal((await f.organizationState()).currencyLockedAt, null);
    assert.equal((await f.leaseState()).status, "draft");
    assert.equal((await f.leaseState()).revision, 1);
    assert.equal(await prisma.invoice.count({ where: { leaseId: f.draft.id } }), 0);
    assert.equal(await prisma.activityEvent.count({ where: { organizationId: f.organization.id } }), 0);
  });

  await t.test("bound currency mismatches and unbound finalization are rejected", async () => {
    const f = await fixture("lease-mismatch");
    await readyDraft(f);
    await prisma.organization.update({
      where: { id: f.organization.id },
      data: { currencyCode: "TZS", currencyLockedAt: null },
    });
    await assert.rejects(f.save({ monthlyRentCents: 200 }, 1), { code: "CONFLICT" });
    await assert.rejects(f.caller.leases.finalizeDraft({ leaseId: f.draft.id, expectedRevision: 1 }), {
      code: "CONFLICT",
    });
    assert.equal((await f.leaseState()).monthlyRentCents, 10_000);
    assert.equal((await f.organizationState()).currencyLockedAt, null);
    await prisma.lease.update({ where: { id: f.draft.id }, data: { currencyCode: null } });
    await assert.rejects(f.caller.leases.finalizeDraft({ leaseId: f.draft.id, expectedRevision: 1 }), {
      code: "CONFLICT",
      message: /Save lease amounts/,
    });
    assert.equal((await f.organizationState()).currencyLockedAt, null);
  });

  await t.test("foreign records, stale revisions, and denied permissions cannot lock currency", async () => {
    const own = await fixture("lease-own");
    const foreign = await fixture("lease-foreign");
    await assert.rejects(own.save({ securityDepositCents: 0 }, 10), { code: "CONFLICT" });
    await assert.rejects(
      own.save({ securityDepositCents: 0, propertyId: foreign.property.id, unitId: foreign.unit.id }),
      (error: unknown) =>
        error instanceof TRPCError &&
        error.cause instanceof Prisma.PrismaClientKnownRequestError &&
        error.cause.code === "P2025",
    );
    await assert.rejects(own.save({ securityDepositCents: 0, tenantIds: [foreign.tenants[0]!.id] }), {
      code: "NOT_FOUND",
      message: "One or more residents not found.",
    });
    await assert.rejects(
      own.caller.leases.updateDraft({
        leaseId: foreign.draft.id,
        expectedRevision: 0,
        data: { securityDepositCents: 0 },
      }),
      { code: "NOT_FOUND" },
    );
    const denied = await fixture("lease-denied", "property_manager");
    await assert.rejects(denied.save({ securityDepositCents: 0 }), { code: "FORBIDDEN" });
    assert.equal((await own.organizationState()).currencyLockedAt, null);
    assert.equal((await foreign.organizationState()).currencyLockedAt, null);
    assert.equal((await denied.organizationState()).currencyLockedAt, null);
  });
});
