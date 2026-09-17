import assert from "node:assert/strict";
import test from "node:test";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

function createCaller(prisma: unknown) {
  return appRouter.createCaller({
    prisma,
    session: { user: { id: 1, role: "administrator" } },
    organization: { organizationId: 7 },
  } as unknown as Context);
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    propertyId: 2,
    unitId: 3,
    termType: null,
    startsOn: null,
    endsOn: null,
    monthlyRentCents: null,
    securityDepositCents: 0,
    rentDueDay: 1,
    continueMonthToMonthAfterEnd: false,
    billingResponsibility: null,
    allowPartialPayments: true,
    draftStep: "property",
    revision: 0,
    archivedAt: null,
    tenants: [{ tenantId: 11 }],
    ...overrides,
  };
}

test("updates a draft and increments its revision", async () => {
  const current = draft();
  let updatedRevision: unknown;
  const tx = {
    lease: {
      findFirst: async () => current,
      updateMany: async ({ data }: { data: { revision: { increment: number } } }) => {
        updatedRevision = data.revision;
        return { count: 1 };
      },
      findFirstOrThrow: async () => ({ ...current, revision: 1, draftStep: "residents" }),
    },
    property: { findFirstOrThrow: async () => ({ id: 2 }) },
    unit: { findFirstOrThrow: async () => ({ id: 3 }) },
  };
  const caller = createCaller({ $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) });

  const result = await caller.leases.updateDraft({
    leaseId: 9,
    expectedRevision: 0,
    data: { draftStep: "residents" },
  });

  assert.deepEqual(updatedRevision, { increment: 1 });
  assert.equal((result as { revision: number }).revision, 1);
});

test("rejects a stale draft revision before writing", async () => {
  const current = draft({ revision: 2 });
  let wrote = false;
  const tx = {
    lease: {
      findFirst: async () => current,
      updateMany: async () => {
        wrote = true;
        return { count: 1 };
      },
    },
  };
  const caller = createCaller({ $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) });

  await assert.rejects(
    caller.leases.updateDraft({ leaseId: 9, expectedRevision: 1, data: { draftStep: "residents" } }),
    { code: "CONFLICT" },
  );
  assert.equal(wrote, false);
});

test("does not update a draft outside the organization", async () => {
  const tx = { lease: { findFirst: async () => null } };
  const caller = createCaller({ $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) });

  await assert.rejects(
    caller.leases.updateDraft({ leaseId: 9, expectedRevision: 0, data: { draftStep: "residents" } }),
    { code: "NOT_FOUND" },
  );
});
