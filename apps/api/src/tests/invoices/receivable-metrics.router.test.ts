import assert from "node:assert/strict";
import test from "node:test";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

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
        findMany: async () => [property],
        findFirst: async ({
          include,
        }: {
          include: { leases: { include: { invoices: { select: Record<string, boolean> } } } };
        }) => ({
          ...property,
          leases: property.leases.map((lease) => ({
            ...lease,
            invoices: lease.invoices.map((invoice) =>
              Object.fromEntries(
                Object.entries(invoice).filter(
                  ([field]) => include.leases.include.invoices.select[field],
                ),
              ),
            ),
          })),
        }),
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
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-01T03:00:00Z").getTime() });
  const property = fixture();
  property.leases[0]!.invoices = [
    { id: 9, dueOn: new Date("2026-10-31"), status: "overdue", amountCents: 501, balanceCents: 501 },
  ];
  property.leases = [property.leases[0]!];
  const boundaries: Date[] = [];
  const caller = appRouter.createCaller({
    prisma: {
      property: { findMany: async () => [property] },
      invoice: {
        updateMany: async ({ where }: { where: { organizationId: number; dueOn?: { lt?: Date } } }) => {
          assert.equal(where.organizationId, 7);
          if (where.dueOn?.lt) boundaries.push(where.dueOn.lt);
          return { count: 0 };
        },
      },
    },
    req: { headers: {} },
    session: { user: { id: 1, role: "administrator" } },
    organization: { organizationId: 7, organization: { timeZone: "America/Chicago" } },
  } as unknown as Context);
  assert.equal((await caller.properties.list())[0]!.amountOverdueCents, 0);
  t.mock.timers.setTime(new Date("2026-11-01T07:00:00Z").getTime());
  assert.equal((await caller.properties.list())[0]!.amountOverdueCents, 501);
  assert.deepEqual(
    boundaries.map((date) => date.toISOString()),
    ["2026-10-31T00:00:00.000Z", "2026-11-01T00:00:00.000Z"],
  );
});
