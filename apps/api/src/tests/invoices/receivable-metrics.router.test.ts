import assert from "node:assert/strict";
import test from "node:test";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";
import type { Prisma } from "@parcelis/db";

function projectProperty(property: ReturnType<typeof fixture>, query: Prisma.PropertyFindFirstArgs) {
  const leases = query.include?.leases;
  const invoiceQuery = typeof leases === "object" ? (leases.include ?? leases.select)?.invoices : undefined;
  const select = typeof invoiceQuery === "object" ? invoiceQuery.select : undefined;
  assert.ok(select);
  return {
    ...property,
    leases: property.leases.map((lease) => ({
      ...lease,
      invoices: lease.invoices.map((invoice) =>
        Object.fromEntries(Object.entries(invoice).filter(([key]) => select[key as keyof typeof select])),
      ),
    })),
  };
}

function fixture() {
  const invoices = [
    { id: 1, dueOn: new Date("2000-01-01"), status: "open", amountCents: 10001, balanceCents: 4001 },
    { id: 2, dueOn: new Date("2099-01-01"), status: "overdue", amountCents: 20002, balanceCents: 20002 },
    { id: 3, dueOn: new Date("2000-01-01"), status: "void", amountCents: 30003, balanceCents: 30003 },
  ];
  const lease = {
    id: 1,
    unitId: 3,
    unit: { name: "A" },
    monthlyRentCents: 10000,
    startsOn: new Date("2000-01-01"),
    endsOn: null,
    archivedAt: null,
    status: "active",
    tenants: [{ tenant: { id: 1 } }, { tenant: { id: 2 } }],
    invoices,
  };
  const property = {
    id: 1,
    imageObjectKey: null,
    units: [],
    maintenanceTickets: [],
    leases: [
      lease,
      {
        ...lease,
        id: 2,
        status: "ended",
        archivedAt: new Date(),
        monthlyRentCents: 50000,
        invoices: [
          { ...invoices[0], id: 4, balanceCents: 1234 },
          {
            id: 5,
            invoiceNumber: 5,
            dueOn: new Date("2000-02-01"),
            paidOn: new Date("2000-02-03"),
            status: "paid",
            amountCents: 7007,
            balanceCents: 0,
          },
        ],
      },
    ],
  };
  return property;
}

test("property list and detail retain historical debt and count joint obligations once", async () => {
  const property = fixture();
  const caller = appRouter.createCaller({
    prisma: {
      property: {
        findMany: async (query: Prisma.PropertyFindManyArgs) => [projectProperty(property, query)],
        findFirst: async (query: Prisma.PropertyFindFirstArgs) => projectProperty(property, query),
      },
      invoice: { updateMany: async () => ({ count: 0 }) },
    },
    req: { headers: {} },
    session: { user: { id: 1, role: "administrator" } },
    organization: { organizationId: 1, organization: { id: 1, timeZone: "America/Chicago" } },
  } as unknown as Context);
  const list = (await caller.properties.list())[0]!;
  assert.equal(list.amountOverdueCents, 5235);
  assert.equal(list.monthlyRentCents, 10000);
  assert.equal(list.leases.length, 1);
  assert.equal(list.leaseHistory.length, 2);
  const detail = (await caller.properties.byId({ id: 1 }))!;
  assert.deepEqual(
    detail.leaseHistory.map((lease) => lease.amountOverdueCents),
    [4001, 1234],
  );
  for (const response of [list, detail]) {
    const historicalLease = response.leaseHistory.find((lease) => lease.id === 2);
    assert.deepEqual(
      historicalLease?.invoices.find((invoice) => invoice.id === 5),
      {
        id: 5,
        invoiceNumber: 5,
        dueOn: new Date("2000-02-01"),
        paidOn: new Date("2000-02-03"),
        status: "paid",
        amountCents: 7007,
        balanceCents: 0,
      },
    );
  }
});

test("overdue reads and synchronization change at organization midnight, not UTC midnight", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-01T04:59:59.999Z").getTime() });
  const property = fixture();
  property.leases[0]!.invoices = [
    { id: 9, dueOn: new Date("2026-10-31"), status: "overdue", amountCents: 501, balanceCents: 501 },
  ];
  property.leases = [property.leases[0]!];
  const updates: unknown[] = [];
  let propertyReads = 0;
  const caller = appRouter.createCaller({
    prisma: {
      property: {
        findMany: async () => {
          assert.equal(updates.length, ++propertyReads * 3);
          return [property];
        },
        findFirst: async () => {
          assert.equal(updates.length, ++propertyReads * 3);
          return property;
        },
      },
      invoice: {
        updateMany: async (args: unknown) => {
          updates.push(args);
          return { count: 0 };
        },
      },
    },
    req: { headers: {} },
    session: { user: { id: 1, role: "administrator" } },
    organization: { organizationId: 7, organization: { timeZone: "America/Chicago" } },
  } as unknown as Context);
  assert.equal((await caller.properties.list())[0]!.amountOverdueCents, 0);
  assert.equal((await caller.properties.byId({ id: 1 }))!.leaseHistory[0]!.amountOverdueCents, 0);
  t.mock.timers.setTime(new Date("2026-11-01T05:00:00.001Z").getTime());
  assert.equal((await caller.properties.list())[0]!.amountOverdueCents, 501);
  assert.equal((await caller.properties.byId({ id: 1 }))!.leaseHistory[0]!.amountOverdueCents, 501);
  assert.deepEqual(
    updates,
    ["2026-10-31", "2026-10-31", "2026-11-01", "2026-11-01"].flatMap((date) => {
      const today = new Date(`${date}T00:00:00.000Z`);
      return [
        {
          where: { organizationId: 7, status: { in: ["open", "overdue"] }, balanceCents: 0 },
          data: { status: "paid" },
        },
        {
          where: { organizationId: 7, status: "open", balanceCents: { gt: 0 }, dueOn: { lt: today } },
          data: { status: "overdue" },
        },
        {
          where: { organizationId: 7, status: "overdue", balanceCents: { gt: 0 }, dueOn: { gte: today } },
          data: { status: "open" },
        },
      ];
    }),
  );
});

