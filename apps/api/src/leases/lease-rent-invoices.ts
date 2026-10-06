import type { Prisma } from "@parcelis/db";
import type { MonthlyRentChargePlan } from "@parcelis/schemas";

// Input type for creating lease rent invoices.
type CreateLeaseRentInvoicesInput = {
  organizationId: number;
  leaseId: number;
  propertyId: number;
  billingRevision: number;
  today: string;
  charges: MonthlyRentChargePlan[];
};

function calendarDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

// Creates lease rent invoices based on the provided charge plan.
export async function createLeaseRentInvoices(tx: Prisma.TransactionClient, input: CreateLeaseRentInvoicesInput) {
  const invoices = [];
  const recipients: Prisma.InvoiceRecipientCreateManyInput[] = [];
  const items: Prisma.InvoiceItemCreateManyInput[] = [];

  for (const charge of input.charges) {
    const invoice = await tx.invoice.create({
      data: {
        organizationId: input.organizationId,
        leaseId: input.leaseId,
        propertyId: input.propertyId,
        tenantId: charge.primaryTenantId,
        sourceKey: charge.sourceKey,
        billingRevision: input.billingRevision,
        periodStartsOn: calendarDate(charge.periodStartsOn),
        periodEndsOn: calendarDate(charge.periodEndsOn),
        dueOn: calendarDate(charge.dueOn),
        amountCents: charge.amountCents,
        balanceCents: charge.amountCents,
        status: charge.amountCents === 0 ? "paid" : charge.dueOn < input.today ? "overdue" : "open",
      },
    });
    recipients.push(
      ...charge.recipientTenantIds.map((tenantId) => ({
        organizationId: input.organizationId,
        invoiceId: invoice.id,
        tenantId,
      })),
    );
    items.push({
      invoiceId: invoice.id,
      item: "Rent",
      quantity: 1,
      rateCents: charge.amountCents,
      amountCents: charge.amountCents,
    });
    invoices.push(invoice);
  }

  if (invoices.length > 0) {
    await tx.invoiceRecipient.createMany({ data: recipients });
    await tx.invoiceItem.createMany({ data: items });
  }

  return invoices;
}

export async function getLeaseRentInvoiceSummary(
  tx: Prisma.TransactionClient,
  organizationId: number,
  leaseId: number,
  billingRevision: number,
) {
  const result = await tx.invoice.aggregate({
    where: { organizationId, leaseId, billingRevision, sourceKey: { startsWith: "rent:" } },
    _count: { _all: true },
    _sum: { amountCents: true },
  });
  return { invoiceCount: result._count._all, rentTotalCents: result._sum.amountCents ?? 0 };
}
