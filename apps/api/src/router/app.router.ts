import {
  createManualInvoiceInputSchema,
  createPropertyInputSchema,
  createLeaseInputSchema,
  deleteInvoiceInputSchema,
  deleteInvoicePaymentInputSchema,
  invoiceByIdInputSchema,
  invoiceListInputSchema,
  recordInvoicePaymentInputSchema,
  recordInvoicePaymentsInputSchema,
  activityEventListInputSchema,
  isActiveMaintenanceTicketStatus,
  createMaintenanceTicketInputSchema,
  maintenanceAttachmentByIdInputSchema,
  maintenanceImageUploadCompleteInputSchema,
  maintenanceImageUploadInputSchema,
  maintenanceTicketByIdInputSchema,
  updateMaintenanceTicketStatusInputSchema,
  updateMaintenanceTicketInputSchema,
  createTenantInputSchema,
  createTagInputSchema,
  createUnitInputSchema,
  createNoteInputSchema,
  deleteNoteInputSchema,
  noteListInputSchema,
  propertyByIdInputSchema,
  propertyImageUploadCompleteInputSchema,
  propertyImageUploadInputSchema,
  propertyNotesInputSchema,
  propertyStatusInputSchema,
  tenantByIdInputSchema,
  tenantImageUploadCompleteInputSchema,
  tenantImageUploadInputSchema,
  tenantNotesInputSchema,
  updateEmergencyContactInputSchema,
  updateInvoiceInputSchema,
  updateTenantInputSchema,
  listUnitsInputSchema,
  type UnitDetailsInput,
  unitByIdInputSchema,
  updateUnitInputSchema,
  updateAmenityInputSchema,
  updateNoteInputSchema,
  updatePropertyInputSchema,
  updateUserInputSchema,
  userAccountStatusInputSchema,
  deleteUserInputSchema,
  switchOrganizationInputSchema,
  updateOrganizationInputSchema,
  organizationAvatarUploadCompleteInputSchema,
  organizationAvatarUploadInputSchema,
} from "@parcelis/schemas";
import {
  ActivitySubjectType,
  LeaseStatus,
  MaintenanceTicketStatus,
  Prisma,
  PrismaClient,
  UnitType,
  type UserRole,
} from "@parcelis/db";
import { TRPCError } from "@trpc/server";
import {
  createPropertyImageDownloadUrl,
  createOrganizationAvatarUploadUrl,
  createPropertyImageUploadUrl,
  createMaintenanceImageDownloadUrl,
  createMaintenanceImageUploadUrl,
  deletePropertyImageObject,
  deleteMaintenanceImageObject,
  createTenantImageDownloadUrl,
  createTenantImageUploadUrl,
  deleteTenantImageObject,
  getPublicObjectStorageConfig,
} from "../modules/object-storage.config";
import { authRouter } from "./auth.router";
import { requireAdministrator, requireOrganizationAdministrator } from "../modules/authorization";
import { organizationProcedure, organizationProcedure as publicProcedure, router } from "./trpc";

const propertySelect = {
  id: true,
  name: true,
  line1: true,
  line2: true,
  city: true,
  region: true,
  postalCode: true,
  propertyType: true,
  imageObjectKey: true,
  tags: { select: { id: true, label: true, sortOrder: true } },
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  contactAddress: true,
  legacyNotes: true,
  legacyNoteId: true,
  unitCount: true,
  occupiedUnits: true,
  status: true,
} as const;

const unitStatuses: Array<"vacant" | LeaseStatus> = ["vacant", ...Object.values(LeaseStatus)];

function formatUnitType(unitType: UnitDetailsInput["unitType"]) {
  return unitType === "Commercial" ? UnitType.commercial : UnitType.residential;
}

function maintenanceStatusAction(previousStatus: MaintenanceTicketStatus, nextStatus: MaintenanceTicketStatus) {
  if (previousStatus === "new" && nextStatus === "in_progress") return "maintenance.acknowledged";
  if (previousStatus === "resolved" && nextStatus === "in_progress") return "maintenance.reopened";
  if (nextStatus === "resolved") return "maintenance.resolved";
  if (nextStatus === "canceled") return "maintenance.canceled";
  return "maintenance.status_changed";
}

async function recordMaintenanceStatusEvent(
  tx: Prisma.TransactionClient,
  ticket: { id: number; organizationId: number; propertyId: number; ticketNumber: number; title: string },
  previousStatus: MaintenanceTicketStatus,
  nextStatus: MaintenanceTicketStatus,
) {
  if (previousStatus === nextStatus) return;

  await tx.activityEvent.create({
    data: {
      organizationId: ticket.organizationId,
      subjectType: ActivitySubjectType.maintenance_ticket,
      subjectId: ticket.id,
      subjectLabel: ticket.title,
      subjectReference: `MNT-${ticket.ticketNumber.toString().padStart(7, "0")}`,
      propertyId: ticket.propertyId,
      action: maintenanceStatusAction(previousStatus, nextStatus),
      previousStatus,
      nextStatus,
    },
  });
}

async function recordInvoiceActivity(
  tx: Prisma.TransactionClient,
  invoice: { id: number; invoiceNumber: number; organizationId: number; propertyId: number },
  action: string,
  metadata?: Prisma.InputJsonValue,
  actor?: { id: string | number; name: string },
) {
  await tx.activityEvent.create({
    data: {
      organizationId: invoice.organizationId,
      subjectType: ActivitySubjectType.invoice,
      subjectId: invoice.id,
      subjectLabel: `Invoice ${invoice.invoiceNumber}`,
      subjectReference: `INV-${invoice.invoiceNumber.toString().padStart(7, "0")}`,
      propertyId: invoice.propertyId,
      action,
      metadata,
      actorId: actor ? String(actor.id) : null,
      actorLabel: actor?.name ?? null,
    },
  });
}

function withPropertyNotes<T extends { legacyNotes: string | null }>(property: T) {
  return { ...property, notes: property.legacyNotes };
}

async function synchronizePropertyLegacyNote(
  tx: Prisma.TransactionClient,
  propertyId: number,
  legacyNoteId: number | null,
  notes: string | undefined,
) {
  const body = notes?.trim() || null;

  if (!body) {
    if (legacyNoteId) {
      await tx.note.deleteMany({ where: { id: legacyNoteId, propertyId } });
    }
    return { legacyNoteId: null, legacyNotes: null };
  }

  if (legacyNoteId) {
    const updatedNote = await tx.note.updateMany({
      where: { id: legacyNoteId, propertyId },
      data: { body },
    });
    if (updatedNote.count) {
      return { legacyNoteId, legacyNotes: body };
    }
  }

  const legacyNote = await tx.note.create({
    data: { propertyId, body },
    select: { id: true },
  });
  return { legacyNoteId: legacyNote.id, legacyNotes: body };
}

function getUnitCreateData(propertyId: number, unitDetails: UnitDetailsInput) {
  return {
    propertyId,
    name: unitDetails.name,
    marketRateCents: unitDetails.marketRateCents,
    unitType: formatUnitType(unitDetails.unitType),
    bedrooms: unitDetails.bedrooms,
    bathrooms: unitDetails.bathrooms,
    squareFeet: unitDetails.squareFeet,
    utilities: {
      create: unitDetails.utilityTypeIds.map((optionId) => ({
        option: { connect: { id: optionId } },
      })),
    },
    amenities: {
      create: unitDetails.amenityTypeIds.map((optionId) => ({
        option: { connect: { id: optionId } },
      })),
    },
  };
}

function getUnitUpdateData(unitDetails: UnitDetailsInput) {
  return {
    name: unitDetails.name,
    marketRateCents: unitDetails.marketRateCents,
    unitType: formatUnitType(unitDetails.unitType),
    bedrooms: unitDetails.bedrooms,
    bathrooms: unitDetails.bathrooms,
    squareFeet: unitDetails.squareFeet,
    utilities: {
      create: unitDetails.utilityTypeIds.map((optionId) => ({
        option: { connect: { id: optionId } },
      })),
    },
    amenities: {
      create: unitDetails.amenityTypeIds.map((optionId) => ({
        option: { connect: { id: optionId } },
      })),
    },
  };
}

