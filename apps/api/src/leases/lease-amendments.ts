import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { LeaseStatus, type Prisma } from "@parcelis/db";
import {
  formatInvoiceChargeDescription,
  hasInvoicePaymentHistory,
  leaseTenantBillingStepSchema,
  planLeaseRentCharges,
  type LeaseAmendmentInput,
  type MonthlyRentChargePlan,
} from "@parcelis/schemas";
import { TRPCError } from "@trpc/server";
import { createLeaseRentInvoices } from "./lease-rent-invoices";

const amendableLeaseStatuses: LeaseStatus[] = [LeaseStatus.active, LeaseStatus.notice, LeaseStatus.scheduled];

export function leaseOverlapWhere(
  organizationId: number,
  unitId: number,
  startsOn: Date,
  endsOn: Date | null,
  exceptId?: number,
): Prisma.LeaseWhereInput {
  return {
    organizationId,
    unitId,
    ...(exceptId ? { id: { not: exceptId } } : {}),
    status: { in: amendableLeaseStatuses },
    ...(endsOn ? { startsOn: { lte: endsOn } } : {}),
    OR: [{ endsOn: null }, { endsOn: { gte: startsOn } }],
  };
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function calendarDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

export function leaseRosterWhere(date: string): Prisma.LeaseTenantWhereInput {
  const on = calendarDate(date);
  return {
    AND: [
      { OR: [{ assignedOn: null }, { assignedOn: { lte: on } }] },
      { OR: [{ removedOn: null }, { removedOn: { gt: on } }] },
    ],
  };
}

export function leaseAmendmentHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

export async function markRentInvoiceIssued(
  prisma: Pick<Prisma.TransactionClient, "invoice">,
  invoice: {
    id: number;
    organizationId: number;
    sourceKey: string | null;
    issuedAt: Date | null;
    updatedAt: Date;
    billingRevision: number | null;
  },
) {
  if (!invoice.sourceKey?.startsWith("rent:") || invoice.issuedAt) return;
  const updated = await prisma.invoice.updateMany({
    where: {
      id: invoice.id,
      organizationId: invoice.organizationId,
      updatedAt: invoice.updatedAt,
      billingRevision: invoice.billingRevision,
    },
    data: { issuedAt: new Date() },
  });
  if (updated.count !== 1) {
    throw new TRPCError({ code: "CONFLICT", message: "This invoice changed. Download it again." });
  }
}

const invoiceSelect = {
  id: true,
  invoiceNumber: true,
  tenantId: true,
  sourceKey: true,
  periodStartsOn: true,
  periodEndsOn: true,
  dueOn: true,
  amountCents: true,
  balanceCents: true,
  status: true,
  paidOn: true,
  paidByTenantId: true,
  paymentMethod: true,
  issuedAt: true,
  updatedAt: true,
  recipients: { orderBy: { tenantId: "asc" }, select: { tenantId: true } },
  _count: { select: { payments: true, notes: true } },
} satisfies Prisma.InvoiceSelect;

type RentInvoice = Prisma.InvoiceGetPayload<{ select: typeof invoiceSelect }>;

function sameCharge(invoice: RentInvoice, charge: MonthlyRentChargePlan) {
  return (
    invoice.tenantId === charge.primaryTenantId &&
    dateOnly(invoice.periodStartsOn) === charge.periodStartsOn &&
    dateOnly(invoice.periodEndsOn) === charge.periodEndsOn &&
    dateOnly(invoice.dueOn) === charge.dueOn &&
    invoice.amountCents === charge.amountCents &&
    isDeepStrictEqual(
      invoice.recipients.map(({ tenantId }) => tenantId),
      charge.recipientTenantIds,
    )
  );
}

export async function planLeaseAmendment(
  tx: Prisma.TransactionClient,
  organizationId: number,
  today: string,
  input: LeaseAmendmentInput,
) {
  const lease = await tx.lease.findFirst({
    where: { id: input.leaseId, organizationId },
    include: {
      property: { select: { status: true } },
      unit: { select: { archivedAt: true } },
      tenants: { where: leaseRosterWhere(today), orderBy: { tenantId: "asc" } },
    },
  });
  if (!lease) throw new TRPCError({ code: "NOT_FOUND", message: "Lease not found." });
  if (lease.revision !== input.expectedRevision) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This lease changed. Reload it and preview the amendment again.",
    });
  }
  if (
    !amendableLeaseStatuses.includes(lease.status) ||
    lease.archivedAt ||
    !lease.startsOn ||
    !lease.monthlyRentCents ||
    !lease.propertyId ||
    !lease.unitId ||
    !lease.unit ||
    !lease.property ||
    lease.property.status === "archived" ||
    lease.unit.archivedAt
  ) {
    badRequest("Select a finalized lease with an active property and unit.");
  }

  const startsOn = dateOnly(lease.startsOn);
  const oldEnd = lease.endsOn ? dateOnly(lease.endsOn) : null;
  if (
    input.effectiveOn < today ||
    input.effectiveOn < startsOn ||
    (input.effectiveOn !== startsOn && !input.effectiveOn.endsWith("-01"))
  ) {
    badRequest("Choose the lease start date or the first day of a future billing month.");
  }
  const priorEffective = lease.amendmentEffectiveOn && dateOnly(lease.amendmentEffectiveOn);
  if (priorEffective && (priorEffective > today || input.effectiveOn <= priorEffective)) {
    badRequest("Choose an effective date after the previous amendment has taken effect.");
  }
  if (lease.termType === "fixed" ? !input.endsOn : input.endsOn !== null) {
    badRequest("An end date is required for a fixed-term lease and must be empty for a month-to-month lease.");
  }
  if (input.endsOn && input.endsOn < input.effectiveOn)
    badRequest("The lease end date cannot precede the effective date.");
  if (oldEnd && input.effectiveOn.slice(0, 7) > oldEnd.slice(0, 7)) {
    badRequest("Choose an effective date within the existing lease term.");
  }
  const endsOn = input.endsOn ? calendarDate(input.endsOn) : null;
  if (
    await tx.lease.findFirst({
      where: leaseOverlapWhere(organizationId, lease.unitId, lease.startsOn, endsOn, lease.id),
      select: { id: true },
    })
  ) {
    throw new TRPCError({ code: "CONFLICT", message: "The amended lease overlaps another lease for this unit." });
  }

  const billing = leaseTenantBillingStepSchema.safeParse({
    ...input,
    securityDepositCents: lease.securityDepositCents,
    allowPartialPayments: lease.allowPartialPayments,
  });
  if (!billing.success) badRequest(billing.error.issues[0]?.message ?? "Check the resident allocations.");
  const eligible = await tx.tenant.count({
    where: { organizationId, archivedAt: null, id: { in: input.tenantIds } },
  });
  if (eligible !== input.tenantIds.length) badRequest("Select eligible, unarchived residents in this organization.");

  const before = {
    endsOn: oldEnd,
    monthlyRentCents: lease.monthlyRentCents,
    rentDueDay: lease.rentDueDay,
    billingResponsibility: lease.billingResponsibility ?? "joint",
    tenantIds: lease.tenants.map(({ tenantId }) => tenantId),
    tenantAllocations: lease.tenants.flatMap(({ tenantId, rentShareCents, depositShareCents }) =>
      rentShareCents === null ? [] : [{ tenantId, rentShareCents, depositShareCents: depositShareCents ?? 0 }],
    ),
  };
  const after = {
    endsOn: input.endsOn,
    monthlyRentCents: input.monthlyRentCents,
    rentDueDay: input.rentDueDay,
    billingResponsibility: input.billingResponsibility,
    tenantIds: [...input.tenantIds].sort((a, b) => a - b),
    tenantAllocations: [...input.tenantAllocations].sort((a, b) => a.tenantId - b.tenantId),
  };
  if (isDeepStrictEqual(before, after)) badRequest("Change at least one lease term or resident.");

  let schedule: MonthlyRentChargePlan[];
  try {
    schedule = planLeaseRentCharges({ ...after, startsOn });
  } catch (error) {
    badRequest(error instanceof Error ? error.message : "Invalid rent schedule.");
  }
  const charges = schedule.filter(({ periodStartsOn }) => periodStartsOn >= input.effectiveOn);
  if (!charges.length) badRequest("Choose an effective date within the generated rent schedule.");
  const invoices = await tx.invoice.findMany({
    where: { organizationId, leaseId: lease.id, periodEndsOn: { gte: calendarDate(input.effectiveOn) } },
    select: invoiceSelect,
    orderBy: { id: "asc" },
  });
  const desired = new Map(charges.map((charge) => [charge.sourceKey, charge]));
  const changes: Array<{ invoice: RentInvoice | null; charge: MonthlyRentChargePlan | null }> = [];
  for (const invoice of invoices) {
    if (!invoice.sourceKey?.startsWith("rent:")) continue;
    const charge = desired.get(invoice.sourceKey) ?? null;
    desired.delete(invoice.sourceKey);
    if (charge && sameCharge(invoice, charge)) continue;
    if (
      invoice.issuedAt ||
      invoice.status !== "open" ||
      hasInvoicePaymentHistory(invoice, invoice._count.payments) ||
      invoice._count.notes ||
      dateOnly(invoice.periodStartsOn) < input.effectiveOn ||
      dateOnly(invoice.dueOn) <= today
    ) {
      badRequest(
        `Invoice #${invoice.invoiceNumber} is protected because it was issued, is due, or has billing history.`,
      );
    }
    changes.push({ invoice, charge });
  }
  for (const charge of desired.values()) changes.push({ invoice: null, charge });

  const edited = changes.flatMap(({ invoice }) => (invoice ? [invoice.id] : []));
  if (
    edited.length &&
    (await tx.activityEvent.findFirst({
      where: { organizationId, subjectType: "invoice", subjectId: { in: edited }, action: "invoice.updated" },
      select: { id: true },
    }))
  ) {
    badRequest("A manually edited invoice would change. Choose a later effective date.");
  }
  const remaining = invoices.filter(({ id }) => !edited.includes(id));
  for (const { charge } of changes) {
    if (!charge) continue;
    if (charge.dueOn <= today)
      badRequest("The revised rent would be due today or earlier. Choose a later effective date.");
    if (
      remaining.some(
        (invoice) =>
          invoice.tenantId === charge.primaryTenantId && dateOnly(invoice.periodStartsOn) === charge.periodStartsOn,
      )
    ) {
      badRequest("The revised rent schedule conflicts with an existing invoice.");
    }
  }

  const rentCharge = changes.some(({ charge }) => charge)
    ? await tx.invoiceCharge.findFirst({
        where: lease.rentChargeId ? { organizationId, id: lease.rentChargeId } : { organizationId, isDefault: true },
        select: { name: true, description: true },
      })
    : null;
  if (changes.some(({ charge }) => charge) && !rentCharge)
    badRequest("Configure a rent charge before amending this lease.");
  return {
    leaseId: lease.id,
    propertyId: lease.propertyId,
    before,
    after,
    endsOn,
    effectiveOn: calendarDate(input.effectiveOn),
    revision: lease.revision + 1,
    rentCharge,
    changes,
  };
}

