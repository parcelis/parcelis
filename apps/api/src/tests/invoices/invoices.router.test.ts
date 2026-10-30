import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";
import { appRouter, getMonthlyDueDate } from "../../router/app.router";
import type { Context } from "../../router/context";

function createCaller(prisma: unknown) {
  return appRouter.createCaller({
    prisma,
    session: { user: { id: 1, name: "Administrator", role: "administrator" } },
    organization: { organizationId: 7 },
  } as unknown as Context);
}

const paymentInput = {
  id: 4,
  amountCents: 5_000,
  paidOn: new Date("2026-09-14"),
  paidByTenantId: 12,
  paymentMethod: "check" as const,
};

test("generated rent due dates clamp to the final day of short months", () => {
  const cases = [
    { periodStartsOn: new Date(2026, 1, 1), expectedDay: 28 },
    { periodStartsOn: new Date(2028, 1, 1), expectedDay: 29 },
    { periodStartsOn: new Date(2026, 3, 1), expectedDay: 30 },
  ];

  for (const { periodStartsOn, expectedDay } of cases) {
    const dueOn = getMonthlyDueDate(periodStartsOn, 31);
    assert.equal(dueOn.getFullYear(), periodStartsOn.getFullYear());
    assert.equal(dueOn.getMonth(), periodStartsOn.getMonth());
    assert.equal(dueOn.getDate(), expectedDay);
  }
});

