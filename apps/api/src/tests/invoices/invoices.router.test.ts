import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../../router/app.router";
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

test("joint invoice accepts a payment from any recipient", async () => {
  let paymentData: unknown;
  const invoice = {
    id: 4,
    invoiceNumber: 1,
    organizationId: 7,
    propertyId: 2,
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

test("manual invoices create a recipient for their selected tenant", async () => {
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
      findFirst: async () => ({ id: 3, propertyId: 2 }),
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
    create: {
      organizationId: 7,
      tenantId: 12,
    },
  });
});
