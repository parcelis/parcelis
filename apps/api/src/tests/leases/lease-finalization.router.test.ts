import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@parcelis/db";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

function createCaller(prisma: unknown) {
  return appRouter.createCaller({
    prisma,
    session: { user: { id: 1, role: "administrator" } },
    organization: { organizationId: 7 },
  } as unknown as Context);
}

function calendarDay(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
}

function draft(startsOn: Date) {
  return {
    id: 9,
    organizationId: 7,
    status: "draft",
    revision: 4,
    archivedAt: null,
    propertyId: 2,
    unitId: 3,
    termType: "fixed",
    startsOn,
    endsOn: new Date(startsOn.getTime() + 30 * 86400000),
    monthlyRentCents: 10000,
    securityDepositCents: 1000,
    rentDueDay: 1,
    continueMonthToMonthAfterEnd: false,
    billingResponsibility: "joint",
    allowPartialPayments: true,
    tenants: [{ tenantId: 11, rentShareCents: null, depositShareCents: null }],
  };
}

type ExistingLease = { startsOn: Date; endsOn: Date | null; status: string };

function createDatabase(
  start: Date,
  overlap = false,
  overrides: Record<string, unknown> = {},
  existingLease?: ExistingLease,
  predecessorOccupiedUnits = 1,
  timeZone = "UTC",
  invoiceFailureAt?: number,
  simulateConcurrentFinalization = false,
) {
  const lease = { ...draft(start), ...overrides };
  let created = false;
  let currentStatus = lease.status;
  let previousStatus = existingLease?.status;
  let occupiedIncrements = 0;
  let occupiedUnits = existingLease ? predecessorOccupiedUnits : 0;
  let outboxWrites = 0;
  let activationAt: Date | undefined;
  let eventPayload: { organizationId: number; leaseId: number; activateAt: string } | undefined;
  let invoiceWrites = 0;
  const invoiceRows: Record<string, unknown>[] = [];
  const recipientRows: Array<{ organizationId: number; invoiceId: number; tenantId: number }> = [];
  const itemRows: Record<string, unknown>[] = [];
  const activityRows: Record<string, unknown>[] = [];
  const tx = {
    lease: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        assert.equal(where.organizationId, 7);
        if (where.unitId) {
          assert.deepEqual(where.id, { not: lease.id });
          if (where.endsOn) {
            assert.deepEqual(where.endsOn, { lt: lease.startsOn });
            return existingLease?.endsOn &&
              existingLease.endsOn < lease.startsOn &&
              ["active", "notice"].includes(previousStatus ?? "")
              ? { id: 30, status: previousStatus, propertyId: 2 }
              : null;
          }
          assert.deepEqual(where.status, { in: ["active", "notice", "scheduled"] });
          assert.deepEqual(where.startsOn, lease.endsOn ? { lte: lease.endsOn } : undefined);
          assert.deepEqual(where.OR, [{ endsOn: null }, { endsOn: { gte: lease.startsOn } }]);
          if (overlap) return { id: 30 };
          if (!existingLease) return null;
          const startsBeforeEnd = !lease.endsOn || existingLease.startsOn <= lease.endsOn;
          const endsAfterStart = !existingLease.endsOn || existingLease.endsOn >= lease.startsOn;
          const eligibleStatus = ["active", "notice", "scheduled"].includes(previousStatus ?? "");
          return startsBeforeEnd && endsAfterStart && eligibleStatus ? { id: 30 } : null;
        }
        return { ...lease, status: currentStatus, revision: created ? 5 : 4 };
      },
      create: async () => {
        throw new Error("Finalization must not create another lease.");
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: number; organizationId: number; status?: string; revision?: number };
        data: { status: string };
      }) => {
        if (where.id === 30) {
          assert.deepEqual(where, { id: 30, organizationId: 7, status: previousStatus });
          assert.deepEqual(data, { status: "ended" });
          previousStatus = data.status;
          return { count: 1 };
        }
        assert.equal(where.id, 9);
        assert.equal(where.organizationId, 7);
        assert.equal(where.revision, 4);
        currentStatus = data.status;
        created = true;
        return { count: 1 };
      },
      findFirstOrThrow: async () => ({ ...lease, status: currentStatus, revision: 5 }),
    },
    property: {
      findFirstOrThrow: async () => ({ id: 2 }),
      update: async () => {
        occupiedIncrements += 1;
        occupiedUnits += 1;
        return { id: 2 };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: number; organizationId: number; occupiedUnits: { gt: number } };
        data: { occupiedUnits: { decrement: number } };
      }) => {
        assert.deepEqual(where, { id: 2, organizationId: 7, occupiedUnits: { gt: 0 } });
        assert.deepEqual(data, { occupiedUnits: { decrement: 1 } });
        if (occupiedUnits <= 0) return { count: 0 };
        occupiedIncrements -= 1;
        occupiedUnits -= 1;
        return { count: 1 };
      },
    },
    unit: { findFirstOrThrow: async () => ({ id: 3 }) },
    organization: { findUniqueOrThrow: async () => ({ timeZone }) },
    tenant: { findMany: async () => lease.tenants.map(({ tenantId }) => ({ id: tenantId })) },
    outboxEvent: {
      createMany: async ({
        data,
      }: {
        data: { payload: { organizationId: number; leaseId: number; activateAt: string }; availableAt?: Date };
      }) => {
        outboxWrites += 1;
        assert.equal(data.availableAt, undefined);
        eventPayload = data.payload;
        activationAt = new Date(data.payload.activateAt);
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({
        eventType: "lease.activate",
        schemaVersion: 1,
        payload: eventPayload,
      }),
    },
    invoice: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        invoiceWrites += 1;
        if (invoiceWrites === invoiceFailureAt) throw new Error("Invoice write failed.");
        if (invoiceWrites === 1 && simulateConcurrentFinalization) {
          currentStatus = "active";
          created = true;
          invoiceRows.push(data);
          throw new Prisma.PrismaClientKnownRequestError("Invoice already exists.", {
            code: "P2002",
            clientVersion: "7.10.0",
          });
        }
        invoiceRows.push(data);
        return { id: invoiceWrites, invoiceNumber: invoiceWrites, organizationId: 7, propertyId: 2, items: [] };
      },
      aggregate: async ({ where }: { where: Record<string, unknown> }) => {
        assert.deepEqual(where, {
          organizationId: 7,
          leaseId: 9,
          billingRevision: 1,
          sourceKey: { startsWith: "rent:" },
        });
        return {
          _count: { _all: invoiceRows.length },
          _sum: { amountCents: invoiceRows.reduce((total, row) => total + Number(row.amountCents), 0) },
        };
      },
    },
    invoiceRecipient: {
      createMany: async ({
        data,
      }: {
        data: Array<{ organizationId: number; invoiceId: number; tenantId: number }>;
      }) => {
        recipientRows.push(...data);
        return { count: data.length };
      },
    },
    invoiceItem: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        itemRows.push(...data);
        return { count: data.length };
      },
    },
    activityEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        activityRows.push(data);
        return { id: activityRows.length };
      },
    },
  };
  const prisma = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) };
  return {
    caller: createCaller(prisma),
    counts: () => ({ occupiedIncrements, outboxWrites }),
    invoiceWrites: () => invoiceWrites,
    invoiceRows: () => invoiceRows,
    recipientRows: () => recipientRows,
    itemRows: () => itemRows,
    activityRows: () => activityRows,
    status: () => currentStatus,
    previousStatus: () => previousStatus,
    activationAt: () => activationAt,
  };
}