test("joint invoice accepts a payment from any recipient", async () => {
  let paymentData: unknown;
  let invoiceUpdateData: unknown;
  const invoice = {
    id: 4,
    invoiceNumber: 1,
    organizationId: 7,
    propertyId: 2,
    dueOn: new Date("2099-09-15"),
    balanceCents: 10_000,
    recipients: [{ tenantId: 11 }, { tenantId: 12 }],
    lease: { allowPartialPayments: true },
  };
  const tx = {
    invoice: {
      findFirstOrThrow: async () => invoice,
      update: async ({ data }: { data: unknown }) => {
        invoiceUpdateData = data;
        return invoice;
      },
    },
    invoicePayment: {
      create: async ({ data }: { data: unknown }) => {
        paymentData = data;
        return { id: 1 };
      },
    },
    activityEvent: { create: async () => ({ id: 1 }) },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  await caller.invoices.recordPayment(paymentInput);

  assert.deepEqual(paymentData, {
    organizationId: 7,
    invoiceId: 4,
    tenantId: 12,
    amountCents: 5_000,
    paymentMethod: "check",
    paidOn: paymentInput.paidOn,
  });
  assert.deepEqual(invoiceUpdateData, {
    balanceCents: 5_000,
    paidOn: null,
    paidByTenantId: null,
    paymentMethod: null,
    status: "open",
  });
});

test("joint invoice records batch payments from recipient tenants", async () => {
  const paymentData: unknown[] = [];
  const invoice = {
    dueOn: new Date("2026-09-15"),
    balanceCents: 10_000,
    recipients: [{ tenantId: 11 }, { tenantId: 12 }],
    lease: { allowPartialPayments: true },
  };
  const tx = {
    invoice: {
      findFirstOrThrow: async () => invoice,
      update: async () => invoice,
    },
    invoicePayment: {
      create: async ({ data }: { data: unknown }) => {
        paymentData.push(data);
        return { id: paymentData.length };
      },
    },
    activityEvent: { create: async () => ({ id: 1 }) },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  await caller.invoices.recordPayments({ id: 4, payments: [paymentInput] });

  assert.deepEqual(paymentData, [
    {
      organizationId: 7,
      invoiceId: 4,
      tenantId: 12,
      amountCents: 5_000,
      paymentMethod: "check",
      paidOn: paymentInput.paidOn,
    },
  ]);
});

test("invoice payments reject tenants who are not recipients", async () => {
  const tx = {
    invoice: {
      findFirstOrThrow: async () => ({
        dueOn: new Date("2026-09-15"),
        balanceCents: 10_000,
        recipients: [{ tenantId: 11 }],
        lease: { allowPartialPayments: true },
      }),
    },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  await assert.rejects(
    () => caller.invoices.recordPayment(paymentInput),
    (error: unknown) => error instanceof TRPCError && error.code === "BAD_REQUEST",
  );
});

test("batch invoice payments reject tenants who are not recipients", async () => {
  const tx = {
    invoice: {
      findFirstOrThrow: async () => ({
        dueOn: new Date("2026-09-15"),
        balanceCents: 10_000,
        recipients: [{ tenantId: 11 }],
        lease: { allowPartialPayments: true },
      }),
    },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  await assert.rejects(
    () => caller.invoices.recordPayments({ id: 4, payments: [paymentInput] }),
    (error: unknown) => error instanceof TRPCError && error.code === "BAD_REQUEST",
  );
});

test("single invoice payments must clear the balance when partial payments are disabled", async () => {
  const tx = {
    invoice: {
      findFirstOrThrow: async () => ({
        dueOn: new Date("2026-09-15"),
        balanceCents: 10_000,
        recipients: [{ tenantId: 11 }, { tenantId: 12 }],
        lease: { allowPartialPayments: false },
      }),
    },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  await assert.rejects(
    () => caller.invoices.recordPayment(paymentInput),
    (error: unknown) => error instanceof TRPCError && error.code === "BAD_REQUEST",
  );
});

test("payment batches must clear the balance when partial payments are disabled", async () => {
  const tx = {
    invoice: {
      findFirstOrThrow: async () => ({
        dueOn: new Date("2026-09-15"),
        balanceCents: 10_000,
        recipients: [{ tenantId: 11 }, { tenantId: 12 }],
        lease: { allowPartialPayments: false },
      }),
    },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  await assert.rejects(
    () => caller.invoices.recordPayments({ id: 4, payments: [paymentInput] }),
    (error: unknown) => error instanceof TRPCError && error.code === "BAD_REQUEST",
  );
});

test("manual joint invoices create recipients for every lease tenant", async () => {
  let invoiceData: unknown;
  const tx = {
    invoice: {
      findFirst: async () => null,
      create: async ({ data }: { data: unknown }) => {
        invoiceData = data;
        return { id: 4, invoiceNumber: 1, organizationId: 7, propertyId: 2, items: [] };
      },
    },
    activityEvent: { create: async () => ({ id: 1 }) },
  };
  const caller = createCaller({
    lease: {
      findFirst: async () => ({
        id: 3,
        propertyId: 2,
        status: "active",
        billingResponsibility: "joint",
        tenants: [{ tenantId: 11 }, { tenantId: 12 }],
      }),
    },
    leaseTenant: {
      findFirst: async () => ({ id: 1 }),
    },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });

  await caller.invoices.createManual({
    propertyId: 2,
    leaseId: 3,
    tenantId: 12,
    dueOn: new Date("2026-09-15"),
    paidCents: 0,
    items: [{ item: "Rent", quantity: 1, rateCents: 10_000 }],
  });

  assert.deepEqual((invoiceData as { recipients: unknown }).recipients, {
    create: [
      { organizationId: 7, tenantId: 11 },
      { organizationId: 7, tenantId: 12 },
    ],
  });
});

test("manual invoices derive a lease tenant with invoice create permission alone", async () => {
  let invoiceData: { tenantId: number; recipients: unknown } | undefined;
  const tx = {
    invoice: {
      findFirst: async () => null,
      create: async ({ data }: { data: typeof invoiceData }) => {
        invoiceData = data;
        return { id: 4, invoiceNumber: 1, organizationId: 7, propertyId: 2, items: [] };
      },
    },
    activityEvent: { create: async () => ({ id: 1 }) },
  };
  const caller = appRouter.createCaller({
    prisma: {
      rolePermission: {
        findUnique: async ({ where }: { where: { role_resource: { resource: string } } }) =>
          where.role_resource.resource === "invoices" ? { canCreate: true } : null,
      },
      lease: {
        findFirst: async ({ where }: { where: unknown }) => {
          assert.deepEqual(where, { id: 3, organizationId: 7 });
          return {
            id: 3,
            propertyId: 2,
            status: "active",
            billingResponsibility: "individual",
            tenants: [{ tenantId: 11 }],
          };
        },
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    },
    session: { user: { id: 1, role: "property_manager" } },
    organization: { organizationId: 7 },
  } as unknown as Context);
  const input = {
    propertyId: 2,
    leaseId: 3,
    dueOn: new Date("2026-09-15"),
    paidCents: 0,
    items: [{ item: "Rent", quantity: 1, rateCents: 10_000 }],
  };

  await caller.invoices.createManual(input);
  assert.equal(invoiceData?.tenantId, 11);
  assert.deepEqual(invoiceData?.recipients, { create: [{ organizationId: 7, tenantId: 11 }] });
  await assert.rejects(() => caller.invoices.createManual({ ...input, tenantId: 99 }), {
    code: "BAD_REQUEST",
    message: "The selected tenant is not on this lease.",
  });
});

test("manual invoices cannot be created for draft leases", async () => {
  const caller = createCaller({
    lease: {
      findFirst: async () => ({ id: 3, propertyId: 2, status: "draft" }),
    },
  });

  await assert.rejects(
    () =>
      caller.invoices.createManual({
        propertyId: 2,
        leaseId: 3,
        tenantId: 12,
        dueOn: new Date("2026-09-15"),
        paidCents: 0,
        items: [{ item: "Rent", quantity: 1, rateCents: 10_000 }],
      }),
    { code: "BAD_REQUEST", message: "Draft leases cannot receive invoices." },
  );
});

test("invoice reads scope overdue synchronization to the active organization", async () => {
  for (const operation of ["list", "byId", "pdf"] as const) {
    const updates: Array<{ where: { organizationId: number } }> = [];
    const caller = createCaller({
      invoice: {
        updateMany: async (query: { where: { organizationId: number } }) => {
          updates.push(query);
          return { count: 0 };
        },
        findMany: async () => [],
        findFirst: async () => null,
      },
    });
    if (operation === "list") await caller.invoices.list({});
    else if (operation === "byId") await caller.invoices.byId({ id: 4 });
    else
      await assert.rejects(
        caller.invoices.pdf({ id: 4 }),
        (error) => error instanceof TRPCError && error.code === "NOT_FOUND",
      );
    assert.equal(updates.length, 2, operation);
    assert.deepEqual(
      updates.map(({ where }) => where.organizationId),
      [7, 7],
      operation,
    );
  }
});
