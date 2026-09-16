import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@parcelis/db";
import { createLeaseInputSchema } from "@parcelis/schemas";
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

const individualLeaseInput = {
  propertyId: 2,
  unitId: 3,
  tenantIds: [11, 12],
  billingResponsibility: "individual" as const,
  allowPartialPayments: true,
  securityDepositCents: 3_000,
  monthlyRentCents: 10_000,
  startsOn: new Date("2026-01-01"),
  endsOn: new Date("2026-01-01"),
  status: "draft" as const,
  tenantAllocations: [
    { tenantId: 11, rentShareCents: 4_000, depositShareCents: 1_000 },
    { tenantId: 12, rentShareCents: 6_000, depositShareCents: 2_000 },
  ],
};

for (const [name, input, message] of [
  [
    "duplicate allocation tenants",
    {
      ...individualLeaseInput,
      tenantAllocations: [
        { tenantId: 11, rentShareCents: 4_000, depositShareCents: 1_000 },
        { tenantId: 11, rentShareCents: 6_000, depositShareCents: 2_000 },
      ],
    },
    "Provide one allocation for each selected tenant.",
  ],
  [
    "missing tenant allocations",
    { ...individualLeaseInput, tenantAllocations: [individualLeaseInput.tenantAllocations[0]!] },
    "Provide one allocation for each selected tenant.",
  ],
  [
    "rent allocation mismatches",
    {
      ...individualLeaseInput,
      tenantAllocations: [
        { tenantId: 11, rentShareCents: 4_000, depositShareCents: 1_000 },
        { tenantId: 12, rentShareCents: 5_000, depositShareCents: 2_000 },
      ],
    },
    "Tenant rent allocations must equal the monthly rent.",
  ],
  [
    "deposit allocation mismatches",
    {
      ...individualLeaseInput,
      tenantAllocations: [
        { tenantId: 11, rentShareCents: 4_000, depositShareCents: 1_000 },
        { tenantId: 12, rentShareCents: 6_000, depositShareCents: 1_000 },
      ],
    },
    "Tenant deposit allocations must equal the security deposit.",
  ],
] as const) {
  test(`individual lease validation rejects ${name}`, () => {
    const result = createLeaseInputSchema.safeParse(input);
    assert.equal(result.success, false);
    if (!result.success) assert.ok(result.error.issues.some((issue) => issue.message === message));
  });
}

for (const [billingResponsibility, expectedAmounts, expectedRecipients] of [
  ["joint", [13_000], [[11, 12]]],
  ["individual", [5_000, 8_000], [[11], [12]]],
] as const) {
  test(`${billingResponsibility} lease generation creates invoices with the correct amounts and recipients`, async () => {
    const invoiceData: unknown[] = [];
    let leaseData: unknown;
    const input = {
      ...individualLeaseInput,
      billingResponsibility,
      tenantAllocations: billingResponsibility === "joint" ? [] : individualLeaseInput.tenantAllocations,
      generateInvoices: true,
    };
    const tx = {
      property: { findFirstOrThrow: async () => ({ id: 2, occupiedUnits: 0 }) },
      unit: { findFirstOrThrow: async () => ({ id: 3 }) },
      tenant: { findMany: async () => [{ id: 11 }, { id: 12 }] },
      lease: {
        create: async ({ data }: { data: unknown }) => {
          leaseData = data;
          return {
            id: 4,
            startsOn: input.startsOn,
            endsOn: input.endsOn,
            billingResponsibility,
            monthlyRentCents: input.monthlyRentCents,
            securityDepositCents: input.securityDepositCents,
            tenants: [],
          };
        },
      },
      invoice: {
        create: async ({ data }: { data: unknown }) => {
          invoiceData.push(data);
          return { id: invoiceData.length };
        },
      },
    };
    const caller = createCaller({
      ...tx,
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    });

    await caller.leases.create(input);

    assert.deepEqual(
      invoiceData.map((data) => {
        const invoice = data as {
          amountCents: number;
          recipients: { create: { tenantId: number }[] };
        };
        return {
          amountCents: invoice.amountCents,
          recipientIds: invoice.recipients.create.map(({ tenantId }) => tenantId),
        };
      }),
      expectedAmounts.map((amountCents, index) => ({ amountCents, recipientIds: expectedRecipients[index] })),
    );

    const tenants = (leaseData as { tenants: { create: unknown[] } }).tenants.create;
    assert.deepEqual(
      tenants,
      input.tenantIds.map((tenantId, index) => ({
        organizationId: 7,
        tenantId,
        rentShareCents: input.tenantAllocations[index]?.rentShareCents,
        depositShareCents: input.tenantAllocations[index]?.depositShareCents,
      })),
    );
  });
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
    let transactionOptions: unknown;
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
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>, options: unknown) => {
        transactionOptions = options;
        return callback(tx);
      },
    });
    if (allowed) {
      await caller.leases.delete({ id: 2 });
      assert.deepEqual(transactionOptions, { isolationLevel: "Serializable" });
    } else {
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
    units: [
      {
        id: 1,
        name: "1A",
        bathrooms: null,
        amenities: [],
        utilities: [],
        _count: { leases: 1 },
      },
    ],
    maintenanceTickets: [],
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
        findMany: async ({ include }: { include: { leases: unknown } }) => {
          assert.equal(include.leases, false);
          return [property];
        },
        findFirst: async ({ include }: { include: { leases: unknown } }) => {
          assert.equal(include.leases, false);
          return property;
        },
      },
      invoice: { updateMany: async () => ({ count: 0 }) },
    },
    "property_manager",
  );
  assert.deepEqual((await caller.properties.list())[0]?.leases, []);
  assert.deepEqual((await caller.properties.list())[0]?.leaseHistory, []);
  assert.equal((await caller.properties.list())[0]?.units[0]?.isOccupied, true);
  assert.deepEqual((await caller.properties.byId({ id: 1 }))?.leases, []);
  assert.deepEqual((await caller.properties.byId({ id: 1 }))?.leaseHistory, []);
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