test("finalizes today's draft in place and increments occupancy once", async () => {
  const { caller, counts } = createDatabase(calendarDay(0));
  const input = { leaseId: 9, expectedRevision: 4 };
  const first = await caller.leases.finalizeDraft(input);
  const repeated = await caller.leases.finalizeDraft(input);
  assert.equal(first.id, 9);
  assert.equal(first.status, "active");
  assert.equal(repeated.id, 9);
  assert.deepEqual(counts(), { occupiedIncrements: 1, outboxWrites: 0 });
});

test("finalizes a future draft as scheduled and records one activation event", async () => {
  const { caller, counts, invoiceWrites } = createDatabase(calendarDay(10));
  const input = { leaseId: 9, expectedRevision: 4 };
  const first = await caller.leases.finalizeDraft(input);
  const scheduledInvoiceCount = invoiceWrites();
  await caller.leases.finalizeDraft(input);
  assert.equal(first.status, "scheduled");
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 1 });
  assert.ok(scheduledInvoiceCount > 0);
  assert.equal(invoiceWrites(), scheduledInvoiceCount);
});

test("schedules activation at the organization's local midnight", async () => {
  const start = calendarDay(10);
  const { caller, activationAt } = createDatabase(start, false, {}, undefined, 1, "Asia/Tokyo");
  await caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 });
  assert.equal(activationAt()?.getTime(), start.getTime() - 9 * 60 * 60 * 1000);
});

