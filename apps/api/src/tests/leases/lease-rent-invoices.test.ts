import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@parcelis/db";
import { planLeaseRentCharges } from "@parcelis/schemas";
import { createLeaseRentInvoices } from "../../leases/lease-rent-invoices";

test("writes each planned rent charge with its identity, item, and recipients", async () => {
  const writes: Record<string, unknown>[] = [];
  const recipientWrites: unknown[] = [];
  const itemWrites: unknown[] = [];
  const tx = {
    invoice: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        return { id: writes.length, invoiceNumber: writes.length, organizationId: 7, propertyId: 2 };
      },
    },
    invoiceRecipient: { createMany: async ({ data }: { data: unknown }) => recipientWrites.push(data) },
    invoiceItem: { createMany: async ({ data }: { data: unknown }) => itemWrites.push(data) },
  } as unknown as Prisma.TransactionClient;
  const charges = planLeaseRentCharges({
    monthlyRentCents: 120_000,
    rentDueDay: 1,
    startsOn: "2027-04-16",
    endsOn: "2027-05-31",
    billingResponsibility: "joint",
    tenantIds: [12, 11],
    tenantAllocations: [],
  });

  const invoices = await createLeaseRentInvoices(tx, {
    organizationId: 7,
    leaseId: 9,
    propertyId: 2,
    item: "Base Rent",
    description: "Apartment rent for {month} {year}",
    billingRevision: 1,
    today: "2027-04-20",
    charges,
  });

  assert.equal(invoices.length, 2);
  assert.deepEqual(writes[0], {
    organizationId: 7,
    leaseId: 9,
    propertyId: 2,
    tenantId: 11,
    sourceKey: "rent:2027-04:joint",
    billingRevision: 1,
    periodStartsOn: new Date("2027-04-16T00:00:00.000Z"),
    periodEndsOn: new Date("2027-04-30T00:00:00.000Z"),
    dueOn: new Date("2027-04-16T00:00:00.000Z"),
    amountCents: 60_000,
    balanceCents: 60_000,
    status: "overdue",
  });
  assert.deepEqual(recipientWrites[0], [
    { organizationId: 7, invoiceId: 1, tenantId: 11 },
    { organizationId: 7, invoiceId: 1, tenantId: 12 },
    { organizationId: 7, invoiceId: 2, tenantId: 11 },
    { organizationId: 7, invoiceId: 2, tenantId: 12 },
  ]);
  assert.deepEqual(itemWrites[0], [
    {
      invoiceId: 1,
      item: "Base Rent",
      description: "Apartment rent for April 2027",
      quantity: 1,
      rateCents: 60_000,
      amountCents: 60_000,
    },
    {
      invoiceId: 2,
      item: "Base Rent",
      description: "Apartment rent for May 2027",
      quantity: 1,
      rateCents: 120_000,
      amountCents: 120_000,
    },
  ]);
  assert.equal(recipientWrites.length, 1);
  assert.equal(itemWrites.length, 1);
  assert.equal(writes[1]?.sourceKey, "rent:2027-05:joint");
  assert.equal(writes[1]?.status, "open");
});

test("a zero-cent individual charge still creates an invoice", async () => {
  const writes: Record<string, unknown>[] = [];
  const tx = {
    invoice: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        return { id: writes.length };
      },
    },
    invoiceRecipient: { createMany: async () => ({ count: 1 }) },
    invoiceItem: { createMany: async () => ({ count: 4 }) },
  } as unknown as Prisma.TransactionClient;
  const charges = planLeaseRentCharges({
    monthlyRentCents: 100,
    rentDueDay: 1,
    startsOn: "2027-04-30",
    endsOn: "2027-05-31",
    billingResponsibility: "individual",
    tenantIds: [1, 2],
    tenantAllocations: [
      { tenantId: 1, rentShareCents: 99 },
      { tenantId: 2, rentShareCents: 1 },
    ],
  });

  await createLeaseRentInvoices(tx, {
    organizationId: 7,
    leaseId: 9,
    propertyId: 2,
    item: "Rent",
    description: "Monthly rent",
    billingRevision: 1,
    today: "2027-04-30",
    charges,
  });

  assert.equal(writes.length, 4);
  assert.equal(writes[1]?.sourceKey, "rent:2027-04:tenant:2");
  assert.equal(writes[1]?.amountCents, 0);
  assert.equal(writes[1]?.status, "paid");
});