for (const code of ["P2034", "P2025"] as const) {
  test(`lease deletion handles transaction error ${code}`, async () => {
    const cause = new Prisma.PrismaClientKnownRequestError("Transaction failed", {
      code,
      clientVersion: "7.10.0",
    });
    const caller = createCaller({
      $transaction: async (_callback: unknown, options: unknown) => {
        assert.deepEqual(options, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        throw cause;
      },
    });
    await assert.rejects(
      () => caller.leases.delete({ id: 2 }),
      (error: unknown) => {
        assert.ok(error instanceof TRPCError);
        if (code === "P2034") {
          assert.equal(error.code, "CONFLICT");
          assert.equal(error.message, "The lease changed. Please try again.");
        } else {
          assert.equal(error.cause, cause);
        }
        return true;
      },
    );
  });
}

test("archiving hides leases from property collections while preserving history and metrics", async () => {
  const leases = ["active", "notice", "ended"].map((status, index) => ({
    id: index + 1,
    archivedAt: null as Date | null,
    status,
    startsOn: new Date("2025-01-01"),
    endsOn: null,
    monthlyRentCents: 100_000,
    unit: { name: String(index + 1) },
    tenants: [{ tenant: { id: 1, firstName: "Test", lastName: "Resident" } }],
    invoices: [{ balanceCents: 500 }],
  }));
  const property = {
    id: 1,
    legacyNotes: null,
    imageObjectKey: null,
    occupiedUnits: 2,
    units: [],
    maintenanceTickets: [],
    leases,
  };
  const caller = createCaller({
    property: {
      findMany: async ({ include }: { include: { leases: unknown } }) => {
        assert.ok(include.leases);
        return [property];
      },
      findFirst: async ({ include }: { include: { leases: unknown } }) => {
        assert.ok(include.leases);
        return property;
      },
    },
    invoice: { updateMany: async () => ({ count: 0 }) },
    lease: {
      update: async ({ where, data }: { where: { id: number }; data: { archivedAt: Date | null } }) => {
        const lease = leases.find((item) => item.id === where.id)!;
        lease.archivedAt = data.archivedAt;
        return { id: lease.id, archivedAt: lease.archivedAt };
      },
    },
  });
  for (const lease of leases) await caller.leases.archive({ id: lease.id });
  for (const result of [(await caller.properties.list())[0]!, (await caller.properties.byId({ id: 1 }))!]) {
    assert.deepEqual(result.leases, []);
    assert.deepEqual(result.leaseHistory.map((lease) => lease.id).sort(), [1, 2, 3]);
    assert.equal(result.occupiedUnits, 2);
  }
  const metrics = (await caller.properties.list())[0]!;
  assert.equal(metrics.monthlyRentCents, 200_000);
  assert.equal(metrics.amountOverdueCents, 1_000);
  await caller.leases.reactivate({ id: 2 });
  for (const result of [(await caller.properties.list())[0]!, (await caller.properties.byId({ id: 1 }))!]) {
    assert.deepEqual(
      result.leases.map((lease) => lease.id),
      [2],
    );
    assert.equal(result.leaseHistory.length, 3);
  }
});