test("rejects overlapping dates without changing the draft", async () => {
  const { caller, counts } = createDatabase(calendarDay(0), true);
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), {
    code: "CONFLICT",
  });
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("rejects an incomplete draft and preserves its data", async () => {
  const { caller, counts } = createDatabase(calendarDay(0), false, { monthlyRentCents: null });
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), {
    code: "BAD_REQUEST",
    message: /Residents and billing/,
  });
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("finalizes individual billing when saved tenant shares total the rent and deposit", async () => {
  const tenants = [
    { tenantId: 11, rentShareCents: 4000, depositShareCents: 400 },
    { tenantId: 12, rentShareCents: 6000, depositShareCents: 600 },
  ];
  const { caller, invoiceRows, recipientRows } = createDatabase(calendarDay(0), false, {
    billingResponsibility: "individual",
    tenants,
  });

  const lease = await caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 });
  assert.equal(lease.status, "active");
  assert.deepEqual(
    invoiceRows()
      .slice(0, 2)
      .map(({ tenantId }, index) => ({
        tenantId,
        recipients: recipientRows().filter(({ invoiceId }) => invoiceId === index + 1),
      })),
    [
      { tenantId: 11, recipients: [{ organizationId: 7, invoiceId: 1, tenantId: 11 }] },
      { tenantId: 12, recipients: [{ organizationId: 7, invoiceId: 2, tenantId: 12 }] },
    ],
  );
});

test("rejects individual billing when saved tenant shares do not total the lease rent", async () => {
  const { caller, counts } = createDatabase(calendarDay(0), false, {
    billingResponsibility: "individual",
    tenants: [
      { tenantId: 11, rentShareCents: 4000, depositShareCents: 400 },
      { tenantId: 12, rentShareCents: 5000, depositShareCents: 600 },
    ],
  });

  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), {
    code: "BAD_REQUEST",
    message: /Tenant rent allocations must equal the monthly rent/,
  });
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("rejects stale draft revisions", async () => {
  const { caller, counts } = createDatabase(calendarDay(0));
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 3 }), {
    code: "CONFLICT",
  });
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("rejects a discarded draft", async () => {
  const { caller, counts } = createDatabase(calendarDay(0), false, { archivedAt: new Date() });
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), {
    code: "NOT_FOUND",
  });
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("rejects a lease outside the draft state", async () => {
  const { caller, counts } = createDatabase(calendarDay(0), false, { status: "notice" });
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), {
    code: "CONFLICT",
  });
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("allows a lease starting after the previous lease ends", async () => {
  const start = calendarDay(10);
  const { caller } = createDatabase(
    start,
    false,
    {},
    {
      startsOn: calendarDay(-30),
      endsOn: calendarDay(9),
      status: "active",
    },
  );
  const lease = await caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 });
  assert.equal(lease.status, "scheduled");
});

