import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";
import { createPropertyInputSchema, updatePropertyInputSchema } from "@parcelis/schemas";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

const input = {
  name: "Oak House",
  propertyType: "House" as const,
  address: { line1: "123 Oak Street", city: "Chicago", region: "IL", postalCode: "60601" },
  unitCount: 0,
  units: [],
  tagIds: [],
};
type Status = "active" | "leasing" | "maintenance" | "archived";
function harness(initialStatus: Status = "active", denied = false, foreign = false) {
  const state = { status: initialStatus, writes: 0 };
  const property = {
    findFirstOrThrow: async ({ where }: { where: unknown }) => {
      assert.deepEqual(where, { id: 2, organizationId: 7 });
      if (foreign) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: 2, status: state.status };
    },
    findUniqueOrThrow: async () => ({ legacyNoteId: null, status: state.status }),
    create: async ({ data }: { data: { status: Status; organizationId: number } }) => {
      assert.equal(data.organizationId, 7);
      state.status = data.status;
      state.writes++;
      return { id: 2, status: state.status, legacyNotes: null };
    },
    update: async ({ data }: { data: { status?: Status } }) => {
      if (data.status !== undefined) state.status = data.status;
      state.writes++;
      return { id: 2, status: state.status, legacyNotes: null };
    },
  };
  const prisma = {
    rolePermission: { findUnique: async () => ({ canCreate: !denied, canEdit: !denied }) },
    property,
    tag: { count: async () => 0 },
    amenityType: { count: async () => 0 },
    utilityType: { count: async () => 0 },
    unit: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
  };
  const caller = appRouter.createCaller({
    prisma: { ...prisma, $transaction: async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma) },
    session: { userId: 1, user: { id: 1, name: "Manager", role: "property_manager" } },
    organization: { organizationId: 7 },
  } as unknown as Context);
  return { caller, state };
}

for (const status of ["active", "leasing", "maintenance"] as const) {
  test(`creates and updates operational status ${status}`, async () => {
    const { caller, state } = harness();
    assert.equal((await caller.properties.create({ ...input, status })).status, status);
    state.status = "active";
    assert.equal((await caller.properties.update({ ...input, id: 2, status })).status, status);
  });
}

test("omitted creation status defaults to active", async () => {
  const { caller } = harness("maintenance");
  assert.equal((await caller.properties.create(input)).status, "active");
});
for (const status of ["leasing", "maintenance", "archived"] as const) {
  test(`omitted update status preserves ${status}`, async () => {
    const { caller } = harness(status);
    assert.equal((await caller.properties.update({ ...input, id: 2 })).status, status);
  });
}
for (const status of ["archived", "invalid"]) {
  test(`create and update reject status ${status}`, () => {
    assert.equal(createPropertyInputSchema.safeParse({ ...input, status }).success, false);
    assert.equal(updatePropertyInputSchema.safeParse({ ...input, id: 2, status }).success, false);
  });
}

test("operational updates cannot unarchive a property", async () => {
  const { caller, state } = harness("archived");
  await assert.rejects(caller.properties.update({ ...input, id: 2, status: "active" }), { code: "CONFLICT" });
  assert.equal(state.status, "archived");
  assert.equal(state.writes, 0);
});
test("status writes require the matching property permission", async () => {
  const { caller, state } = harness("active", true);
  await assert.rejects(caller.properties.create({ ...input, status: "leasing" }), { code: "FORBIDDEN" });
  await assert.rejects(caller.properties.update({ ...input, id: 2, status: "leasing" }), { code: "FORBIDDEN" });
  assert.equal(state.writes, 0);
});
test("status updates cannot target another organization", async () => {
  const { caller, state } = harness("active", false, true);
  await assert.rejects(caller.properties.update({ ...input, id: 2, status: "leasing" }), { code: "NOT_FOUND" });
  assert.equal(state.writes, 0);
});
