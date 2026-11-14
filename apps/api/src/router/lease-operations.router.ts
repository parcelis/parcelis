import { ActivitySubjectType, Prisma } from "@parcelis/db";
import { getCalendarDate } from "@parcelis/jobs";
import {
  leaseByIdInputSchema,
  leaseEditInputSchema,
  leaseEditTenantsInputSchema,
  leaseRenewInputSchema,
  leaseTerminateInputSchema,
  type PermissionAction,
} from "@parcelis/schemas";
import { TRPCError } from "@trpc/server";
import { requirePermission } from "../modules/permissions";
import { organizationProcedure, router } from "./trpc";

const permitted = (action: PermissionAction) =>
  organizationProcedure.use(async ({ ctx, next }) => {
    await requirePermission(ctx.prisma, ctx.user.role, "leases", "view");
    await requirePermission(ctx.prisma, ctx.user.role, "leases", action);
    return next();
  });

async function getLease(tx: Prisma.TransactionClient, organizationId: number, id: number, revision?: number) {
  const lease = await tx.lease.findFirst({
    where: { id, organizationId },
    include: { tenants: true, renewal: { select: { id: true, leaseDraftKey: true, status: true } } },
  });
  if (!lease) throw new TRPCError({ code: "NOT_FOUND", message: "Lease not found." });
  if (revision !== undefined && lease.revision !== revision) {
    throw new TRPCError({ code: "CONFLICT", message: "This lease changed. Close the dialog, reload, and try again." });
  }
  return lease;
}

function editable(lease: { status: string; archivedAt: Date | null }) {
  if (lease.archivedAt || lease.status === "ended" || lease.status === "draft") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Use Resume draft for drafts. Ended or archived leases cannot be edited.",
    });
  }
}

async function event(
  tx: Prisma.TransactionClient,
  lease: { id: number; organizationId: number; propertyId: number | null },
  actor: { id: string | number; name: string },
  action: string,
  metadata: Prisma.InputJsonObject,
) {
  await tx.activityEvent.create({
    data: {
      organizationId: lease.organizationId,
      subjectType: ActivitySubjectType.lease,
      subjectId: lease.id,
      subjectLabel: `Lease #${lease.id}`,
      propertyId: lease.propertyId,
      actorId: String(actor.id),
      actorLabel: actor.name,
      action,
      metadata,
    },
  });
}