test("immediate finalization ends an expired predecessor and transfers occupancy", async () => {
  const start = calendarDay(0);
  const { caller, counts, previousStatus } = createDatabase(
    start,
    false,
    {},
    { startsOn: calendarDay(-30), endsOn: calendarDay(-1), status: "active" },
  );
  const lease = await caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 });
  assert.equal(lease.status, "active");
  assert.equal(previousStatus(), "ended");
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("immediate finalization rejects inconsistent predecessor occupancy", async () => {
  const start = calendarDay(0);
  const { caller, counts } = createDatabase(
    start,
    false,
    {},
    { startsOn: calendarDay(-30), endsOn: calendarDay(-1), status: "active" },
    0,
  );
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), /occupancy is inconsistent/);
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("rejects overlap with an open-ended lease", async () => {
  const start = calendarDay(10);
  const { caller, counts } = createDatabase(
    start,
    false,
    {},
    {
      startsOn: calendarDay(-30),
      endsOn: null,
      status: "notice",
    },
  );
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), {
    code: "CONFLICT",
  });
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("rejects overlap with a scheduled lease", async () => {
  const start = calendarDay(10);
  const { caller } = createDatabase(
    start,
    false,
    {},
    {
      startsOn: calendarDay(20),
      endsOn: calendarDay(50),
      status: "scheduled",
    },
  );
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), {
    code: "CONFLICT",
  });
});

test("finalization creates the complete rent schedule once", async () => {
  const start = calendarDay(0);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 12, 0));
  const { caller, invoiceWrites, invoiceRows, itemRows, activityRows } = createDatabase(start, false, { endsOn: end });
  const input = { leaseId: 9, expectedRevision: 4 };

  const first = await caller.leases.finalizeDraft(input);
  const repeated = await caller.leases.finalizeDraft(input);

  assert.equal(invoiceWrites(), 12);
  const rentTotalCents = invoiceRows().reduce((total, row) => total + Number(row.amountCents), 0);
  assert.deepEqual(first.invoiceSummary, { invoiceCount: 12, rentTotalCents });
  assert.deepEqual(repeated.invoiceSummary, first.invoiceSummary);
  assert.deepEqual(
    activityRows()
      .filter(({ action }) => action === "lease.finalized")
      .map(({ metadata }) => metadata),
    [{ invoiceCount: 12, rentTotalCents, billingRevision: 1 }],
  );
  assert.equal(invoiceRows()[0]?.sourceKey, `rent:${start.toISOString().slice(0, 7)}:joint`);
  assert.equal(invoiceRows()[0]?.billingRevision, 1);
  assert.equal(invoiceRows()[0]?.amountCents, invoiceRows()[0]?.balanceCents);
  assert.deepEqual(itemRows()[0], {
    invoiceId: 1,
    item: "Rent",
    quantity: 1,
    rateCents: invoiceRows()[0]?.amountCents,
    amountCents: invoiceRows()[0]?.amountCents,
  });
});

test("month-to-month finalization creates twelve initial rent invoices", async () => {
  const { caller, invoiceRows } = createDatabase(calendarDay(0), false, {
    termType: "month_to_month",
    endsOn: null,
  });

  await caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 });

  assert.equal(invoiceRows().length, 12);
});

test("a failed invoice write leaves the draft unchanged", async () => {
  const { caller, counts, status } = createDatabase(calendarDay(0), false, {}, undefined, 1, "UTC", 2);

  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), /Invoice write failed/);

  assert.equal(status(), "draft");
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("a concurrent invoice identity conflict rereads the finalized lease", async () => {
  const { caller, counts, invoiceWrites, invoiceRows } = createDatabase(
    calendarDay(0),
    false,
    {},
    undefined,
    1,
    "UTC",
    undefined,
    true,
  );

  const finalized = await caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 });

  assert.equal(finalized.status, "active");
  assert.deepEqual(finalized.invoiceSummary, {
    invoiceCount: 1,
    rentTotalCents: Number(invoiceRows()[0]?.amountCents),
  });
  assert.equal(invoiceWrites(), 1);
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});