for (const operation of ["list", "byId"] as const) {
  for (const crossingDuring of ["permission lookup", "synchronization", "property read"]) {
    test(`property ${operation} keeps its billing date when midnight passes during ${crossingDuring}`, async (t) => {
      const before = new Date("2026-11-01T04:59:59.999Z").getTime();
      const after = new Date("2026-11-01T05:00:00.001Z").getTime();
      t.mock.timers.enable({ apis: ["Date"], now: before });
      const property = fixture();
      property.leases = [property.leases[0]!];
      property.leases[0]!.invoices = [
        { id: 9, dueOn: new Date("2026-10-31"), status: "open", amountCents: 501, balanceCents: 501 },
      ];
      const updates: Prisma.InvoiceUpdateManyArgs[] = [];
      let completedUpdates = 0;
      const overdueCents = crossingDuring === "permission lookup" ? 501 : 0;
      const readProperty = async () => {
        assert.equal(updates.length, 3);
        assert.equal(completedUpdates, 3);
        await Promise.resolve();
        if (crossingDuring === "property read") {
          t.mock.timers.setTime(after);
          property.leases[0]!.invoices[0]!.status = "overdue";
        }
        return property;
      };
      const caller = appRouter.createCaller({
        prisma: {
          rolePermission: {
            findUnique: async () => ({ canView: true }),
            findMany: async () => {
              await Promise.resolve();
              if (crossingDuring === "permission lookup") t.mock.timers.setTime(after);
              return ["properties", "leases", "invoices"].map((resource) => ({ resource, canView: true }));
            },
          },
          property: { findMany: async () => [await readProperty()], findFirst: readProperty },
          invoice: {
            updateMany: async (args: Prisma.InvoiceUpdateManyArgs) => {
              updates.push(args);
              await Promise.resolve();
              if (crossingDuring === "synchronization") t.mock.timers.setTime(after);
              completedUpdates += 1;
              return { count: 0 };
            },
          },
        },
        req: { headers: {} },
        session: { user: { id: 1, role: "property_manager" } },
        organization: { organizationId: 7, organization: { timeZone: "America/Chicago" } },
      } as unknown as Context);
      const result =
        operation === "list"
          ? await caller.properties.list().then(([property]) => {
              assert.equal(property?.amountOverdueCents, overdueCents);
              return property!;
            })
          : (await caller.properties.byId({ id: 1 }))!;
      assert.equal(Date.now(), after);
      assert.equal(result.leaseHistory[0]!.invoices[0]!.status, overdueCents ? "overdue" : "open");
      assert.equal(result.leaseHistory[0]!.amountOverdueCents, overdueCents);
      const billingDate = crossingDuring === "permission lookup" ? "2026-11-01" : "2026-10-31";
      assert.deepEqual(
        updates.slice(1).map(({ where }) => where?.dueOn),
        [{ lt: new Date(`${billingDate}T00:00:00.000Z`) }, { gte: new Date(`${billingDate}T00:00:00.000Z`) }],
      );
    });
  }
}

test("property detail does not synchronize invoices without invoice-view permission", async () => {
  const property = fixture();
  const caller = appRouter.createCaller({
    prisma: {
      rolePermission: {
        findUnique: async () => ({ canView: true }),
        findMany: async () => [
          { resource: "properties", canView: true },
          { resource: "leases", canView: true },
        ],
      },
      property: { findFirst: async () => property },
      invoice: { updateMany: async () => assert.fail("Invoice synchronization requires invoice-view permission") },
    },
    req: { headers: {} },
    session: { user: { id: 1, role: "property_manager" } },
    organization: { organizationId: 7, organization: { timeZone: "America/Chicago" } },
  } as unknown as Context);
  const detail = (await caller.properties.byId({ id: 1 }))!;
  assert.deepEqual(detail.leaseHistory[0]!.invoices, []);
  assert.equal(detail.leaseHistory[0]!.amountOverdueCents, null);
});