function serializeUnit<
  T extends {
    bathrooms: unknown;
    amenities: Array<{ option: { id: number } }>;
    utilities: Array<{ option: { id: number } }>;
  },
>(unit: T) {
  return {
    ...unit,
    bathrooms: unit.bathrooms === null ? null : Number(unit.bathrooms),
    amenityTypeIds: unit.amenities.map((amenity) => amenity.option.id),
    utilityTypeIds: unit.utilities.map((utility) => utility.option.id),
  };
}

function withOperatingMetrics<
  T extends {
    leases: Array<{
      monthlyRentCents: number;
      amountOverdueCents: number;
      endsOn: Date | null;
      status: string;
      unitLabel: string;
    }>;
    maintenanceTickets: Array<{
      priority: string;
      status: string;
      unitLabel: string | null;
    }>;
  },
>(property: T) {
  const now = new Date();
  const expiresBefore = new Date(now);
  expiresBefore.setDate(expiresBefore.getDate() + 90);
  const activeLeases = property.leases.filter((lease) => lease.status === "active" || lease.status === "notice");
  const openMaintenanceTickets = property.maintenanceTickets.filter((ticket) =>
    isActiveMaintenanceTicketStatus(ticket.status),
  ).length;
  const urgentMaintenanceTickets = property.maintenanceTickets.filter(
    (ticket) => ticket.priority === "urgent" && ticket.status !== "resolved",
  ).length;

  return {
    ...property,
    monthlyRentCents: activeLeases.reduce((sum, lease) => sum + lease.monthlyRentCents, 0),
    amountOverdueCents: activeLeases.reduce((sum, lease) => sum + lease.amountOverdueCents, 0),
    expiringLeases90Days: activeLeases.filter(
      (lease) => lease.endsOn !== null && lease.endsOn >= now && lease.endsOn <= expiresBefore,
    ).length,
    openMaintenanceTickets,
    urgentMaintenanceTickets,
  };
}

function getTenantStatus(tenant: { archivedAt: Date | null; leases: Array<{ status: LeaseStatus }> }) {
  if (tenant.archivedAt) {
    return "archived";
  }

  return tenant.leases.some((lease) => lease.status === "active" || lease.status === "notice") ? "active" : "past";
}

function getInvoiceStatus(dueOn: Date, balanceCents: number) {
  if (balanceCents === 0) return "paid" as const;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return dueOn < today ? ("overdue" as const) : ("open" as const);
}

async function synchronizeOverdueInvoices(prisma: PrismaClient | Prisma.TransactionClient) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await Promise.all([
    prisma.invoice.updateMany({
      where: { status: "open", balanceCents: { gt: 0 }, dueOn: { lt: today } },
      data: { status: "overdue" },
    }),
    prisma.invoice.updateMany({
      where: { status: "overdue", OR: [{ balanceCents: 0 }, { dueOn: { gte: today } }] },
      data: { status: "open" },
    }),
  ]);
}

