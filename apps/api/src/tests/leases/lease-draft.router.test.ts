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
    status: "draft",
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

test("creates a draft from the first property selection", async () => {
  let created = false;
  const createdDraft = draft({ leaseDraftKey: "8f7c4b9a-7f50-4c9e-a5d1-3f5d9e3b2a10" });
  const tx = {
    lease: {
      findUnique: async () => null,
      create: async () => {
        created = true;
        return createdDraft;
      },
    },
    property: { findFirstOrThrow: async () => ({ id: 2 }) },
    unit: { findFirstOrThrow: async () => ({ id: 3 }) },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  const result = await caller.leases.createDraft({
    leaseDraftKey: "8f7c4b9a-7f50-4c9e-a5d1-3f5d9e3b2a10",
    propertyId: 2,
    unitId: 3,
  });

  assert.equal(created, true);
  assert.equal((result as { status: string }).status, "draft");
});

test("returns the existing draft when the first save is retried", async () => {
  let created = false;
  const existingDraft = draft({ leaseDraftKey: "8f7c4b9a-7f50-4c9e-a5d1-3f5d9e3b2a10" });
  const tx = {
    lease: {
      findUnique: async () => existingDraft,
      create: async () => {
        created = true;
        return existingDraft;
      },
    },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  const result = await caller.leases.createDraft({
    leaseDraftKey: "8f7c4b9a-7f50-4c9e-a5d1-3f5d9e3b2a10",
    propertyId: 2,
    unitId: 3,
  });

  assert.equal(created, false);
  assert.equal((result as { id: number }).id, existingDraft.id);
});

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
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

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
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  await assert.rejects(
    caller.leases.updateDraft({ leaseId: 9, expectedRevision: 1, data: { draftStep: "residents" } }),
    { code: "CONFLICT" },
  );
  assert.equal(wrote, false);
});

test("does not update a draft outside the organization", async () => {
  const tx = { lease: { findFirst: async () => null } };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  await assert.rejects(
    caller.leases.updateDraft({ leaseId: 9, expectedRevision: 0, data: { draftStep: "residents" } }),
    { code: "NOT_FOUND" },
  );
});

test("preserves allocations when only resident IDs are patched", async () => {
  let createdRows: unknown;
  const current = draft({ tenants: [{ tenantId: 11, rentShareCents: 4000, depositShareCents: 1000 }] });
  const tx = {
    lease: {
      findFirst: async () => current,
      updateMany: async () => ({ count: 1 }),
      findFirstOrThrow: async () => ({ ...current, revision: 1 }),
    },
    property: { findFirstOrThrow: async () => ({ id: 2 }) },
    unit: { findFirstOrThrow: async () => ({ id: 3 }) },
    tenant: { findMany: async () => [{ id: 11 }] },
    leaseTenant: {
      deleteMany: async () => ({ count: 1 }),
      createMany: async ({ data }: { data: unknown }) => {
        createdRows = data;
        return { count: 1 };
      },
    },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  await caller.leases.updateDraft({ leaseId: 9, expectedRevision: 0, data: { tenantIds: [11] } });
  assert.deepEqual(createdRows, [
    { organizationId: 7, leaseId: 9, tenantId: 11, rentShareCents: 4000, depositShareCents: 1000 },
  ]);
});

test("rejects individual allocation IDs that do not match selected residents", async () => {
  let deleted = false;
  const current = draft({ billingResponsibility: "individual" });
  const tx = {
    lease: { findFirst: async () => current },
    property: { findFirstOrThrow: async () => ({ id: 2 }) },
    unit: { findFirstOrThrow: async () => ({ id: 3 }) },
    tenant: { findMany: async () => [{ id: 11 }] },
    leaseTenant: {
      deleteMany: async () => {
        deleted = true;
        return { count: 1 };
      },
    },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  await assert.rejects(
    caller.leases.updateDraft({
      leaseId: 9,
      expectedRevision: 0,
      data: { tenantIds: [11], tenantAllocations: [{ tenantId: 12, rentShareCents: 1, depositShareCents: 1 }] },
    }),
    { code: "BAD_REQUEST" },
  );
  assert.equal(deleted, false);
});

test("accepts joint billing without individual allocations", async () => {
  let createdRows: unknown;
  const current = draft({
    billingResponsibility: "joint",
    tenants: [{ tenantId: 11, rentShareCents: 4000, depositShareCents: 1000 }],
  });
  const tx = {
    lease: {
      findFirst: async () => current,
      updateMany: async () => ({ count: 1 }),
      findFirstOrThrow: async () => ({ ...current, revision: 1 }),
    },
    property: { findFirstOrThrow: async () => ({ id: 2 }) },
    unit: { findFirstOrThrow: async () => ({ id: 3 }) },
    tenant: { findMany: async () => [{ id: 11 }] },
    leaseTenant: {
      deleteMany: async () => ({ count: 1 }),
      createMany: async ({ data }: { data: unknown }) => {
        createdRows = data;
        return { count: 1 };
      },
    },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  await caller.leases.updateDraft({
    leaseId: 9,
    expectedRevision: 0,
    data: { tenantIds: [11], billingResponsibility: "joint", tenantAllocations: [] },
  });

  assert.deepEqual(createdRows, [
    { organizationId: 7, leaseId: 9, tenantId: 11, rentShareCents: null, depositShareCents: null },
  ]);
});
