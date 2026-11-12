import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@parcelis/db";
import { appRouter, getMonthlyDueDate } from "../../router/app.router";
import type { Context } from "../../router/context";

function createCaller(prisma: unknown) {
  return appRouter.createCaller({
    prisma,
    session: { user: { id: 1, name: "Administrator", role: "administrator" } },
    organization: { organizationId: 7, organization: { timeZone: "UTC" } },
  } as unknown as Context);
}

const paymentInput = {
  id: 4,
  amountCents: 5_000,
  paidOn: new Date("2026-09-14"),
  paidByTenantId: 12,
  paymentMethod: "check" as const,
};

test("settling an outstanding invoice restores the latest unreversed payment details", async () => {
  const payment = { paidOn: new Date("2026-09-15"), tenantId: 99, paymentMethod: "cash" };
  let paymentLookups = 0;
  const tx = {
    invoice: {
      findFirstOrThrow: async () => ({ amountCents: 15_000, balanceCents: 5_000 }),
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        id: 4,
        invoiceNumber: 4,
        organizationId: 7,
        propertyId: 2,
        ...data,
      }),
    },
    invoicePayment: {
      findFirst: async (args: unknown) => {
        paymentLookups += 1;
        assert.deepEqual(args, {
          where: { invoiceId: 4, organizationId: 7, reversedAt: null },
          orderBy: [{ paidOn: "desc" }, { id: "desc" }],
          select: { paidOn: true, tenantId: true, paymentMethod: true },
        });
        return payment;
      },
    },
    activityEvent: { create: async () => ({}) },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });
  const updated = await caller.invoices.update({
    id: 4,
    dueOn: new Date("2030-01-01"),
    items: [{ item: "Rent", quantity: 1, rateCents: 10_000 }],
  });
  assert.equal(paymentLookups, 1);
  assert.equal(updated.balanceCents, 0);
  assert.equal(updated.status, "paid");
  assert.equal(updated.paidOn, payment.paidOn);
  assert.equal(updated.paidByTenantId, payment.tenantId);
  assert.equal(updated.paymentMethod, payment.paymentMethod);
});

for (const totalCents of [10_000, 15_000]) {
  test(`editing a paid invoice to ${totalCents} cents keeps settlement metadata consistent`, async () => {
    const invoice = {
      id: 4,
      invoiceNumber: 4,
      organizationId: 7,
      propertyId: 2,
      amountCents: 10_000,
      balanceCents: 0,
      status: "paid",
      paidOn: new Date("2026-09-14"),
      paidByTenantId: 12,
      paymentMethod: "check",
    };
    const tx = {
      invoice: {
        findFirstOrThrow: async ({ where }: { where: unknown }) => {
          assert.deepEqual(where, { id: 4, organizationId: 7 });
          return invoice;
        },
        update: async ({ data }: { data: Record<string, unknown> }) => ({ ...invoice, ...data }),
      },
      activityEvent: { create: async () => ({}) },
      invoicePayment: {
        findFirst: async () => ({
          paidOn: new Date("2026-09-15"),
          tenantId: 99,
          paymentMethod: "cash",
        }),
      },
    };
    const caller = createCaller({
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>, options: unknown) => {
        assert.deepEqual(options, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return callback(tx);
      },
    });

    const updated = await caller.invoices.update({
      id: 4,
      dueOn: new Date("2030-01-01"),
      items: [{ item: "Rent", quantity: 1, rateCents: totalCents }],
    });

    const remainsPaid = totalCents === 10_000;
    assert.equal(updated.balanceCents, totalCents - 10_000);
    assert.equal(updated.status, remainsPaid ? "paid" : "open");
    assert.equal(updated.paidOn, remainsPaid ? invoice.paidOn : null);
    assert.equal(updated.paidByTenantId, remainsPaid ? invoice.paidByTenantId : null);
    assert.equal(updated.paymentMethod, remainsPaid ? invoice.paymentMethod : null);
  });
}

for (const [label, amountCents, status] of [
  ["an unpaid invoice", 10_000, "open"],
  ["a zero-cent paid invoice", 0, "paid"],
] as const) {
  test(`invoice deletion allows ${label} without payment history`, async () => {
    let deleted = false;
    const tx = {
      invoice: {
        findFirstOrThrow: async ({ where }: { where: unknown }) => {
          assert.deepEqual(where, { id: 4, organizationId: 7 });
          return {
            id: 4,
            amountCents,
            balanceCents: amountCents,
            paidOn: null,
            paidByTenantId: null,
            paymentMethod: null,
            status,
            _count: { payments: 0 },
          };
        },
        delete: async () => {
          deleted = true;
          return { id: 4 };
        },
      },
    };
    const caller = createCaller({
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>, options: unknown) => {
        assert.deepEqual(options, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return callback(tx);
      },
    });

    assert.deepEqual(await caller.invoices.delete({ id: 4 }), { id: 4 });
    assert.equal(deleted, true);
  });
}