async function generateInitialLeaseInvoices(
  tx: Prisma.TransactionClient,
  lease: {
    id: number;
    propertyId: number;
    tenantId: number;
    organizationId: number;
    monthlyRentCents: number;
    startsOn: Date;
    endsOn: Date | null;
  },
) {
  const firstPeriod = new Date(lease.startsOn.getFullYear(), lease.startsOn.getMonth(), 1);
  const periods = [firstPeriod, new Date(firstPeriod.getFullYear(), firstPeriod.getMonth() + 1, 1)];

  await Promise.all(
    periods
      .filter((periodStartsOn) => lease.endsOn === null || periodStartsOn <= lease.endsOn)
      .map((periodStartsOn) =>
        tx.invoice.upsert({
          where: { leaseId_periodStartsOn: { leaseId: lease.id, periodStartsOn } },
          update: {},
          create: {
            organizationId: lease.organizationId,
            leaseId: lease.id,
            propertyId: lease.propertyId,
            tenantId: lease.tenantId,
            periodStartsOn,
            periodEndsOn: new Date(periodStartsOn.getFullYear(), periodStartsOn.getMonth() + 1, 0),
            dueOn: periodStartsOn,
            amountCents: lease.monthlyRentCents,
            balanceCents: lease.monthlyRentCents,
            items: {
              create: {
                item: "Rent",
                description: `Rent for ${periodStartsOn.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
                quantity: 1,
                rateCents: lease.monthlyRentCents,
                amountCents: lease.monthlyRentCents,
              },
            },
          },
        }),
      ),
  );
}

function getEmergencyContact(input: {
  emergencyContactFirstName?: string;
  emergencyContactLastName?: string;
  emergencyContactPhone?: string;
}) {
  const firstName = input.emergencyContactFirstName?.trim();
  const lastName = input.emergencyContactLastName?.trim();
  const phone = input.emergencyContactPhone?.trim();

  if (!firstName && !lastName && !phone) return null;

  return {
    firstName: firstName || "Emergency",
    lastName: lastName || "contact",
    phone: phone || null,
    isPrimary: true,
  };
}

async function assertActiveAdministratorCanBeRemoved(prisma: PrismaClient | Prisma.TransactionClient, userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountStatus: true } });
  if (user?.role !== "administrator" || user.accountStatus !== "active") return;

  const activeAdministratorCount = await prisma.user.count({
    where: { role: "administrator", accountStatus: "active" },
  });
  if (activeAdministratorCount <= 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "At least one active administrator is required." });
  }
}

export const appRouter = router({
  auth: authRouter,
  organizations: router({
    list: publicProcedure.query(({ ctx }) =>
      ctx.prisma.organizationMembership.findMany({
        where: { userId: ctx.user.id },
        select: {
          role: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { organization: { name: "asc" } },
      }),
    ),
    active: organizationProcedure.query(async ({ ctx }) => ({
      id: ctx.organization.organization.id,
      name: ctx.organization.organization.name,
      slug: ctx.organization.organization.slug,
      avatarObjectKey: ctx.organization.organization.avatarObjectKey,
      avatarUrl: await createPropertyImageDownloadUrl(ctx.organization.organization.avatarObjectKey),
      role: ctx.organization.role,
    })),
    switch: publicProcedure.input(switchOrganizationInputSchema).mutation(async ({ ctx, input }) => {
      const membership = await ctx.prisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: ctx.user.id, organizationId: input.organizationId } },
        select: { organizationId: true },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Organization access is required." });
      await ctx.prisma.session.update({ where: { id: ctx.session.id }, data: { activeOrganizationId: membership.organizationId } });
      return { organizationId: membership.organizationId };
    }),
    update: organizationProcedure.input(updateOrganizationInputSchema).mutation(({ ctx, input }) => {
      requireOrganizationAdministrator(ctx.organization.role);
      return ctx.prisma.organization.update({
        where: { id: ctx.organization.organizationId },
        data: { name: input.name },
        select: { id: true, name: true, slug: true },
      });
    }),
    createAvatarUploadUrl: organizationProcedure.input(organizationAvatarUploadInputSchema).mutation(({ ctx, input }) => {
      requireOrganizationAdministrator(ctx.organization.role);
      return createOrganizationAvatarUploadUrl(input.contentType, ctx.organization.organizationId);
    }),
    completeAvatarUpload: organizationProcedure.input(organizationAvatarUploadCompleteInputSchema).mutation(({ ctx, input }) => {
      requireOrganizationAdministrator(ctx.organization.role);
      return ctx.prisma.organization.update({
        where: { id: ctx.organization.organizationId },
        data: { avatarObjectKey: input.objectKey },
        select: { id: true, avatarObjectKey: true },
      });
    }),
  }),
  users: router({
    /** Lists accounts that can access this workspace. */
    list: publicProcedure.query(({ ctx }) => {
      requireAdministrator(ctx.user.role as UserRole);
      return ctx.prisma.user.findMany({
        select: { id: true, name: true, email: true, phone: true, role: true, accountStatus: true },
        orderBy: { createdAt: "asc" },
      });
    }),
    update: publicProcedure.input(updateUserInputSchema).mutation(async ({ ctx, input }) => {
      requireAdministrator(ctx.user.role as UserRole);
      try {
        return await ctx.prisma.$transaction(
          async (tx) => {
            if (input.role !== "administrator") await assertActiveAdministratorCanBeRemoved(tx, input.id);
            return tx.user.update({
              where: { id: input.id },
              data: { ...input, phone: input.phone || null },
              select: { id: true, name: true, email: true, phone: true, role: true, accountStatus: true },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new TRPCError({ code: "CONFLICT", message: "An account already uses this email address." });
        }
        throw error;
      }
    }),
    updateAccountStatus: publicProcedure.input(userAccountStatusInputSchema).mutation(async ({ ctx, input }) => {
      requireAdministrator(ctx.user.role as UserRole);
      if (input.accountStatus === "disabled") {
        return ctx.prisma.$transaction(
          async (tx) => {
            await assertActiveAdministratorCanBeRemoved(tx, input.id);
            return tx.user.update({
              where: { id: input.id },
              data: { accountStatus: input.accountStatus },
              select: { id: true, accountStatus: true },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      }
      return ctx.prisma.user.update({
        where: { id: input.id },
        data: { accountStatus: input.accountStatus },
        select: { id: true, accountStatus: true },
      });
    }),
    delete: publicProcedure.input(deleteUserInputSchema).mutation(({ ctx, input }) => {
      requireAdministrator(ctx.user.role as UserRole);
      return ctx.prisma.$transaction(
        async (tx) => {
          await assertActiveAdministratorCanBeRemoved(tx, input.id);
          return tx.user.delete({ where: { id: input.id }, select: { id: true } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    }),
  }),
  /** Reports API health and the public object-storage configuration. */
  health: publicProcedure.query(() => ({
    status: "ok",
    service: "parcelis-api",
    objectStorage: getPublicObjectStorageConfig(),
  })),

  properties: router({
    /** Lists up to 50 properties with units, lease metrics, and maintenance metrics. */
    list: publicProcedure.query(async ({ ctx }) => {
      await synchronizeOverdueInvoices(ctx.prisma);
      const properties = await ctx.prisma.property.findMany({
        where: { organizationId: ctx.organization.organizationId },
        include: {
          tags: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
          invoices: {
            select: { leaseId: true, balanceCents: true },
          },
          leases: {
            select: {
              monthlyRentCents: true,
              id: true,
              startsOn: true,
              amountOverdueCents: true,
              endsOn: true,
              status: true,
              unitLabel: true,
              tenant: {
                select: {
                  firstName: true,
                  id: true,
                  lastName: true,
                },
              },
              invoices: {
                orderBy: { dueOn: "asc" },
                select: {
                  id: true,
                  invoiceNumber: true,
                  dueOn: true,
                  paidOn: true,
                  status: true,
                  amountCents: true,
                  balanceCents: true,
                },
              },
            },
          },
          maintenanceTickets: {
            orderBy: { openedOn: "desc" },
            select: {
              id: true,
              ticketNumber: true,
              title: true,
              openedOn: true,
              dueOn: true,
              priority: true,
              status: true,
              unitLabel: true,
            },
          },
          units: {
            orderBy: { createdAt: "asc" },
            include: {
              amenities: {
                select: { option: { select: { id: true, label: true } } },
              },
              utilities: {
                select: { option: { select: { id: true, label: true } } },
              },
            },
          },
        },
        orderBy: { name: "asc" },
        take: 50,
      });

      return Promise.all(
        properties.map(async ({ invoices, ...property }) => {
          const balanceByLeaseId = new Map<number, number>();
          invoices.forEach((invoice) => {
            balanceByLeaseId.set(invoice.leaseId, (balanceByLeaseId.get(invoice.leaseId) ?? 0) + invoice.balanceCents);
          });
          return {
            ...withOperatingMetrics({
              ...withPropertyNotes({
                ...property,
                leases: property.leases.map((lease) => ({
                  ...lease,
                  amountOverdueCents: balanceByLeaseId.get(lease.id) ?? 0,
                })),
              }),
              units: property.units.map(serializeUnit),
            }),
            imageUrl: await createPropertyImageDownloadUrl(property.imageObjectKey),
          };
        }),
      );
    }),
    /** Returns one property with its units, leases, and maintenance tickets. */
    byId: publicProcedure.input(propertyByIdInputSchema).query(async ({ ctx, input }) => {
      const property = await ctx.prisma.property.findUnique({
        where: { id: input.id },
        include: {
          tags: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
          leases: {
            orderBy: { startsOn: "desc" },
            include: {
              tenant: true,
            },
          },
          maintenanceTickets: {
            orderBy: { openedOn: "desc" },
          },
          units: {
            orderBy: { createdAt: "asc" },
            include: {
              amenities: {
                select: { option: { select: { id: true, label: true } } },
              },
              utilities: {
                select: { option: { select: { id: true, label: true } } },
              },
            },
          },
        },
      });

      return property
        ? {
            ...withPropertyNotes(property),
            units: property.units.map(serializeUnit),
            unitStatuses,
            imageUrl: await createPropertyImageDownloadUrl(property.imageObjectKey),
          }
        : null;
    }),
    /** Creates a short-lived URL for uploading a property image to MinIO. */
    createImageUploadUrl: publicProcedure.input(propertyImageUploadInputSchema).mutation(async ({ ctx, input }) => {
      await ctx.prisma.property.findUniqueOrThrow({
        where: { id: input.id },
      });
      return createPropertyImageUploadUrl(input.contentType, input.id);
    }),
    /** Records a successfully uploaded image and removes the previous object. */
    completeImageUpload: publicProcedure
      .input(propertyImageUploadCompleteInputSchema)
      .mutation(async ({ ctx, input }) => {
        const currentProperty = await ctx.prisma.property.findUniqueOrThrow({
          where: { id: input.id },
          select: { imageObjectKey: true },
        });

        const property = await ctx.prisma.property.update({
          where: { id: input.id },
          data: { imageObjectKey: input.objectKey },
          select: propertySelect,
        });

        if (currentProperty.imageObjectKey && currentProperty.imageObjectKey !== input.objectKey) {
          await deletePropertyImageObject(currentProperty.imageObjectKey);
        }

        return withPropertyNotes(property);
      }),
    /** Removes the current image reference and its MinIO object. */
    deleteImage: publicProcedure.input(propertyByIdInputSchema).mutation(async ({ ctx, input }) => {
      const currentProperty = await ctx.prisma.property.findUniqueOrThrow({
        where: { id: input.id },
        select: { imageObjectKey: true },
      });
      const property = await ctx.prisma.property.update({
        where: { id: input.id },
        data: { imageObjectKey: null },
        select: propertySelect,
      });

      if (currentProperty.imageObjectKey) {
        await deletePropertyImageObject(currentProperty.imageObjectKey);
      }

      return withPropertyNotes(property);
    }),
    /** Creates a property and its initial units. */
    create: publicProcedure.input(createPropertyInputSchema).mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const initialProperty = await tx.property.create({
          select: propertySelect,
          data: {
            organizationId: ctx.organization.organizationId,
            name: input.name,
            line1: input.address.line1,
            line2: input.address.line2 ?? null,
            city: input.address.city,
            region: input.address.region,
            postalCode: input.address.postalCode,
            propertyType: input.propertyType,
            tags: { connect: input.tagIds.map((id) => ({ id })) },
            contactName: input.contactName ?? null,
            contactEmail: input.contactEmail ?? null,
            contactPhone: input.contactPhone ?? null,
            contactAddress: input.contactAddress ?? null,
            legacyNotes: null,
            unitCount: input.unitCount,
          },
        });

        const legacyNote = await synchronizePropertyLegacyNote(tx, initialProperty.id, null, input.notes);
        const property = legacyNote.legacyNoteId
          ? await tx.property.update({
              where: { id: initialProperty.id },
              select: propertySelect,
              data: legacyNote,
            })
          : initialProperty;

        await Promise.all(
          input.units.map((unit) =>
            tx.unit.create({
              data: getUnitCreateData(property.id, unit),
            }),
          ),
        );

        return withPropertyNotes(property);
      });
    }),
    /** Updates a property and synchronizes its units. */
    update: publicProcedure.input(updatePropertyInputSchema).mutation(async ({ ctx, input }) => {
      const property = await ctx.prisma.$transaction(async (tx) => {
        const currentProperty = await tx.property.findUniqueOrThrow({
          where: { id: input.id },
          select: { legacyNoteId: true },
        });
        const legacyNote =
          input.notes === undefined
            ? {}
            : await synchronizePropertyLegacyNote(tx, input.id, currentProperty.legacyNoteId, input.notes);
        const updatedProperty = await tx.property.update({
          where: { id: input.id },
          select: propertySelect,
          data: {
            name: input.name,
            line1: input.address.line1,
            line2: input.address.line2 ?? null,
            city: input.address.city,
            region: input.address.region,
            postalCode: input.address.postalCode,
            propertyType: input.propertyType,
            tags: { set: input.tagIds.map((id) => ({ id })) },
            contactName: input.contactName ?? null,
            contactEmail: input.contactEmail ?? null,
            contactPhone: input.contactPhone ?? null,
            contactAddress: input.contactAddress ?? null,
            ...legacyNote,
            unitCount: input.unitCount,
          },
        });
        const existingUnits = await tx.unit.findMany({
          where: { propertyId: input.id },
          select: { id: true },
        });
        const existingUnitIds = new Set(existingUnits.map((unit) => unit.id));
        const submittedExistingUnitIds = input.units
          .map((unit) => unit.id)
          .filter((unitId): unitId is number => Boolean(unitId && existingUnitIds.has(unitId)));

        await tx.unit.deleteMany({
          where: {
            propertyId: input.id,
            id: { notIn: submittedExistingUnitIds },
          },
        });

        await Promise.all(
          input.units.map(async (unit) => {
            if (unit.id && existingUnitIds.has(unit.id)) {
              await tx.unitUtility.deleteMany({
                where: { unitId: unit.id },
              });
              await tx.unitAmenity.deleteMany({ where: { unitId: unit.id } });
              await tx.unit.update({
                where: { id: unit.id },
                data: getUnitUpdateData(unit),
              });
              return;
            }

            await tx.unit.create({
              data: getUnitCreateData(input.id, unit),
            });
          }),
        );
        return updatedProperty;
      });

      return withPropertyNotes(property);
    }),
    /** Marks a property as archived. */
    archive: publicProcedure.input(propertyByIdInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.property
        .update({
          where: { id: input.id },
          select: propertySelect,
          data: { status: "archived" },
        })
        .then(withPropertyNotes),
    ),
    /** Marks a property as inactive. */
    inactivate: publicProcedure.input(propertyStatusInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.property
        .update({
          where: { id: input.id },
          select: propertySelect,
          data: { status: "archived" },
        })
        .then(withPropertyNotes),
    ),
    /** Restores an archived property to active status. */
    reactivate: publicProcedure.input(propertyStatusInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.property
        .update({
          where: { id: input.id },
          select: propertySelect,
          data: { status: "active" },
        })
        .then(withPropertyNotes),
    ),
    /** Permanently deletes a property and its related operational records. */
    delete: publicProcedure.input(propertyByIdInputSchema).mutation(async ({ ctx, input }) => {
      const property = await ctx.prisma.property.findUniqueOrThrow({
        where: { id: input.id },
        select: propertySelect,
      });

      await ctx.prisma.$transaction([
        ctx.prisma.maintenanceTicket.deleteMany({
          where: { propertyId: input.id },
        }),
        ctx.prisma.lease.deleteMany({ where: { propertyId: input.id } }),
        ctx.prisma.unit.deleteMany({ where: { propertyId: input.id } }),
        ctx.prisma.property.delete({ where: { id: input.id } }),
      ]);

      return withPropertyNotes(property);
    }),
    /** Updates the notes stored on a property. */
    updateNotes: publicProcedure.input(propertyNotesInputSchema).mutation(async ({ ctx, input }) => {
      const property = await ctx.prisma.$transaction(async (tx) => {
        const currentProperty = await tx.property.findUniqueOrThrow({
          where: { id: input.id },
          select: { legacyNoteId: true },
        });

        const legacyNote = await synchronizePropertyLegacyNote(tx, input.id, currentProperty.legacyNoteId, input.notes);

        return tx.property.update({
          where: { id: input.id },
          select: propertySelect,
          data: legacyNote,
        });
      });

      return withPropertyNotes(property);
    }),
  }),
  tenants: router({
    /** Lists tenants with their most recent lease first. */
    list: publicProcedure.query(async ({ ctx }) => {
      const tenants = await ctx.prisma.tenant.findMany({
        where: { organizationId: ctx.organization.organizationId },
        include: {
          emergencyContacts: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          },
          leases: {
            orderBy: { startsOn: "desc" },
            include: {
              property: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: 100,
      });

      return Promise.all(
        tenants.map(async (tenant) => ({
          ...tenant,
          imageUrl: await createTenantImageDownloadUrl(tenant.imageObjectKey),
          tenantStatus: getTenantStatus(tenant),
        })),
      );
    }),
    /** Returns one tenant with lease history. */
    byId: publicProcedure.input(tenantByIdInputSchema).query(async ({ ctx, input }) => {
      const tenant = await ctx.prisma.tenant.findUnique({
        where: { id: input.id },
        include: {
          emergencyContacts: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          },
          leases: {
            orderBy: { startsOn: "desc" },
            include: {
              property: {
                select: { id: true, name: true },
              },
              invoices: {
                orderBy: { periodStartsOn: "desc" },
              },
            },
          },
        },
      });

      return tenant
        ? {
            ...tenant,
            imageUrl: await createTenantImageDownloadUrl(tenant.imageObjectKey),
            tenantStatus: getTenantStatus(tenant),
          }
        : null;
    }),
    /** Creates a short-lived URL for uploading a tenant image to MinIO. */
    createImageUploadUrl: publicProcedure.input(tenantImageUploadInputSchema).mutation(async ({ ctx, input }) => {
      await ctx.prisma.tenant.findUniqueOrThrow({ where: { id: input.id } });
      return createTenantImageUploadUrl(input.contentType, input.id);
    }),
    /** Records a successfully uploaded tenant image and removes the previous object. */
    completeImageUpload: publicProcedure
      .input(tenantImageUploadCompleteInputSchema)
      .mutation(async ({ ctx, input }) => {
        const currentTenant = await ctx.prisma.tenant.findUniqueOrThrow({
          where: { id: input.id },
          select: { imageObjectKey: true },
        });
        const tenant = await ctx.prisma.tenant.update({
          where: { id: input.id },
          data: { imageObjectKey: input.objectKey },
        });

        if (currentTenant.imageObjectKey && currentTenant.imageObjectKey !== input.objectKey) {
          await deleteTenantImageObject(currentTenant.imageObjectKey);
        }

        return tenant;
      }),
    /** Removes the current tenant image reference and its MinIO object. */
    deleteImage: publicProcedure.input(tenantByIdInputSchema).mutation(async ({ ctx, input }) => {
      const currentTenant = await ctx.prisma.tenant.findUniqueOrThrow({
        where: { id: input.id },
        select: { imageObjectKey: true },
      });
      const tenant = await ctx.prisma.tenant.update({
        where: { id: input.id },
        data: { imageObjectKey: null },
      });

      if (currentTenant.imageObjectKey) {
        await deleteTenantImageObject(currentTenant.imageObjectKey);
      }

      return tenant;
    }),
    /** Archives a tenant without removing their lease history. */
    archive: publicProcedure.input(tenantByIdInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.tenant.update({
        where: { id: input.id },
        data: { archivedAt: new Date() },
      }),
    ),
    /** Restores an archived tenant to their lease-derived status. */
    reactivate: publicProcedure.input(tenantByIdInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.tenant.update({
        where: { id: input.id },
        data: { archivedAt: null },
      }),
    ),
    /** Updates tenant contact and account details. */
    create: publicProcedure.input(createTenantInputSchema).mutation(({ ctx, input }) => {
      const emergencyContact = getEmergencyContact(input);

      return ctx.prisma.tenant.create({
        data: {
          organizationId: ctx.organization.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone || null,
          emergencyContacts: emergencyContact ? { create: emergencyContact } : undefined,
          accountStatus: input.accountStatus,
          insuranceStatus: input.insuranceStatus,
        },
      });
    }),
    /** Updates tenant contact and account details. */
    update: publicProcedure.input(updateTenantInputSchema).mutation(({ ctx, input }) => {
      const emergencyContact = getEmergencyContact(input);

      return ctx.prisma.tenant.update({
        where: { id: input.id },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone || null,
          emergencyContacts: {
            deleteMany: {},
            ...(emergencyContact ? { create: emergencyContact } : {}),
          },
          accountStatus: input.accountStatus,
          insuranceStatus: input.insuranceStatus,
        },
      });
    }),
    /** Updates an emergency contact linked to a tenant. */
    updateEmergencyContact: publicProcedure.input(updateEmergencyContactInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.emergencyContact.update({
        where: { id: input.id },
        data: {
          firstName: input.firstName,
          lastName: input.lastName || null,
          phone: input.phone || null,
        },
      }),
    ),
    /** Updates the internal notes attached to a tenant. */
    updateNotes: publicProcedure.input(tenantNotesInputSchema).mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const currentTenant = await tx.tenant.findUniqueOrThrow({
          where: { id: input.id },
          select: { legacyNoteId: true },
        });

        if (input.notes) {
          const updatedNote = currentTenant.legacyNoteId
            ? await tx.note.updateMany({
                where: { id: currentTenant.legacyNoteId, tenantId: input.id },
                data: { body: input.notes },
              })
            : null;
          const legacyNote = updatedNote?.count
            ? { id: currentTenant.legacyNoteId! }
            : await tx.note.create({ data: { tenantId: input.id, body: input.notes }, select: { id: true } });

          return tx.tenant.update({
            where: { id: input.id },
            data: { legacyNotes: input.notes, legacyNoteId: legacyNote.id },
          });
        }

        if (currentTenant.legacyNoteId) {
          await tx.note.deleteMany({ where: { id: currentTenant.legacyNoteId, tenantId: input.id } });
        }

        return tx.tenant.update({
          where: { id: input.id },
          data: { legacyNotes: null, legacyNoteId: null },
        });
      });
    }),
    /** Creates a lease for a tenant and validates that the selected unit is available. */
    createLease: publicProcedure.input(createLeaseInputSchema).mutation(async ({ ctx, input }) => {
      try {
        return await ctx.prisma.$transaction(
          async (tx) => {
            await tx.tenant.findUniqueOrThrow({ where: { id: input.tenantId } });
            const property = await tx.property.findUniqueOrThrow({
              where: { id: input.propertyId },
              include: { units: { where: { name: input.unitLabel }, select: { id: true } } },
            });
            if (!property.units.length) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Select a unit belonging to the chosen property." });
            }
            const existingLease = await tx.lease.findFirst({
              where: {
                propertyId: input.propertyId,
                unitLabel: input.unitLabel,
                status: { in: [LeaseStatus.active, LeaseStatus.notice] },
              },
              select: { id: true },
            });
            if (existingLease) {
              throw new TRPCError({ code: "CONFLICT", message: "The selected unit already has an active lease." });
            }
            const lease = await tx.lease.create({ data: { ...input, organizationId: ctx.organization.organizationId } });
            if (input.status === LeaseStatus.active || input.status === LeaseStatus.notice) {
              await tx.property.update({
                where: { id: input.propertyId },
                data: { occupiedUnits: property.occupiedUnits + 1 },
              });
              await generateInitialLeaseInvoices(tx, lease);
            }
            return lease;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
          throw new TRPCError({ code: "CONFLICT", message: "The selected unit changed. Please try again." });
        }
        throw error;
      }
    }),
    /** Permanently deletes a tenant and their lease history. */
    delete: publicProcedure.input(tenantByIdInputSchema).mutation(async ({ ctx, input }) => {
      await ctx.prisma.$transaction(async (tx) => {
        const activeLeases = await tx.lease.groupBy({
          by: ["propertyId"],
          where: { tenantId: input.id, status: { in: [LeaseStatus.active, LeaseStatus.notice] } },
          _count: { _all: true },
        });
        await tx.lease.deleteMany({ where: { tenantId: input.id } });
        await Promise.all(
          activeLeases.map(({ propertyId, _count }) =>
            tx.property.update({
              where: { id: propertyId },
              data: { occupiedUnits: { decrement: _count._all } },
            }),
          ),
        );
        await tx.tenant.delete({ where: { id: input.id } });
      });
    }),
  }),
  invoices: router({
    list: publicProcedure.input(invoiceListInputSchema).query(async ({ ctx, input }) => {
      await synchronizeOverdueInvoices(ctx.prisma);
      return ctx.prisma.invoice.findMany({
        where: { organizationId: ctx.organization.organizationId, ...(input.tenantId ? { tenantId: input.tenantId } : {}) },
        include: { lease: { select: { unitLabel: true } }, property: { select: { id: true, name: true } } },
        orderBy: { dueOn: "desc" },
      });
    }),
    byId: publicProcedure.input(invoiceByIdInputSchema).query(async ({ ctx, input }) => {
      await synchronizeOverdueInvoices(ctx.prisma);
      return ctx.prisma.invoice.findUnique({
        where: { id: input.id },
        include: {
          property: { select: { id: true, name: true } },
          tenant: { select: { id: true, firstName: true, lastName: true } },
          lease: { select: { unitLabel: true, startsOn: true, endsOn: true } },
          items: { orderBy: { id: "asc" } },
          payments: {
            orderBy: { paidOn: "desc" },
            include: { tenant: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      });
    }),
    createManual: publicProcedure.input(createManualInvoiceInputSchema).mutation(async ({ ctx, input }) => {
      const lease = await ctx.prisma.lease.findUnique({
        where: { id: input.leaseId },
        select: { id: true, propertyId: true, tenantId: true },
      });
      if (!lease || lease.propertyId !== input.propertyId || lease.tenantId !== input.tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Select a lease for the chosen property and tenant." });
      }

      const amountCents = input.items.reduce((total, item) => total + item.quantity * item.rateCents, 0);
      if (amountCents <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An invoice must have a positive total." });
      }
      if (input.paidCents > amountCents) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already paid cannot exceed the invoice total." });
      }
      const dueOn = new Date(input.dueOn);
      dueOn.setUTCHours(0, 0, 0, 0);

      try {
        return await ctx.prisma.$transaction(async (tx) => {
          const existingInvoice = await tx.invoice.findUnique({
            where: { leaseId_periodStartsOn: { leaseId: lease.id, periodStartsOn: dueOn } },
            select: { invoiceNumber: true },
          });
          if (existingInvoice) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `An invoice already exists for this lease and billing date (INV-${existingInvoice.invoiceNumber.toString().padStart(7, "0")}).`,
            });
          }

          const invoice = await tx.invoice.create({
            data: {
              organizationId: ctx.organization.organizationId,
              leaseId: lease.id,
              propertyId: lease.propertyId,
              tenantId: lease.tenantId,
              periodStartsOn: dueOn,
              periodEndsOn: dueOn,
              dueOn,
              amountCents,
              balanceCents: amountCents - input.paidCents,
              status: getInvoiceStatus(dueOn, amountCents - input.paidCents),
              paidOn: input.paidCents === amountCents ? dueOn : null,
              items: {
                create: input.items.map((item) => ({
                  ...item,
                  description: item.description || null,
                  amountCents: item.quantity * item.rateCents,
                })),
              },
            },
            include: { items: true },
          });
          await recordInvoiceActivity(tx, invoice, "invoice.created");
          return invoice;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An invoice already exists for this lease and billing date.",
          });
        }
        throw error;
      }
    }),
    recordPayment: publicProcedure.input(recordInvoicePaymentInputSchema).mutation(async ({ ctx, input }) => {
      try {
        return await ctx.prisma.$transaction(
          async (tx) => {
            const invoice = await tx.invoice.findUniqueOrThrow({
              where: { id: input.id },
              select: {
                id: true,
                invoiceNumber: true,
                propertyId: true,
                dueOn: true,
                balanceCents: true,
                tenantId: true,
              },
            });
            if (input.paidByTenantId !== invoice.tenantId) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Select a tenant assigned to this unit." });
            }
            if (input.amountCents > invoice.balanceCents) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Payment cannot exceed the remaining balance." });
            }
            const balanceCents = invoice.balanceCents - input.amountCents;
            const payment = await tx.invoicePayment.create({
              data: {
                invoiceId: input.id,
                tenantId: input.paidByTenantId,
                amountCents: input.amountCents,
                paymentMethod: input.paymentMethod,
                paidOn: input.paidOn,
              },
            });
            const updatedInvoice = await tx.invoice.update({
              where: { id: input.id },
              data: {
                balanceCents,
                paidOn: balanceCents === 0 ? input.paidOn : null,
                paidByTenantId: balanceCents === 0 ? input.paidByTenantId : null,
                paymentMethod: balanceCents === 0 ? input.paymentMethod : null,
                status: getInvoiceStatus(invoice.dueOn, balanceCents),
              },
            });
            await recordInvoiceActivity(
              tx,
              updatedInvoice,
              "invoice.payment_recorded",
              {
                amountCents: input.amountCents,
                paymentMethod: input.paymentMethod,
                paidOn: input.paidOn.toISOString(),
                tenantId: input.paidByTenantId,
              },
              ctx.user,
            );
            return payment;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This invoice changed while recording the payment. Please try again.",
          });
        }
        throw error;
      }
    }),
    recordPayments: publicProcedure.input(recordInvoicePaymentsInputSchema).mutation(async ({ ctx, input }) => {
      try {
        return await ctx.prisma.$transaction(
          async (tx) => {
            const invoice = await tx.invoice.findUniqueOrThrow({
              where: { id: input.id },
              select: { dueOn: true, balanceCents: true, tenantId: true },
            });
            if (input.payments.some((payment) => payment.paidByTenantId !== invoice.tenantId)) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Select a tenant assigned to this unit." });
            }
            const paymentTotalCents = input.payments.reduce((total, payment) => total + payment.amountCents, 0);
            if (paymentTotalCents > invoice.balanceCents) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Payments cannot exceed the remaining balance." });
            }
            const balanceCents = invoice.balanceCents - paymentTotalCents;
            const latestPayment = input.payments.reduce((latest, payment) =>
              payment.paidOn >= latest.paidOn ? payment : latest,
            );
            const payments = [];
            for (const payment of input.payments) {
              payments.push(
                await tx.invoicePayment.create({
                  data: {
                    invoiceId: input.id,
                    tenantId: payment.paidByTenantId,
                    amountCents: payment.amountCents,
                    paymentMethod: payment.paymentMethod,
                    paidOn: payment.paidOn,
                  },
                }),
              );
            }
            const updatedInvoice = await tx.invoice.update({
              where: { id: input.id },
              data: {
                balanceCents,
                paidOn: balanceCents === 0 ? latestPayment.paidOn : null,
                paidByTenantId: balanceCents === 0 ? latestPayment.paidByTenantId : null,
                paymentMethod: balanceCents === 0 ? latestPayment.paymentMethod : null,
                status: getInvoiceStatus(invoice.dueOn, balanceCents),
              },
            });
            for (const payment of input.payments) {
              await recordInvoiceActivity(
                tx,
                updatedInvoice,
                "invoice.payment_recorded",
                {
                  amountCents: payment.amountCents,
                  paymentMethod: payment.paymentMethod,
                  paidOn: payment.paidOn.toISOString(),
                  tenantId: payment.paidByTenantId,
                },
                ctx.user,
              );
            }
            return payments;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This invoice changed while recording payments. Please try again.",
          });
        }
        throw error;
      }
    }),
    update: publicProcedure.input(updateInvoiceInputSchema).mutation(async ({ ctx, input }) => {
      const amountCents = input.items.reduce((total, item) => total + item.quantity * item.rateCents, 0);
      if (amountCents <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An invoice must have a positive total." });
      }
      try {
        const dueOn = new Date(input.dueOn);
        dueOn.setUTCHours(0, 0, 0, 0);
        return await ctx.prisma.$transaction(
          async (tx) => {
            const invoice = await tx.invoice.findUniqueOrThrow({
              where: { id: input.id },
              select: { amountCents: true, balanceCents: true },
            });
            const paidCents = invoice.amountCents - invoice.balanceCents;
            if (paidCents > amountCents) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invoice total cannot be lower than payments received.",
              });
            }
            const updatedInvoice = await tx.invoice.update({
              where: { id: input.id },
              data: {
                dueOn,
                amountCents,
                balanceCents: amountCents - paidCents,
                status: getInvoiceStatus(dueOn, amountCents - paidCents),
                items: {
                  deleteMany: {},
                  create: input.items.map((item) => ({
                    ...item,
                    description: item.description || null,
                    amountCents: item.quantity * item.rateCents,
                  })),
                },
              },
              include: { items: { orderBy: { id: "asc" } } },
            });
            await recordInvoiceActivity(tx, updatedInvoice, "invoice.updated");
            return updatedInvoice;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
          throw new TRPCError({ code: "CONFLICT", message: "This invoice changed while saving. Please try again." });
        }
        throw error;
      }
    }),
    delete: publicProcedure
      .input(deleteInvoiceInputSchema)
      .mutation(({ ctx, input }) => ctx.prisma.invoice.delete({ where: { id: input.id }, select: { id: true } })),
    deletePayment: publicProcedure.input(deleteInvoicePaymentInputSchema).mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const payment = await tx.invoicePayment.findUniqueOrThrow({
          where: { id: input.id },
          select: { invoiceId: true, amountCents: true },
        });
        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id: payment.invoiceId },
          select: { amountCents: true, balanceCents: true, dueOn: true },
        });
        await tx.invoicePayment.delete({ where: { id: input.id } });
        const latestPayment = await tx.invoicePayment.findFirst({
          where: { invoiceId: payment.invoiceId },
          orderBy: [{ paidOn: "desc" }, { id: "desc" }],
        });
        const balanceCents = Math.min(invoice.amountCents, invoice.balanceCents + payment.amountCents);
        const updatedInvoice = await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            balanceCents,
            status: getInvoiceStatus(invoice.dueOn, balanceCents),
            paidOn: balanceCents === 0 ? (latestPayment?.paidOn ?? null) : null,
            paidByTenantId: balanceCents === 0 ? (latestPayment?.tenantId ?? null) : null,
            paymentMethod: balanceCents === 0 ? (latestPayment?.paymentMethod ?? null) : null,
          },
        });
        await recordInvoiceActivity(tx, updatedInvoice, "invoice.payment_deleted", {
          amountCents: payment.amountCents,
        });
        return { id: input.id };
      });
    }),
  }),
  tags: router({
    list: publicProcedure.query(({ ctx }) =>
      ctx.prisma.tag.findMany({
        where: { organizationId: ctx.organization.organizationId },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        select: { id: true, label: true, sortOrder: true },
      }),
    ),
    create: publicProcedure.input(createTagInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.tag.create({
        data: { organizationId: ctx.organization.organizationId, label: input.label },
        select: { id: true, label: true, sortOrder: true },
      }),
    ),
  }),
  maintenanceCategories: router({
    list: publicProcedure.query(({ ctx }) =>
      ctx.prisma.maintenanceCategory.findMany({
        where: { organizationId: ctx.organization.organizationId },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        select: { id: true, label: true, sortOrder: true },
      }),
    ),
  }),
  landlords: router({
    list: publicProcedure.query(({ ctx }) =>
      ctx.prisma.landlord.findMany({
        where: { organizationId: ctx.organization.organizationId },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
    ),
  }),
  maintenance: router({
    list: publicProcedure.query(({ ctx }) =>
      ctx.prisma.maintenanceTicket.findMany({
        where: { organizationId: ctx.organization.organizationId, archivedAt: null },
        orderBy: [{ openedOn: "desc" }, { id: "desc" }],
        include: {
          category: { select: { id: true, label: true } },
          property: { select: { id: true, name: true } },
          units: { include: { unit: { select: { id: true, name: true } } } },
        },
      }),
    ),
    byId: publicProcedure.input(maintenanceTicketByIdInputSchema).query(async ({ ctx, input }) => {
      const ticket = await ctx.prisma.maintenanceTicket.findUnique({
        where: { id: input.id },
        include: {
          category: { select: { id: true, label: true } },
          property: { select: { id: true, name: true, city: true, region: true } },
          units: { include: { unit: { select: { id: true, name: true } } } },
          attachments: { orderBy: { createdAt: "desc" } },
          requestedByTenant: { select: { firstName: true, lastName: true } },
          requestedByLandlord: { select: { firstName: true, lastName: true } },
        },
      });
      if (!ticket) return null;

      return {
        ...ticket,
        attachments: await Promise.all(
          ticket.attachments.map(async (attachment) => ({
            ...attachment,
            imageUrl: await createMaintenanceImageDownloadUrl(attachment.objectKey),
          })),
        ),
      };
    }),
    createImageUploadUrl: publicProcedure.input(maintenanceImageUploadInputSchema).mutation(async ({ ctx, input }) => {
      await ctx.prisma.maintenanceTicket.findUniqueOrThrow({ where: { id: input.id }, select: { id: true } });
      return createMaintenanceImageUploadUrl(input.contentType, input.id);
    }),
    completeImageUpload: publicProcedure.input(maintenanceImageUploadCompleteInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.maintenanceAttachment.create({
        data: {
          ticketId: input.id,
          objectKey: input.objectKey,
          fileName: input.fileName,
          contentType: input.contentType,
        },
      }),
    ),
    deleteImage: publicProcedure.input(maintenanceAttachmentByIdInputSchema).mutation(async ({ ctx, input }) => {
      const attachment = await ctx.prisma.maintenanceAttachment.delete({ where: { id: input.id } });
      await deleteMaintenanceImageObject(attachment.objectKey);
      return attachment;
    }),
    updateStatus: publicProcedure.input(updateMaintenanceTicketStatusInputSchema).mutation(async ({ ctx, input }) => {
      const currentTicket = await ctx.prisma.maintenanceTicket.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.organization.organizationId },
        select: { id: true, organizationId: true, propertyId: true, ticketNumber: true, title: true, status: true },
      });

      if (input.status === "resolved") {
        const recentNote = await ctx.prisma.note.findFirst({
          where: {
            maintenanceTicketId: input.id,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          select: { id: true },
        });
        const noteBody = input.noteBody;
        if (!recentNote && !noteBody) {
          throw new Error("A maintenance note from the last 24 hours is required before resolving this ticket.");
        }
        if (!recentNote && noteBody) {
          return ctx.prisma.$transaction(async (tx) => {
            const ticket = await tx.maintenanceTicket.update({
              where: { id: input.id },
              data: { status: input.status },
            });
            await tx.note.create({ data: { maintenanceTicketId: input.id, body: noteBody } });
            await tx.note.create({ data: { maintenanceTicketId: input.id, body: "Ticket Resolved" } });
            await recordMaintenanceStatusEvent(tx, currentTicket, currentTicket.status, input.status);
            return ticket;
          });
        }
      }

      if (currentTicket.status === "resolved" && input.status === "in_progress") {
        return ctx.prisma.$transaction(async (tx) => {
          const ticket = await tx.maintenanceTicket.update({ where: { id: input.id }, data: { status: input.status } });
          await tx.note.create({ data: { maintenanceTicketId: input.id, body: "Ticket Reopened" } });
          await recordMaintenanceStatusEvent(tx, currentTicket, currentTicket.status, input.status);
          return ticket;
        });
      }

      if (input.status === "canceled") {
        const noteBody = input.noteBody;
        if (!noteBody) {
          throw new Error("A cancellation note is required before canceling this ticket.");
        }

        return ctx.prisma.$transaction(async (tx) => {
          const ticket = await tx.maintenanceTicket.update({ where: { id: input.id }, data: { status: input.status } });
          await tx.note.create({ data: { maintenanceTicketId: input.id, body: noteBody } });
          await recordMaintenanceStatusEvent(tx, currentTicket, currentTicket.status, input.status);
          return ticket;
        });
      }

      return ctx.prisma.$transaction(async (tx) => {
        const ticket = await tx.maintenanceTicket.update({ where: { id: input.id }, data: { status: input.status } });
        if (currentTicket.status !== input.status && input.status === "resolved") {
          await tx.note.create({ data: { maintenanceTicketId: input.id, body: "Ticket Resolved" } });
        }
        await recordMaintenanceStatusEvent(tx, currentTicket, currentTicket.status, input.status);
        return ticket;
      });
    }),
    update: publicProcedure.input(updateMaintenanceTicketInputSchema).mutation(async ({ ctx, input }) => {
      const priority = input.isUrgent ? "urgent" : input.priority;
      const units = await ctx.prisma.unit.findMany({
        where: { id: { in: input.unitIds }, propertyId: input.propertyId },
        select: { id: true, name: true },
      });
      if (units.length !== input.unitIds.length) throw new Error("Selected units must belong to the chosen property.");
      return ctx.prisma.maintenanceTicket.update({
        where: { id: input.id },
        data: {
          propertyId: input.propertyId,
          title: input.ticketTitle,
          description: input.description || null,
          categoryId: input.categoryId,
          isUrgent: priority === "urgent",
          priority,
          consentToEnter: input.consentToEnter,
          requestedByType: input.requestedByType,
          requestedByTenantId: input.requestedByType === "tenant" ? input.requestedById : null,
          requestedByLandlordId: input.requestedByType === "landlord" ? input.requestedById : null,
          unitLabel: units.length === 1 ? (units[0]?.name ?? null) : null,
          units: { deleteMany: {}, create: units.map((unit) => ({ unitId: unit.id })) },
        },
      });
    }),
    archive: publicProcedure
      .input(maintenanceTicketByIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.prisma.maintenanceTicket.update({ where: { id: input.id }, data: { archivedAt: new Date() } }),
      ),
    delete: publicProcedure.input(maintenanceTicketByIdInputSchema).mutation(async ({ ctx, input }) => {
      const attachments = await ctx.prisma.maintenanceAttachment.findMany({
        where: { ticketId: input.id },
        select: { objectKey: true },
      });
      const ticket = await ctx.prisma.maintenanceTicket.delete({ where: { id: input.id } });
      await Promise.all(attachments.map((attachment) => deleteMaintenanceImageObject(attachment.objectKey)));
      return ticket;
    }),
    create: publicProcedure.input(createMaintenanceTicketInputSchema).mutation(async ({ ctx, input }) => {
      const priority = input.isUrgent ? "urgent" : input.priority;
      const units = await ctx.prisma.unit.findMany({
        where: { id: { in: input.unitIds }, propertyId: input.propertyId },
        select: { id: true, name: true },
      });
      if (units.length !== input.unitIds.length) {
        throw new Error("Selected units must belong to the chosen property.");
      }

      if (input.requestedByType === "tenant") {
        const tenantLease = await ctx.prisma.lease.findFirst({
          where: {
            tenantId: input.requestedById,
            propertyId: input.propertyId,
            unitLabel: input.unitIds.length ? { in: units.map((unit) => unit.name) } : undefined,
            status: { in: ["active", "notice"] },
          },
          select: { id: true },
        });
        if (!tenantLease) {
          throw new Error("The selected tenant is not assigned to the selected unit.");
        }
      } else {
        await ctx.prisma.landlord.findUniqueOrThrow({ where: { id: input.requestedById }, select: { id: true } });
      }

      return ctx.prisma.maintenanceTicket.create({
        data: {
          organizationId: ctx.organization.organizationId,
          propertyId: input.propertyId,
          title: input.ticketTitle,
          description: input.description || null,
          categoryId: input.categoryId,
          isUrgent: priority === "urgent",
          priority,
          consentToEnter: input.consentToEnter,
          requestedByType: input.requestedByType,
          requestedByTenantId: input.requestedByType === "tenant" ? input.requestedById : null,
          requestedByLandlordId: input.requestedByType === "landlord" ? input.requestedById : null,
          unitLabel: units.length === 1 ? (units[0]?.name ?? null) : null,
          units: { create: units.map((unit) => ({ unitId: unit.id })) },
        },
      });
    }),
  }),
  activityEvents: router({
    /** Lists immutable activity events globally or for one subject. */
    list: publicProcedure.input(activityEventListInputSchema).query(({ ctx, input }) =>
      ctx.prisma.activityEvent.findMany({
        where: {
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          propertyId: input.propertyId,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit,
        select: {
          id: true,
          subjectType: true,
          subjectId: true,
          subjectLabel: true,
          subjectReference: true,
          action: true,
          previousStatus: true,
          nextStatus: true,
          actorId: true,
          actorLabel: true,
          metadata: true,
          createdAt: true,
          property: { select: { name: true } },
        },
      }),
    ),
  }),
  unitOptions: router({
    /** Lists the available utility and amenity options for units. */
    list: publicProcedure.query(async ({ ctx }) => {
      const [utilities, amenityTypes] = await Promise.all([
        ctx.prisma.utilityType.findMany({
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          select: { id: true, label: true, sortOrder: true },
        }),
        ctx.prisma.amenityType.findMany({
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          select: { id: true, label: true, sortOrder: true },
        }),
      ]);

      return { utilities, amenityTypes };
    }),
  }),
  amenities: router({
    /** Lists the available amenity options. */
    list: publicProcedure.query(({ ctx }) =>
      ctx.prisma.amenityType.findMany({
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        select: { id: true, label: true, sortOrder: true },
      }),
    ),
    /** Updates an amenity option. */
    update: publicProcedure.input(updateAmenityInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.amenityType.update({
        where: { id: input.id },
        data: { label: input.label, sortOrder: input.sortOrder },
        select: { id: true, label: true, sortOrder: true },
      }),
    ),
  }),
  notes: router({
    /** Lists the notes attached to one property, unit, or tenant. */
    list: publicProcedure.input(noteListInputSchema).query(({ ctx, input }) => {
      const { limit, ...subject } = input;

      return ctx.prisma.note.findMany({
        where: subject,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        select: { id: true, body: true, createdAt: true, updatedAt: true },
      });
    }),
    /** Adds an internal note to one property, unit, or tenant. */
    create: publicProcedure.input(createNoteInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.note.create({
        data: input,
        select: { id: true, body: true, createdAt: true, updatedAt: true },
      }),
    ),
    /** Updates an internal note. */
    update: publicProcedure.input(updateNoteInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.$transaction(async (tx) => {
        const { propertyId, tenantId, ...note } = await tx.note.update({
          where: { id: input.id },
          data: { body: input.body },
          select: {
            id: true,
            body: true,
            propertyId: true,
            tenantId: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        if (propertyId !== null) {
          await tx.property.updateMany({
            where: { id: propertyId, legacyNoteId: note.id },
            data: { legacyNotes: note.body },
          });
        } else if (tenantId !== null) {
          await tx.tenant.updateMany({
            where: { id: tenantId, legacyNoteId: note.id },
            data: { legacyNotes: note.body },
          });
        }

        return note;
      }),
    ),
    /** Deletes an internal note. */
    delete: publicProcedure.input(deleteNoteInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.$transaction(async (tx) => {
        const note = await tx.note.findUniqueOrThrow({
          where: { id: input.id },
          select: {
            legacyProperty: { select: { id: true } },
            legacyTenant: { select: { id: true } },
          },
        });

        const deletedNote = await tx.note.delete({ where: { id: input.id } });

        if (note.legacyProperty) {
          await tx.property.updateMany({
            where: { id: note.legacyProperty.id },
            data: { legacyNotes: null },
          });
        } else if (note.legacyTenant) {
          await tx.tenant.updateMany({
            where: { id: note.legacyTenant.id },
            data: { legacyNotes: null },
          });
        }

        return deletedNote;
      }),
    ),
  }),
  units: router({
    /** Lists units, optionally filtered to a property. */
    list: publicProcedure.input(listUnitsInputSchema).query(async ({ ctx, input }) => {
      const units = await ctx.prisma.unit.findMany({
        where: input.propertyId ? { propertyId: input.propertyId } : undefined,
        orderBy: [{ propertyId: "asc" }, { createdAt: "asc" }],
        include: {
          amenities: {
            select: { option: { select: { id: true, label: true } } },
          },
          utilities: {
            select: { option: { select: { id: true, label: true } } },
          },
        },
      });

      return units.map(serializeUnit);
    }),
    /** Returns a unit by its ID. */
    byId: publicProcedure.input(unitByIdInputSchema).query(async ({ ctx, input }) => {
      const unit = await ctx.prisma.unit.findUnique({
        where: { id: input.id },
        include: {
          amenities: {
            select: { option: { select: { id: true, label: true } } },
          },
          utilities: {
            select: { option: { select: { id: true, label: true } } },
          },
        },
      });

      return unit ? serializeUnit(unit) : null;
    }),
    /** Creates a unit for a property. */
    create: publicProcedure.input(createUnitInputSchema).mutation(({ ctx, input }) => {
      const { propertyId, ...unitDetails } = input;

      return ctx.prisma.unit
        .create({
          data: getUnitCreateData(propertyId, unitDetails),
          include: {
            amenities: {
              select: { option: { select: { id: true, label: true } } },
            },
            utilities: {
              select: { option: { select: { id: true, label: true } } },
            },
          },
        })
        .then(serializeUnit);
    }),
    /** Updates a unit by its ID. */
    update: publicProcedure.input(updateUnitInputSchema).mutation(async ({ ctx, input }) => {
      const unit = await ctx.prisma.$transaction(async (tx) => {
        await tx.unitUtility.deleteMany({ where: { unitId: input.id } });
        await tx.unitAmenity.deleteMany({ where: { unitId: input.id } });

        return tx.unit.update({
          where: { id: input.id },
          data: getUnitUpdateData(input),
          include: {
            amenities: {
              select: { option: { select: { id: true, label: true } } },
            },
            utilities: {
              select: { option: { select: { id: true, label: true } } },
            },
          },
        });
      });

      return serializeUnit(unit);
    }),
    /** Deletes a unit by its ID. */
    delete: publicProcedure.input(unitByIdInputSchema).mutation(async ({ ctx, input }) => {
      const unit = await ctx.prisma.unit.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          amenities: {
            select: { option: { select: { id: true, label: true } } },
          },
          utilities: {
            select: { option: { select: { id: true, label: true } } },
          },
        },
      });

      await ctx.prisma.unit.delete({ where: { id: input.id } });

      return serializeUnit(unit);
    }),
  }),
});

export type AppRouter = typeof appRouter;
