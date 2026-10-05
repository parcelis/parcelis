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

  // Iterate over each charge in the input and create an invoice for it.
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
        recipients: {
          create: charge.recipientTenantIds.map((tenantId) => ({
            organizationId: input.organizationId,
            tenantId,
          })),
        },
        items: {
          create: {
            item: "Rent",
            quantity: 1,
            rateCents: charge.amountCents,
            amountCents: charge.amountCents,
          },
        },
      },
      include: { items: true },
    });
    invoices.push(invoice);
  }

  return invoices;
}
