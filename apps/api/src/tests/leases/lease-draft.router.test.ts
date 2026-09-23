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

const newDraftInput = {
  leaseDraftKey: "8f7c4b9a-7f50-4c9e-a5d1-3f5d9e3b2a10",
  propertyId: 2,
  unitId: 3,
};

test("returns a unit's unfinished draft without creating or changing it", async () => {
  const existing = draft({ leaseDraftKey: "76ac61cc-d0ef-408f-ade5-42bf27985329" });
  const tx = {
    lease: {
      findUnique: async () => null,
      findFirst: async ({ where }: { where: unknown }) => {
        assert.deepEqual(where, { organizationId: 7, unitId: 3, status: "draft", archivedAt: null });
        return existing;
      },
      create: async () => assert.fail("Must not create a competing draft"),
    },
    property: { findFirstOrThrow: async () => ({ id: 2 }) },
    unit: { findFirstOrThrow: async () => ({ id: 3 }) },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>, options: unknown) => {
      assert.deepEqual(options, { isolationLevel: "Serializable" });
      return callback(tx);
    },
  });
  assert.equal(await caller.leases.createDraft(newDraftInput), existing);
});

test("replaces only the confirmed unchanged draft in the creation transaction", async () => {
  let deleted = false;
  const tx = {
    lease: {
      findUnique: async () => null,
      findFirst: async () => (deleted ? null : draft({ revision: 4 })),
      deleteMany: async ({ where }: { where: unknown }) => {
        assert.deepEqual(where, { id: 9, organizationId: 7, status: "draft", revision: 4, invoices: { none: {} } });
        deleted = true;
        return { count: 1 };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assert.equal(deleted, true);
        return draft({ ...data, id: 10 });
      },
    },
    property: { findFirstOrThrow: async () => ({ id: 2 }) },
    unit: { findFirstOrThrow: async () => ({ id: 3 }) },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });
  const result = await caller.leases.createDraft({ ...newDraftInput, replaceDraft: { id: 9, expectedRevision: 4 } });
  assert.equal(result.id, 10);
});

for (const current of [null, draft({ id: 10 }), draft({ revision: 1 })]) {
  test(`rejects replacement when the confirmed draft is missing, different, or changed: ${JSON.stringify(current && { id: current.id, revision: current.revision })}`, async () => {
    const tx = {
      lease: {
        findUnique: async () => null,
        findFirst: async () => current,
        deleteMany: async () => assert.fail("Must preserve unconfirmed changes"),
        create: async () => assert.fail("Must not create a replacement"),
      },
      property: { findFirstOrThrow: async () => ({ id: 2 }) },
      unit: { findFirstOrThrow: async () => ({ id: 3 }) },
    };
    const caller = createCaller({
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    });
    await assert.rejects(
      caller.leases.createDraft({ ...newDraftInput, replaceDraft: { id: 9, expectedRevision: 0 } }),
      { code: "CONFLICT" },
    );
  });
}

test("lists unfinished drafts within the active organization, including drafts without residents", async () => {
  const rows = [draft({ tenants: [] })];
  const caller = createCaller({
    lease: {
      findMany: async ({ where, orderBy }: { where: unknown; orderBy: unknown }) => {
        assert.deepEqual(where, { organizationId: 7, status: "draft", archivedAt: null });
        assert.deepEqual(orderBy, { updatedAt: "desc" });
        return rows;
      },
    },
  });
  assert.equal(await caller.leases.drafts(), rows);
});

test("creates a draft from the first property selection", async () => {
  let created = false;
  const createdDraft = draft({ leaseDraftKey: "8f7c4b9a-7f50-4c9e-a5d1-3f5d9e3b2a10" });
  const tx = {
    lease: {
      findUnique: async () => null,
      findFirst: async () => null,
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

test("moves a draft to an available unit in a serializable transaction", async () => {
  const current = draft();
  let reads = 0;
  const tx = {
    lease: {
      findFirst: async () => (reads++ === 0 ? current : null),
      updateMany: async ({ data }: { data: { unitId: number } }) => {
        assert.equal(reads, 2);
        assert.equal(data.unitId, 4);
        return { count: 1 };
      },
      findFirstOrThrow: async () => ({ ...current, unitId: 4, revision: 1 }),
    },
    property: { findFirstOrThrow: async () => ({ id: 2 }) },
    unit: { findFirstOrThrow: async () => ({ id: 4 }) },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>, options: unknown) => {
      assert.deepEqual(options, { isolationLevel: "Serializable" });
      return callback(tx);
    },
  });
  const result = await caller.leases.updateDraft({
    leaseId: 9,
    expectedRevision: 0,
    data: { unitId: 4 },
  });
  assert.equal(result.unitId, 4);
  assert.equal(result.revision, 1);
});

for (const procedure of ["createDraft", "updateDraft"] as const) {
  test(`${procedure} translates serialization failures into a unit draft conflict`, async () => {
    const caller = createCaller({
      $transaction: async () => {
        throw new Prisma.PrismaClientKnownRequestError("Transaction failed", {
          code: "P2034",
          clientVersion: "test",
        });
      },
    });
    await assert.rejects(
      procedure === "createDraft"
        ? caller.leases.createDraft(newDraftInput)
        : caller.leases.updateDraft({ leaseId: 9, expectedRevision: 0, data: { unitId: 4 } }),
      { code: "CONFLICT", message: "The unit's drafts changed. Select the unit again." },
    );
  });
}

test("does not move a draft onto a unit with another unfinished lease", async () => {
  let reads = 0;
  const tx = {
    lease: {
      findFirst: async ({ where }: { where: unknown }) => {
        if (reads++ === 0) return draft();
        assert.deepEqual(where, { organizationId: 7, unitId: 4, id: { not: 9 }, status: "draft", archivedAt: null });
        return { id: 10 };
      },
      updateMany: async () => assert.fail("Must not move the draft"),
    },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });
  await assert.rejects(caller.leases.updateDraft({ leaseId: 9, expectedRevision: 0, data: { unitId: 4 } }), {
    code: "CONFLICT",
  });
});

test("does not replace a draft that has invoices", async () => {
  const tx = {
    lease: {
      findUnique: async () => null,
      findFirst: async () => draft(),
      deleteMany: async () => ({ count: 0 }),
      create: async () => assert.fail("Must not replace a draft with invoices"),
    },
    property: { findFirstOrThrow: async () => ({ id: 2 }) },
    unit: { findFirstOrThrow: async () => ({ id: 3 }) },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });
  await assert.rejects(caller.leases.createDraft({ ...newDraftInput, replaceDraft: { id: 9, expectedRevision: 0 } }), {
    code: "CONFLICT",
  });
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

for (const billingResponsibility of [null, "individual"] as const) {
  test(`rejects allocation IDs that do not match selected residents when billing is ${billingResponsibility ?? "unset"}`, async () => {
    let deleted = false;
    const current = draft({ billingResponsibility });
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
}

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