export const leaseOperationsRouter = router({
  details: permitted("view")
    .input(leaseByIdInputSchema)
    .query(({ ctx, input }) => getLease(ctx.prisma, ctx.organization.organizationId, input.id)),

  edit: permitted("edit")
    .input(leaseEditInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.$transaction(
        async (tx) => {
          const lease = await getLease(tx, ctx.organization.organizationId, input.id, input.expectedRevision);
          editable(lease);
          if (input.endsOn?.getTime() !== lease.endsOn?.getTime()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Use Renew Lease or Terminate to change contract dates and reconcile billing.",
            });
          }
          if (
            input.continueMonthToMonthAfterEnd &&
            (lease.termType !== "fixed" || lease.status === "notice" || lease.renewal)
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Only a fixed lease without a termination notice or linked renewal can continue month to month.",
            });
          }
          if (input.continueMonthToMonthAfterEnd && !lease.continueMonthToMonthAfterEnd) {
            const successor = await tx.lease.findFirst({
              where: {
                organizationId: lease.organizationId,
                unitId: lease.unitId,
                id: { not: lease.id },
                status: { in: ["active", "notice", "scheduled"] },
                OR: [{ endsOn: null }, { endsOn: { gt: lease.endsOn ?? new Date(0) } }],
              },
              select: { id: true },
            });
            if (successor)
              throw new TRPCError({
                code: "CONFLICT",
                message: "Month-to-month continuation would overlap another lease for this unit.",
              });
          }
          await tx.lease.update({
            where: { id: lease.id },
            data: {
              allowPartialPayments: input.allowPartialPayments,
              continueMonthToMonthAfterEnd: input.continueMonthToMonthAfterEnd,
              revision: { increment: 1 },
            },
          });
          await event(tx, lease, ctx.user, "lease.updated", {
            previousAllowPartialPayments: lease.allowPartialPayments,
            allowPartialPayments: input.allowPartialPayments,
            previousContinueMonthToMonthAfterEnd: lease.continueMonthToMonthAfterEnd,
            continueMonthToMonthAfterEnd: input.continueMonthToMonthAfterEnd,
          });
          return { id: lease.id };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    ),

  editTenants: permitted("edit")
    .input(leaseEditTenantsInputSchema)
    .mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.prisma, ctx.user.role, "tenants", "view");
      return ctx.prisma.$transaction(
        async (tx) => {
          const organizationId = ctx.organization.organizationId;
          const lease = await getLease(tx, organizationId, input.id, input.expectedRevision);
          editable(lease);
          const previous = lease.tenants.map(({ tenantId }) => tenantId);
          const added = input.tenantIds.filter((id) => !previous.includes(id));
          const removed = previous.filter((id) => !input.tenantIds.includes(id));
          if (lease.billingResponsibility === "individual" && (added.length || removed.length)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Individual billing allocations are part of the signed contract. Use a renewal to change residents and their shares.",
            });
          }
          const count = await tx.tenant.count({
            where: { id: { in: input.tenantIds }, organizationId, archivedAt: null },
          });
          if (count !== input.tenantIds.length)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Select residents from this organization who are not archived.",
            });
          const referenced = await tx.invoice.count({
            where: {
              leaseId: lease.id,
              OR: [{ tenantId: { in: removed } }, { recipients: { some: { tenantId: { in: removed } } } }],
            },
          });
          if (referenced)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "A resident with invoice history cannot be removed. Keep their historical assignment and use a renewal for the new household.",
            });
          await tx.leaseTenant.deleteMany({ where: { organizationId, leaseId: lease.id, tenantId: { in: removed } } });
          if (added.length)
            await tx.leaseTenant.createMany({
              data: added.map((tenantId) => ({ organizationId, leaseId: lease.id, tenantId })),
            });
          await tx.lease.update({ where: { id: lease.id }, data: { revision: { increment: 1 } } });
          await event(tx, lease, ctx.user, "lease.tenants_updated", {
            previousTenantIds: previous,
            tenantIds: input.tenantIds,
          });
          return { id: lease.id };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    }),

  renew: permitted("create")
    .input(leaseRenewInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.$transaction(
        async (tx) => {
          await requirePermission(ctx.prisma, ctx.user.role, "leases", "edit");
          const organizationId = ctx.organization.organizationId;
          const lease = await getLease(tx, organizationId, input.id, input.expectedRevision);
          if (lease.renewal) return lease.renewal;
          if (
            lease.archivedAt ||
            lease.status === "draft" ||
            lease.termType !== "fixed" ||
            !lease.endsOn ||
            lease.continueMonthToMonthAfterEnd
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Renew a fixed lease with an end date. End any month-to-month continuation first.",
            });
          }
          if (input.startsOn <= lease.endsOn)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "The renewal must start after the existing lease ends.",
            });
          const unitDraft = await tx.lease.findFirst({
            where: { organizationId, unitId: lease.unitId, status: "draft", archivedAt: null },
            select: { id: true },
          });
          if (unitDraft) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "This unit already has an unfinished lease. Resume, archive, or delete that draft before creating a renewal.",
            });
          }
          const renewal = await tx.lease.create({
            data: {
              organizationId,
              renewedFromId: lease.id,
              propertyId: lease.propertyId,
              unitId: lease.unitId,
              monthlyRentCents: lease.monthlyRentCents,
              rentChargeId: lease.rentChargeId,
              securityDepositCents: lease.securityDepositCents,
              billingResponsibility: lease.billingResponsibility,
              allowPartialPayments: lease.allowPartialPayments,
              rentDueDay: lease.rentDueDay,
              termType: lease.termType,
              startsOn: input.startsOn,
              draftStep: "terms",
              tenants: {
                create: lease.tenants.map(({ tenantId, rentShareCents, depositShareCents }) => ({
                  organizationId,
                  tenantId,
                  rentShareCents,
                  depositShareCents,
                })),
              },
            },
            select: { id: true, leaseDraftKey: true, status: true },
          });
          await tx.lease.update({ where: { id: lease.id }, data: { revision: { increment: 1 } } });
          await event(tx, lease, ctx.user, "lease.renewal_started", { renewalId: renewal.id });
          await event(tx, { ...lease, id: renewal.id }, ctx.user, "lease.created", { renewedFromId: lease.id });
          return renewal;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    ),

  terminate: permitted("edit")
    .input(leaseTerminateInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.$transaction(
        async (tx) => {
          const organizationId = ctx.organization.organizationId;
          const lease = await getLease(tx, organizationId, input.id, input.expectedRevision);
          editable(lease);
          if (lease.renewal)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Resolve the linked renewal before terminating this lease.",
            });
          if (lease.endsOn && !lease.continueMonthToMonthAfterEnd && input.endsOn > lease.endsOn)
            throw new TRPCError({ code: "BAD_REQUEST", message: "Termination cannot extend the lease." });
          if (lease.startsOn && input.endsOn < lease.startsOn && lease.status !== "scheduled") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "The termination date cannot precede the lease start.",
            });
          }
          const futureInvoices = await tx.invoice.findMany({
            where: {
              organizationId,
              leaseId: lease.id,
              status: { not: "void" },
              periodStartsOn: { gt: input.endsOn },
            },
            include: { _count: { select: { payments: true } } },
          });
          if (futureInvoices.length > 0) {
            await requirePermission(ctx.prisma, ctx.user.role, "invoices", "edit");
          }
          if (
            futureInvoices.some(
              (invoice) =>
                invoice._count.payments > 0 ||
                invoice.paidOn ||
                invoice.balanceCents !== invoice.amountCents ||
                invoice.status === "paid",
            )
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "A future invoice has payments or adjustments. Resolve its credit/refund before terminating.",
            });
          }
          if (futureInvoices.length > 0) {
            await tx.invoice.updateMany({
              where: { id: { in: futureInvoices.map(({ id }) => id) } },
              data: { status: "void", balanceCents: 0 },
            });
          }
          for (const invoice of futureInvoices)
            await tx.activityEvent.create({
              data: {
                organizationId,
                subjectType: ActivitySubjectType.invoice,
                subjectId: invoice.id,
                subjectLabel: `Invoice #${invoice.invoiceNumber}`,
                propertyId: lease.propertyId,
                action: "invoice.voided",
                actorId: String(ctx.user.id),
                actorLabel: ctx.user.name,
                metadata: { reason: "Lease termination", leaseId: lease.id },
              },
            });
          const organization = await tx.organization.findUniqueOrThrow({
            where: { id: organizationId },
            select: { timeZone: true },
          });
          const today = getCalendarDate(new Date(), organization.timeZone);
          const endsImmediately =
            input.endsOn.toISOString().slice(0, 10) < today ||
            (lease.status === "scheduled" && lease.startsOn && input.endsOn < lease.startsOn);
          const status = endsImmediately ? "ended" : lease.status === "scheduled" ? "scheduled" : "notice";
          await tx.lease.update({
            where: { id: lease.id },
            data: {
              endsOn: input.endsOn,
              termType: "fixed",
              continueMonthToMonthAfterEnd: false,
              status,
              revision: { increment: 1 },
            },
          });
          if (endsImmediately && (lease.status === "active" || lease.status === "notice") && lease.propertyId) {
            const released = await tx.property.updateMany({
              where: { id: lease.propertyId, organizationId, occupiedUnits: { gt: 0 } },
              data: { occupiedUnits: { decrement: 1 } },
            });
            if (released.count !== 1)
              throw new TRPCError({
                code: "CONFLICT",
                message: "Occupancy is inconsistent. Reload before terminating.",
              });
          }
          await event(tx, lease, ctx.user, "lease.termination_recorded", {
            previousStatus: lease.status,
            nextStatus: status,
            reason: input.reason,
            endsOn: input.endsOn.toISOString(),
            previousEndsOn: lease.endsOn?.toISOString() ?? null,
            finalPeriodPolicy: input.finalPeriodPolicy,
            voidedInvoiceIds: futureInvoices.map(({ id }) => id),
          });
          return { id: lease.id };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    ),
});
