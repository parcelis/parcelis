import assert from "node:assert/strict";
import test from "node:test";
import { leaseTermsStepSchema } from "@parcelis/schemas";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

function createCaller(prisma: unknown) {
  return appRouter.createCaller({
    prisma,
    session: { user: { id: 1, role: "administrator" } },
    organization: { organizationId: 7 },
  } as unknown as Context);
}

const validTerms = {
  termType: "fixed" as const,
  startsOn: "2026-01-01",
  endsOn: "2026-12-31",
  monthlyRentCents: 120_000,
  rentDueDay: 1,
  continueMonthToMonthAfterEnd: false,
};

for (const [name, terms, path] of [
  ["fixed terms require an end date", { ...validTerms, endsOn: "" }, "endsOn"],
  [
    "month-to-month terms reject an end date",
    { ...validTerms, termType: "month_to_month" as const },
    "endsOn",
  ],
  [
    "month-to-month terms reject fixed-term continuation",
    { ...validTerms, termType: "month_to_month" as const, endsOn: "", continueMonthToMonthAfterEnd: true },
    "continueMonthToMonthAfterEnd",
  ],
  ["lease end dates cannot precede start dates", { ...validTerms, endsOn: "2025-12-31" }, "endsOn"],
] as const) {
  test(name, () => {
    const result = leaseTermsStepSchema.safeParse(terms);

    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.error.issues[0]?.path[0], path);
  });
}

test("generated invoices use the lease rent due day", async () => {
  const invoiceData: Array<{ dueOn: Date }> = [];
  const startsOn = new Date(2026, 0, 1);
  const endsOn = new Date(2026, 2, 31);
  const createdLease = {
    id: 19,
    startsOn,
    endsOn,
    billingResponsibility: "joint",
    monthlyRentCents: 120_000,
    rentDueDay: 31,
  };
  const tx = {
    property: { findFirstOrThrow: async () => ({ id: 2, occupiedUnits: 0 }) },
    unit: { findFirstOrThrow: async () => ({ id: 3 }) },
    tenant: { findMany: async () => [{ id: 11 }] },
    lease: { create: async () => createdLease },
    invoice: {
      create: async ({ data }: { data: { dueOn: Date } }) => {
        invoiceData.push(data);
        return { id: invoiceData.length };
      },
    },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  await caller.leases.create({
    propertyId: 2,
    unitId: 3,
    tenantIds: [11],
    monthlyRentCents: createdLease.monthlyRentCents,
    startsOn,
    endsOn,
    status: "draft",
    rentDueDay: createdLease.rentDueDay,
    generateInvoices: true,
  });

  assert.deepEqual(
    invoiceData.map(({ dueOn }) => [dueOn.getFullYear(), dueOn.getMonth() + 1, dueOn.getDate()]),
    [
      [2026, 1, 31],
      [2026, 2, 28],
      [2026, 3, 31],
    ],
  );
});