type AmendmentPlan = Awaited<ReturnType<typeof planLeaseAmendment>>;

export async function applyLeaseAmendment(
  tx: Prisma.TransactionClient,
  organizationId: number,
  today: string,
  plan: AmendmentPlan,
) {
  const { leaseId, propertyId, before, after, effectiveOn, revision, changes, rentCharge } = plan;
  const updated = await tx.lease.updateMany({
    where: {
      id: leaseId,
      organizationId,
      revision: revision - 1,
      archivedAt: null,
      status: { in: amendableLeaseStatuses },
    },
    data: {
      revision,
      amendmentEffectiveOn: effectiveOn,
      endsOn: plan.endsOn,
      monthlyRentCents: after.monthlyRentCents,
      rentDueDay: after.rentDueDay,
      billingResponsibility: after.billingResponsibility,
    },
  });
  if (updated.count !== 1) throw new TRPCError({ code: "CONFLICT", message: "This lease changed. Preview it again." });

  const removed = before.tenantIds.filter((id) => !after.tenantIds.includes(id));
  if (removed.length)
    await tx.leaseTenant.updateMany({
      where: { organizationId, leaseId, tenantId: { in: removed } },
      data: { removedOn: effectiveOn },
    });
  const allocations = new Map(after.tenantAllocations.map((allocation) => [allocation.tenantId, allocation]));
  for (const tenantId of after.tenantIds) {
    const allocation = allocations.get(tenantId);
    const shares = {
      rentShareCents: allocation?.rentShareCents ?? null,
      depositShareCents: allocation?.depositShareCents ?? null,
    };
    const assignment = before.tenantIds.includes(tenantId)
      ? shares
      : { ...shares, assignedOn: effectiveOn, removedOn: null };
    await tx.leaseTenant.upsert({
      where: { organizationId_leaseId_tenantId: { organizationId, leaseId, tenantId } },
      create: { organizationId, leaseId, tenantId, assignedOn: effectiveOn, ...shares },
      update: assignment,
    });
  }

  const dropped = changes.flatMap(({ invoice, charge }) => (invoice && !charge ? [invoice.id] : []));
  if (dropped.length) await tx.invoice.deleteMany({ where: { organizationId, leaseId, id: { in: dropped } } });
  if (!rentCharge) return;

  for (const { invoice, charge } of changes) {
    if (!invoice || !charge) continue;
    await tx.invoice.update({
      where: { id: invoice.id, organizationId },
      data: {
        tenantId: charge.primaryTenantId,
        dueOn: calendarDate(charge.dueOn),
        periodStartsOn: calendarDate(charge.periodStartsOn),
        periodEndsOn: calendarDate(charge.periodEndsOn),
        amountCents: charge.amountCents,
        balanceCents: charge.amountCents,
        status: charge.amountCents === 0 ? "paid" : "open",
        billingRevision: revision,
        recipients: {
          deleteMany: {},
          createMany: { data: charge.recipientTenantIds.map((tenantId) => ({ organizationId, tenantId })) },
        },
        items: {
          deleteMany: {},
          create: {
            item: rentCharge.name,
            description: formatInvoiceChargeDescription(rentCharge.description, charge.periodStartsOn),
            quantity: 1,
            rateCents: charge.amountCents,
            amountCents: charge.amountCents,
          },
        },
      },
    });
  }
  const added = changes.flatMap(({ invoice, charge }) => (!invoice && charge ? [charge] : []));
  await createLeaseRentInvoices(tx, {
    organizationId,
    leaseId,
    propertyId,
    billingRevision: revision,
    today,
    charges: added,
    item: rentCharge.name,
    description: rentCharge.description,
  });
}

export function summarizeLeaseAmendment(plan: AmendmentPlan) {
  return plan.changes.map(({ invoice, charge }) => ({
    sourceKey: charge?.sourceKey ?? invoice!.sourceKey!,
    invoiceNumber: invoice?.invoiceNumber ?? null,
    periodStartsOn: charge?.periodStartsOn ?? dateOnly(invoice!.periodStartsOn),
    beforeDueOn: invoice ? dateOnly(invoice.dueOn) : null,
    dueOn: charge?.dueOn ?? null,
    recipientTenantIds: charge?.recipientTenantIds ?? [],
    beforeCents: invoice?.amountCents ?? null,
    afterCents: charge?.amountCents ?? null,
  }));
}
