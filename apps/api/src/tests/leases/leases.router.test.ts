import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

function createCaller(prisma: unknown, role = "administrator") {
  return appRouter.createCaller({
    prisma,
    session: { user: { id: 1, role } },
    organization: { organizationId: 7 },
  } as unknown as Context);
}

for (const action of ["archive", "reactivate"] as const) {
  test(`lease ${action} scopes writes to the organization and preserves lease status`, async () => {
    let update: unknown;
    const caller = createCaller({
      lease: {
        update: async (input: unknown) => {
          update = input;
          return { id: 2 };
        },
      },
    });
    await caller.leases[action]({ id: 2 });
    const input = update as { where: unknown; data: { archivedAt: Date | null } };
    assert.deepEqual(input.where, { id: 2, organizationId: 7 });
    assert.deepEqual(Object.keys(input.data), ["archivedAt"]);
    if (action === "archive") assert.ok(input.data.archivedAt instanceof Date);
    else assert.equal(input.data.archivedAt, null);
  });
}

for (const [status, invoiceCount, allowed] of [
  ["draft", 0, true],
  ["draft", 1, false],
  ["active", 0, false],
  ["notice", 0, false],
  ["ended", 0, false],
] as const) {
  test(`lease deletion: ${status}, ${invoiceCount} invoices`, async () => {
    let deleted = false;
    const tx = {
      lease: {
        findFirstOrThrow: async ({ where }: { where: unknown }) => {
          assert.deepEqual(where, { id: 2, organizationId: 7 });
          return { id: 2, status, _count: { invoices: invoiceCount } };
        },
        delete: async ({ where }: { where: unknown }) => {
          assert.deepEqual(where, { id: 2, organizationId: 7 });
          deleted = true;
          return { id: 2 };
        },
      },
    };
    const caller = createCaller({
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    });
    if (allowed) await caller.leases.delete({ id: 2 });
    else {
      await assert.rejects(
        () => caller.leases.delete({ id: 2 }),
        (error: unknown) => error instanceof TRPCError && error.code === "CONFLICT",
      );
    }
    assert.equal(deleted, allowed);
  });
}

test("property view/edit permission does not expose lease records or permit lease mutations", async () => {
  const property = {
    id: 1,
    legacyNotes: null,
    imageObjectKey: null,
    units: [],
    maintenanceTickets: [],
    leases: [{ id: 2, confidential: "lease data" }],
  };
  const permission = { resource: "properties", canView: true, canEdit: true };
  const caller = createCaller(
    {
      rolePermission: {
        findMany: async () => [permission],
        findUnique: async ({ where }: { where: { role_resource: { resource: string } } }) =>
          where.role_resource.resource === "properties" ? permission : null,
      },
      property: {
        findMany: async () => [property],
        findFirst: async () => property,
      },
      invoice: { updateMany: async () => ({ count: 0 }) },
    },
    "property_manager",
  );
  assert.deepEqual((await caller.properties.list())[0]?.leases, []);
  assert.deepEqual((await caller.properties.byId({ id: 1 }))?.leases, []);
  for (const action of ["archive", "reactivate", "delete"] as const) {
    await assert.rejects(
      () => caller.leases[action]({ id: 2 }),
      (error: unknown) => error instanceof TRPCError && error.code === "FORBIDDEN",
    );
  }
});

for (const action of ["archive", "reactivate", "delete"] as const) {
  test(`lease ${action} returns only confirmation fields without view permission`, async () => {
    const lease = {
      id: 2,
      archivedAt: null as Date | null,
      status: "draft",
      monthlyRentCents: 100_000,
      _count: { invoices: 0 },
    };
    const selectResult = (select: Record<string, boolean>) =>
      Object.fromEntries(Object.entries(lease).filter(([key]) => select[key]));
    const tx = {
      lease: {
        findFirstOrThrow: async () => lease,
        delete: async ({ select }: { select: Record<string, boolean> }) => {
          assert.deepEqual(select, { id: true });
          return selectResult(select);
        },
        update: async ({ data, select }: { data: { archivedAt: Date | null }; select: Record<string, boolean> }) => {
          assert.deepEqual(select, { id: true, archivedAt: true });
          lease.archivedAt = data.archivedAt;
          return selectResult(select);
        },
      },
    };
    const caller = createCaller(
      {
        ...tx,
        rolePermission: {
          findUnique: async () => ({
            canView: false,
            canArchive: action !== "delete",
            canDelete: action === "delete",
          }),
        },
        $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      },
      "property_manager",
    );
    const result = await caller.leases[action]({ id: 2 });
    assert.deepEqual(
      result,
      action === "delete"
        ? { id: 2 }
        : {
            id: 2,
            archivedAt: lease.archivedAt,
          },
    );
  });
}