for (const [label, changes] of [
  ["payment records", { _count: { payments: 1 } }],
  ["a legacy partial payment", { balanceCents: 5_000 }],
  ["a fully paid invoice", { status: "paid", balanceCents: 0 }],
  [
    "a zero-cent invoice with payment records",
    { amountCents: 0, balanceCents: 0, status: "paid", _count: { payments: 1 } },
  ],
  ["a settlement date", { paidOn: new Date("2026-09-14") }],
  ["a recorded payer", { paidByTenantId: 12 }],
  ["a payment method", { paymentMethod: "check" }],
] as const) {
  test(`invoice deletion rejects ${label}`, async () => {
    let deleted = false;
    const tx = {
      invoice: {
        findFirstOrThrow: async () => ({
          id: 4,
          amountCents: 10_000,
          balanceCents: 10_000,
          paidOn: null,
          paidByTenantId: null,
          paymentMethod: null,
          status: "open",
          _count: { payments: 0 },
          ...changes,
        }),
        delete: async () => {
          deleted = true;
        },
      },
    };
    const caller = createCaller({
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    });
    await assert.rejects(caller.invoices.delete({ id: 4 }), {
      code: "BAD_REQUEST",
      message: "Invoices with payment history cannot be deleted.",
    });
    assert.equal(deleted, false);
  });
}

test("invoice deletion reports a concurrent write as a conflict", async () => {
  const caller = createCaller({
    $transaction: async () => {
      throw new Prisma.PrismaClientKnownRequestError("serialization conflict", {
        code: "P2034",
        clientVersion: "test",
      });
    },
  });
  await assert.rejects(caller.invoices.delete({ id: 4 }), {
    code: "CONFLICT",
    message: "This invoice changed while deleting. Please try again.",
  });
});

test("invoice deletion requires permission before reading the invoice", async () => {
  const caller = appRouter.createCaller({
    prisma: { rolePermission: { findUnique: async () => null } },
    session: { user: { id: 1, role: "property_manager" } },
    organization: { organizationId: 7, organization: { timeZone: "UTC" } },
  } as unknown as Context);
  await assert.rejects(caller.invoices.delete({ id: 4 }), { code: "FORBIDDEN" });
});

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
    create: [{ tenantId: 11 }, { tenantId: 12 }],
  });
});

test("manual invoices derive the earliest lease tenant with invoice create permission alone", async () => {
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
        findFirst: async ({ where, select }: { where: unknown; select: { tenants: unknown } }) => {
          assert.deepEqual(where, { id: 3, organizationId: 7 });
          assert.deepEqual(select.tenants, {
            orderBy: [{ createdAt: "asc" }, { tenantId: "asc" }],
            select: { tenantId: true },
          });
          return {
            id: 3,
            propertyId: 2,
            status: "active",
            billingResponsibility: "individual",
            tenants: [{ tenantId: 12 }, { tenantId: 11 }],
          };
        },
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    },
    session: { user: { id: 1, role: "property_manager" } },
    organization: { organizationId: 7, organization: { timeZone: "UTC" } },
  } as unknown as Context);
  const input = {
    propertyId: 2,
    leaseId: 3,
    dueOn: new Date("2026-09-15"),
    paidCents: 0,
    items: [{ item: "Rent", quantity: 1, rateCents: 10_000 }],
  };

  await caller.invoices.createManual(input);
  assert.equal(invoiceData?.tenantId, 12);
  assert.deepEqual(invoiceData?.recipients, { create: [{ tenantId: 12 }] });
  await caller.invoices.createManual({ ...input, tenantId: 11 });
  assert.equal(invoiceData?.tenantId, 11);
  assert.deepEqual(invoiceData?.recipients, { create: [{ tenantId: 11 }] });
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
    const updates: Array<{ where: { organizationId: number }; data: { status: string } }> = [];
    const caller = createCaller({
      invoice: {
        updateMany: async (query: { where: { organizationId: number }; data: { status: string } }) => {
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
    assert.equal(updates.length, 3, operation);
    assert.deepEqual(
      updates.find(({ data }) => data.status === "paid"),
      { where: { organizationId: 7, status: { in: ["open", "overdue"] }, balanceCents: 0 }, data: { status: "paid" } },
      operation,
    );
    assert.deepEqual(
      updates.map(({ where }) => where.organizationId),
      [7, 7, 7],
      operation,
    );
  }
});

test("invoice directory uses organization-scoped recipients without filtering historical leases", async () => {
  for (const tenantId of [undefined, 12]) {
    const rows = [
      { id: 41, leaseId: 3, amountCents: 12345, balanceCents: 12345, status: "overdue" },
      { id: 42, leaseId: 4, amountCents: 6789, balanceCents: 0, status: "paid" },
      { id: 43, leaseId: 5, amountCents: 123, balanceCents: 123, status: "void" },
    ];
    const caller = createCaller({
      invoice: {
        updateMany: async () => ({ count: 0 }),
        findMany: async ({ where }: { where: unknown }) => {
          assert.deepEqual(where, {
            organizationId: 7,
            ...(tenantId ? { recipients: { some: { tenantId } } } : {}),
          });
          return rows.map((row) => ({ ...row, lease: { unit: { name: "101" } } }));
        },
      },
    });
    const result = await caller.invoices.list(tenantId ? { tenantId } : {});
    assert.deepEqual(
      result.map(({ id, amountCents, balanceCents }) => ({ id, amountCents, balanceCents })),
      rows.map(({ id, amountCents, balanceCents }) => ({ id, amountCents, balanceCents })),
    );
    assert.equal(result.length, 3);
  }
});
