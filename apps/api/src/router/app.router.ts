import {
  createManualInvoiceInputSchema,
  createPropertyInputSchema,
  createLeaseInputSchema,
  leaseByIdInputSchema,
  createLeaseWithInvoicesInputSchema,
  deleteInvoiceInputSchema,
  deleteInvoicePaymentInputSchema,
  invoiceByIdInputSchema,
  invoiceListInputSchema,
  recordInvoicePaymentInputSchema,
  recordInvoicePaymentsInputSchema,
  activityEventListInputSchema,
  isActiveMaintenanceTicketStatus,
  applicationByIdInputSchema,
  applicationStatusInputSchema,
  createApplicationInputSchema,
  reorderApplicationStatusesInputSchema,
  setApplicationStatusInputSchema,
  updateApplicationInputSchema,
  updateApplicationStatusInputSchema,
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
  createUserInputSchema,
  updateUserInputSchema,
  updateUserProfileByIdInputSchema,
  userProfileImageUploadCompleteInputSchema,
  userProfileImageUploadInputSchema,
  userAccountStatusInputSchema,
  deleteUserInputSchema,
  switchOrganizationInputSchema,
  supportsPermissionAction,
  updateOrganizationInputSchema,
  imageUploadMaxSizeBytes,
  imageUploadMaxSizeMessage,
  organizationAvatarUploadCompleteInputSchema,
  organizationAvatarUploadInputSchema,
  deleteOrganizationAvatarInputSchema,
  updateRolePermissionsInputSchema,
  userRoleValues,
  type PermissionAction,
  type PermissionResource,
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
  assertImageObjectSize,
  ObjectExceedsMaximumSizeError,
  createPropertyImageUploadUrl,
  createMaintenanceImageDownloadUrl,
  createMaintenanceImageUploadUrl,
  deletePropertyImageObject,
  deleteMaintenanceImageObject,
  createTenantImageDownloadUrl,
  createTenantImageUploadUrl,
  deleteTenantImageObject,
  createUserProfileImageDownloadUrl,
  createUserProfileImageUploadUrl,
  deleteUserProfileImageObject,
  getObjectBuffer,
  getPublicObjectStorageConfig,
} from "../modules/object-storage.config";
import { authRouter } from "./auth.router";
import { requireAdministrator, requireOrganizationAdministrator } from "../modules/authorization";
import { hashPassword } from "../modules/auth";
import { getRolePermissions, requireNotePermission, requirePermission } from "../modules/permissions";
import { organizationProcedure, organizationProcedure as publicProcedure, router } from "./trpc";
import { renderInvoicePdf } from "../modules/invoice-pdf";

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
const openEndedLeaseInvoiceHorizonMonths = 12;

async function verifyImageUpload(objectKey: string) {
  try {
    await assertImageObjectSize(objectKey);
  } catch (error) {
    if (error instanceof ObjectExceedsMaximumSizeError) {
      await deletePropertyImageObject(objectKey).catch(() => undefined);
      throw new TRPCError({ code: "BAD_REQUEST", message: imageUploadMaxSizeMessage });
    }
    console.error("Failed to validate image upload.", { error, objectKey });
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The image upload could not be verified. Please upload it again.",
    });
  }
}

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

async function validateUnitOptionIds(
  prisma: PrismaClient,
  organizationId: number,
  units: Array<Pick<UnitDetailsInput, "amenityTypeIds" | "utilityTypeIds">>,
) {
  if (
    units.some(
      (unit) =>
        new Set(unit.amenityTypeIds).size !== unit.amenityTypeIds.length ||
        new Set(unit.utilityTypeIds).size !== unit.utilityTypeIds.length,
    )
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A unit option can only be selected once." });
  }
  const amenityTypeIds = units.flatMap((unit) => unit.amenityTypeIds);
  const utilityTypeIds = units.flatMap((unit) => unit.utilityTypeIds);
  const [amenityCount, utilityCount] = await Promise.all([
    prisma.amenityType.count({ where: { id: { in: amenityTypeIds }, organizationId } }),
    prisma.utilityType.count({ where: { id: { in: utilityTypeIds }, organizationId } }),
  ]);
  if (amenityCount !== new Set(amenityTypeIds).size || utilityCount !== new Set(utilityTypeIds).size) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Selected unit options must belong to the active organization.",
    });
  }
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

function getTenantStatus(tenant: { archivedAt: Date | null; leases: Array<{ lease: { status: LeaseStatus } }> }) {
  if (tenant.archivedAt) {
    return "archived";
  }

  return tenant.leases.some(
    (leaseTenant) => leaseTenant.lease.status === "active" || leaseTenant.lease.status === "notice",
  )
    ? "active"
    : "past";
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

function getApplicantData(applicant: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  dateOfBirth?: Date | null;
  employment?: string | null;
  address?: { line1: string; line2?: string | null; city: string; region: string; postalCode: string };
}) {
  return {
    firstName: applicant.firstName,
    lastName: applicant.lastName,
    email: applicant.email,
    phone: applicant.phone ?? null,
    dateOfBirth: applicant.dateOfBirth ?? null,
    employment: applicant.employment ?? null,
    addressLine1: applicant.address?.line1 ?? null,
    addressLine2: applicant.address?.line2 ?? null,
    city: applicant.address?.city ?? null,
    region: applicant.address?.region ?? null,
    postalCode: applicant.address?.postalCode ?? null,
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

async function assertUserHasOrganizationMembership(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: number,
  organizationId: number,
) {
  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { userId: true },
  });
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Organization access is required." });
  }
}

async function transferSoleOrganizationOwnership(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: number,
  recoveryOwnerId: number,
) {
  const soleOwnerMemberships = await prisma.organizationMembership.findMany({
    where: {
      userId,
      role: "owner",
      organization: {
        memberships: {
          none: { userId: { not: userId }, role: "owner" },
        },
      },
    },
    select: { organizationId: true },
  });
  if (soleOwnerMemberships.length > 0 && userId === recoveryOwnerId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A sole organization owner cannot delete their own account.",
    });
  }
  await Promise.all(
    soleOwnerMemberships.map(({ organizationId }) =>
      prisma.organizationMembership.upsert({
        where: { userId_organizationId: { userId: recoveryOwnerId, organizationId } },
        create: { userId: recoveryOwnerId, organizationId, role: "owner" },
        update: { role: "owner" },
      }),
    ),
  );
}

function permissionProcedure(resource: PermissionResource, action: PermissionAction) {
  return organizationProcedure.use(async ({ ctx, next }) => {
    await requirePermission(ctx.prisma, ctx.user.role, resource, action);
    return next({ ctx });
  });
}

async function assertNonAdministratorUser(prisma: PrismaClient | Prisma.TransactionClient, userId: number) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
  if (user.role === "administrator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can manage administrator accounts." });
  }
}

export const appRouter = router({
  auth: authRouter,
  organizations: router({
    list: publicProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "administrator") {
        const organizations = await ctx.prisma.organization.findMany({
          select: { id: true, name: true, slug: true },
          orderBy: { name: "asc" },
        });
        return organizations.map((organization) => ({ organization, role: "administrator" as const }));
      }
      return ctx.prisma.organizationMembership.findMany({
        where: { userId: ctx.user.id },
        select: {
          role: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { organization: { name: "asc" } },
      });
    }),
    active: organizationProcedure.query(async ({ ctx }) => ({
      id: ctx.organization.organization.id,
      name: ctx.organization.organization.name,
      slug: ctx.organization.organization.slug,
      avatarObjectKey: ctx.organization.organization.avatarObjectKey,
      avatarUrl: await createPropertyImageDownloadUrl(ctx.organization.organization.avatarObjectKey),
      darkAvatarObjectKey: ctx.organization.organization.darkAvatarObjectKey,
      darkAvatarUrl: await createPropertyImageDownloadUrl(ctx.organization.organization.darkAvatarObjectKey),
      address: {
        line1: ctx.organization.organization.addressLine1,
        line2: ctx.organization.organization.addressLine2,
        city: ctx.organization.organization.city,
        region: ctx.organization.organization.region,
        postalCode: ctx.organization.organization.postalCode,
      },
      phone: ctx.organization.organization.phone,
      role: ctx.organization.role,
    })),
    switch: publicProcedure.input(switchOrganizationInputSchema).mutation(async ({ ctx, input }) => {
      const membership = await ctx.prisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: ctx.user.id, organizationId: input.organizationId } },
        select: { organizationId: true },
      });
      if (!membership && ctx.user.role !== "administrator")
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization access is required." });
      if (!membership) {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: input.organizationId },
          select: { id: true },
        });
        if (!organization) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
      }
      const organizationId = membership?.organizationId ?? input.organizationId;
      await ctx.prisma.session.update({
        where: { id: ctx.session.id },
        data: { activeOrganizationId: organizationId },
      });
      return { organizationId };
    }),
    update: organizationProcedure.input(updateOrganizationInputSchema).mutation(async ({ ctx, input }) => {
      requireOrganizationAdministrator(ctx.organization.role);
      try {
        const organization = await ctx.prisma.organization.update({
          where: { id: ctx.organization.organizationId },
          data: {
            name: input.name,
            slug: input.slug,
            addressLine1: input.address?.line1 || null,
            addressLine2: input.address?.line2 || null,
            city: input.address?.city || null,
            region: input.address?.region || null,
            postalCode: input.address?.postalCode || null,
            phone: input.phone?.trim() || null,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            region: true,
            postalCode: true,
            phone: true,
          },
        });
        return {
          ...organization,
          address: {
            line1: organization.addressLine1,
            line2: organization.addressLine2,
            city: organization.city,
            region: organization.region,
            postalCode: organization.postalCode,
          },
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new TRPCError({ code: "CONFLICT", message: "An organization already uses this slug." });
        }
        throw error;
      }
    }),
    createAvatarUploadUrl: organizationProcedure
      .input(organizationAvatarUploadInputSchema)
      .mutation(({ ctx, input }) => {
        requireOrganizationAdministrator(ctx.organization.role);
        return createOrganizationAvatarUploadUrl(input.contentType, ctx.organization.organizationId, input.variant);
      }),
    completeAvatarUpload: organizationProcedure
      .input(organizationAvatarUploadCompleteInputSchema)
      .mutation(async ({ ctx, input }) => {
        requireOrganizationAdministrator(ctx.organization.role);
        const objectKeyPrefix = `organizations/${ctx.organization.organizationId}/avatar/${input.variant}/`;
        if (!input.objectKey.startsWith(objectKeyPrefix)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid organization avatar object key." });
        }
        await verifyImageUpload(input.objectKey);
        const currentOrganization = await ctx.prisma.organization.findUniqueOrThrow({
          where: { id: ctx.organization.organizationId },
          select: { avatarObjectKey: true, darkAvatarObjectKey: true },
        });
        const avatarField = input.variant === "dark" ? "darkAvatarObjectKey" : "avatarObjectKey";
        const previousObjectKey = currentOrganization[avatarField];
        const organization = await ctx.prisma.organization.update({
          where: { id: ctx.organization.organizationId },
          data: { [avatarField]: input.objectKey },
          select: { id: true, avatarObjectKey: true, darkAvatarObjectKey: true },
        });
        if (previousObjectKey && previousObjectKey !== input.objectKey) {
          await deletePropertyImageObject(previousObjectKey);
        }
        return organization;
      }),
    deleteAvatar: organizationProcedure.input(deleteOrganizationAvatarInputSchema).mutation(async ({ ctx, input }) => {
      requireOrganizationAdministrator(ctx.organization.role);
      const currentOrganization = await ctx.prisma.organization.findUniqueOrThrow({
        where: { id: ctx.organization.organizationId },
        select: { avatarObjectKey: true, darkAvatarObjectKey: true },
      });
      const avatarField = input.variant === "dark" ? "darkAvatarObjectKey" : "avatarObjectKey";
      const objectKey = currentOrganization[avatarField];
      const organization = await ctx.prisma.organization.update({
        where: { id: ctx.organization.organizationId },
        data: { [avatarField]: null },
        select: { id: true, avatarObjectKey: true, darkAvatarObjectKey: true },
      });
      if (objectKey) await deletePropertyImageObject(objectKey);
      return organization;
    }),
  }),
  users: router({
    /** Lists accounts that can access this workspace. */
    list: permissionProcedure("users", "view").query(({ ctx }) => {
      return ctx.prisma.user.findMany({
        where: {
          organizationMemberships: {
            some: { organizationId: ctx.organization.organizationId },
          },
        },
        select: { id: true, name: true, email: true, phone: true, role: true, accountStatus: true },
        orderBy: { createdAt: "asc" },
      });
    }),
    create: permissionProcedure("users", "create")
      .input(createUserInputSchema)
      .mutation(async ({ ctx, input }) => {
        if (input.role === "administrator" && ctx.user.role !== "administrator") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can create administrator accounts." });
        }
        try {
          const passwordHash = await hashPassword(input.password);
          return await ctx.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
              data: {
                name: input.name,
                email: input.email,
                phone: input.phone || null,
                passwordHash,
                role: input.role,
                defaultOrganizationId: ctx.organization.organizationId,
              },
              select: { id: true, name: true, email: true, phone: true, role: true, accountStatus: true },
            });
            await tx.organizationMembership.create({
              data: { userId: user.id, organizationId: ctx.organization.organizationId },
            });
            return user;
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new TRPCError({ code: "CONFLICT", message: "An account already uses this email address." });
          }
          throw error;
        }
      }),
    profile: publicProcedure.input(deleteUserInputSchema).query(async ({ ctx, input }) => {
      if (input.id !== ctx.user.id) {
        await requirePermission(ctx.prisma, ctx.user.role, "users", "view");
        await assertUserHasOrganizationMembership(ctx.prisma, input.id, ctx.organization.organizationId);
      }
      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          profileImageObjectKey: true,
          role: true,
          accountStatus: true,
        },
      });
      const { profileImageObjectKey, ...profile } = user;
      return { ...profile, imageUrl: await createUserProfileImageDownloadUrl(profileImageObjectKey) };
    }),
    updateProfile: publicProcedure.input(updateUserProfileByIdInputSchema).mutation(async ({ ctx, input }) => {
      const isOwnProfile = input.id === ctx.user.id;
      if (!isOwnProfile) {
        await requirePermission(ctx.prisma, ctx.user.role, "users", "edit");
        await assertUserHasOrganizationMembership(ctx.prisma, input.id, ctx.organization.organizationId);
        if (ctx.user.role !== "administrator") await assertNonAdministratorUser(ctx.prisma, input.id);
      }
      if (isOwnProfile && input.email !== undefined) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Change your sign-in email from your profile settings.",
        });
      }
      try {
        return await ctx.prisma.user.update({
          where: { id: input.id },
          data: {
            name: input.name,
            ...(input.email === undefined ? {} : { email: input.email }),
            phone: input.phone || null,
          },
          select: { id: true, name: true, email: true, phone: true, role: true, accountStatus: true },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new TRPCError({ code: "CONFLICT", message: "An account already uses this email address." });
        }
        throw error;
      }
    }),
    createProfileImageUploadUrl: publicProcedure
      .input(userProfileImageUploadInputSchema)
      .mutation(async ({ ctx, input }) => {
        if (input.id !== ctx.user.id) {
          requireOrganizationAdministrator(ctx.organization.role);
          await assertUserHasOrganizationMembership(ctx.prisma, input.id, ctx.organization.organizationId);
        }
        await ctx.prisma.user.findUniqueOrThrow({ where: { id: input.id }, select: { id: true } });
        return createUserProfileImageUploadUrl(input.contentType, input.id);
      }),
    completeProfileImageUpload: publicProcedure
      .input(userProfileImageUploadCompleteInputSchema)
      .mutation(async ({ ctx, input }) => {
        if (input.id !== ctx.user.id) {
          requireOrganizationAdministrator(ctx.organization.role);
          await assertUserHasOrganizationMembership(ctx.prisma, input.id, ctx.organization.organizationId);
        }
        const expectedObjectKeyPrefix = `users/${input.id}/profile/images/`;
        if (!input.objectKey.startsWith(expectedObjectKeyPrefix)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The image must belong to the selected user." });
        }
        await verifyImageUpload(input.objectKey);
        const currentUser = await ctx.prisma.user.findUniqueOrThrow({
          where: { id: input.id },
          select: { profileImageObjectKey: true },
        });
        const user = await ctx.prisma.user.update({
          where: { id: input.id },
          data: { profileImageObjectKey: input.objectKey },
          select: { id: true, profileImageObjectKey: true },
        });
        if (currentUser.profileImageObjectKey && currentUser.profileImageObjectKey !== input.objectKey) {
          await deleteUserProfileImageObject(currentUser.profileImageObjectKey);
        }
        return user;
      }),
    deleteProfileImage: publicProcedure.input(deleteUserInputSchema).mutation(async ({ ctx, input }) => {
      if (input.id !== ctx.user.id) {
        requireOrganizationAdministrator(ctx.organization.role);
        await assertUserHasOrganizationMembership(ctx.prisma, input.id, ctx.organization.organizationId);
      }
      const currentUser = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: input.id },
        select: { profileImageObjectKey: true },
      });
      const clearedProfileImage = await ctx.prisma.user.updateMany({
        where: { id: input.id, profileImageObjectKey: currentUser.profileImageObjectKey },
        data: { profileImageObjectKey: null },
      });
      if (clearedProfileImage.count && currentUser.profileImageObjectKey) {
        await deleteUserProfileImageObject(currentUser.profileImageObjectKey);
      }
      return ctx.prisma.user.findUniqueOrThrow({
        where: { id: input.id },
        select: { id: true, profileImageObjectKey: true },
      });
    }),
    update: permissionProcedure("users", "edit")
      .input(updateUserInputSchema)
      .mutation(async ({ ctx, input }) => {
        await assertUserHasOrganizationMembership(ctx.prisma, input.id, ctx.organization.organizationId);
        if (ctx.user.role !== "administrator") {
          if (input.role === "administrator") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Only administrators can assign the administrator role.",
            });
          }
          await assertNonAdministratorUser(ctx.prisma, input.id);
        }
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
    updateAccountStatus: permissionProcedure("users", "archive")
      .input(userAccountStatusInputSchema)
      .mutation(async ({ ctx, input }) => {
        await assertUserHasOrganizationMembership(ctx.prisma, input.id, ctx.organization.organizationId);
        if (ctx.user.role !== "administrator") await assertNonAdministratorUser(ctx.prisma, input.id);
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
    delete: permissionProcedure("users", "delete")
      .input(deleteUserInputSchema)
      .mutation(async ({ ctx, input }) => {
        await assertUserHasOrganizationMembership(ctx.prisma, input.id, ctx.organization.organizationId);
        if (ctx.user.role !== "administrator") await assertNonAdministratorUser(ctx.prisma, input.id);
        return ctx.prisma.$transaction(
          async (tx) => {
            await assertActiveAdministratorCanBeRemoved(tx, input.id);
            await transferSoleOrganizationOwnership(tx, input.id, ctx.user.id);
            return tx.user.delete({ where: { id: input.id }, select: { id: true } });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      }),
  }),
  roles: router({
    list: publicProcedure.query(async ({ ctx }) => {
      requireAdministrator(ctx.user.role as UserRole);
      return Promise.all(
        userRoleValues.map(async (role) => ({ role, permissions: await getRolePermissions(ctx.prisma, role) })),
      );
    }),
    updatePermissions: publicProcedure.input(updateRolePermissionsInputSchema).mutation(async ({ ctx, input }) => {
      requireAdministrator(ctx.user.role as UserRole);
      if (input.role === "administrator") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Administrator permissions cannot be changed." });
      }
      return ctx.prisma.$transaction(
        input.permissions.map(({ resource, view, create, edit, archive, delete: canDelete }) =>
          ctx.prisma.rolePermission.upsert({
            where: { role_resource: { role: input.role, resource } },
            create: {
              role: input.role,
              resource,
              canView: view,
              canCreate: create,
              canEdit: edit,
              canArchive: supportsPermissionAction(resource, "archive") ? (archive ?? false) : false,
              canDelete,
            },
            update: {
              canView: view,
              canCreate: create,
              canEdit: edit,
              canArchive: supportsPermissionAction(resource, "archive") ? (archive ?? false) : false,
              canDelete,
            },
          }),
        ),
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
    /** Lists properties with units, lease metrics, and maintenance metrics. */
    list: permissionProcedure("properties", "view").query(async ({ ctx }) => {
      const permissions = await getRolePermissions(ctx.prisma, ctx.user.role);
      await synchronizeOverdueInvoices(ctx.prisma);
      const properties = await ctx.prisma.property.findMany({
        where: { organizationId: ctx.organization.organizationId },
        include: {
          tags: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
          leases: {
            select: {
              monthlyRentCents: true,
              archivedAt: true,
              id: true,
              startsOn: true,
              endsOn: true,
              status: true,
              unit: { select: { name: true } },
              tenants: {
                select: {
                  tenant: {
                    select: {
                      firstName: true,
                      id: true,
                      lastName: true,
                    },
                  },
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
      });

      return Promise.all(
        properties.map(async (property) => {
          const leases = (permissions.leases.view ? property.leases : []).flatMap((lease) => {
            const { tenants: _tenants, unit: _unit, invoices, ...leaseData } = lease;
            const firstTenant = lease.tenants[0]?.tenant;
            if (!firstTenant) return [];
            const amountOverdueCents = invoices.reduce((sum, inv) => sum + inv.balanceCents, 0);
            return [
              {
                ...leaseData,
                unitLabel: lease.unit.name,
                tenant: firstTenant,
                tenants: lease.tenants.map(({ tenant }) => tenant),
                invoices,
                amountOverdueCents,
              },
            ];
          });
          const result = withOperatingMetrics({
            ...withPropertyNotes({
              ...property,
              leases,
            }),
            units: property.units.map(serializeUnit),
          });
          return {
            ...result,
            imageUrl: await createPropertyImageDownloadUrl(property.imageObjectKey),
          };
        }),
      );
    }),
    /** Returns one property with its units, leases, and maintenance tickets. */
    byId: permissionProcedure("properties", "view")
      .input(propertyByIdInputSchema)
      .query(async ({ ctx, input }) => {
        const permissions = await getRolePermissions(ctx.prisma, ctx.user.role);
        const property = await ctx.prisma.property.findFirst({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
          include: {
            tags: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
            leases: {
              orderBy: { startsOn: "desc" },
              include: {
                tenants: { include: { tenant: true } },
                unit: true,
                invoices: { select: { balanceCents: true } },
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

        if (!property) return null;

        const { units: rawUnits, leases: rawLeases, ...propertyData } = property;

        const leases = (permissions.leases.view ? rawLeases : []).flatMap((lease) => {
          const { tenants: _tenants, unit: _unit, invoices: _invoices, ...leaseData } = lease;
          const firstTenant = lease.tenants[0]?.tenant;
          if (!firstTenant) return [];
          const amountOverdueCents = lease.invoices.reduce((sum, inv) => sum + inv.balanceCents, 0);
          return [
            {
              ...leaseData,
              unitLabel: lease.unit.name,
              tenant: firstTenant,
              tenants: lease.tenants.map(({ tenant }) => tenant),
              amountOverdueCents,
            },
          ];
        });

        return {
          ...withPropertyNotes({ ...propertyData, leases }),
          units: rawUnits.map(serializeUnit),
          unitStatuses,
          imageUrl: await createPropertyImageDownloadUrl(property.imageObjectKey),
        };
      }),
    /** Creates a short-lived URL for uploading a property image to MinIO. */
    createImageUploadUrl: permissionProcedure("properties", "edit")
      .input(propertyImageUploadInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.property.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
        return createPropertyImageUploadUrl(input.contentType, ctx.organization.organizationId, input.id);
      }),
    /** Records a successfully uploaded image and removes the previous object. */
    completeImageUpload: permissionProcedure("properties", "edit")
      .input(propertyImageUploadCompleteInputSchema)
      .mutation(async ({ ctx, input }) => {
        const expectedObjectKeyPrefix = `organizations/${ctx.organization.organizationId}/properties/${input.id}/images/`;
        if (!input.objectKey.startsWith(expectedObjectKeyPrefix)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The image must belong to the selected property." });
        }
        await verifyImageUpload(input.objectKey);
        const currentProperty = await ctx.prisma.property.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
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
    deleteImage: permissionProcedure("properties", "edit")
      .input(propertyByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const currentProperty = await ctx.prisma.property.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
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
    create: permissionProcedure("properties", "create")
      .input(createPropertyInputSchema)
      .mutation(async ({ ctx, input }) => {
        if (input.units.length > 0) {
          await requirePermission(ctx.prisma, ctx.user.role, "units", "create");
        }
        if (input.notes) {
          await Promise.all([
            requirePermission(ctx.prisma, ctx.user.role, "property_notes", "create"),
            requirePermission(ctx.prisma, ctx.user.role, "properties", "view"),
          ]);
        }
        const tags = await ctx.prisma.tag.count({
          where: { id: { in: input.tagIds }, organizationId: ctx.organization.organizationId },
        });
        if (tags !== input.tagIds.length)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected tags must belong to the active organization.",
          });
        await validateUnitOptionIds(ctx.prisma, ctx.organization.organizationId, input.units);
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
    update: permissionProcedure("properties", "edit")
      .input(updatePropertyInputSchema)
      .mutation(async ({ ctx, input }) => {
        if (input.notes !== undefined) {
          await requireNotePermission(ctx.prisma, ctx.user.role, { propertyId: input.id }, "edit");
        }
        await ctx.prisma.property.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
        const tags = await ctx.prisma.tag.count({
          where: { id: { in: input.tagIds }, organizationId: ctx.organization.organizationId },
        });
        if (tags !== input.tagIds.length)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected tags must belong to the active organization.",
          });
        await validateUnitOptionIds(ctx.prisma, ctx.organization.organizationId, input.units);
        const existingUnitIdsForPermissions = new Set(
          (
            await ctx.prisma.unit.findMany({
              where: { propertyId: input.id },
              select: { id: true },
            })
          ).map(({ id }) => id),
        );
        if (input.units.some(({ id }) => id && existingUnitIdsForPermissions.has(id))) {
          await requirePermission(ctx.prisma, ctx.user.role, "units", "edit");
        }
        if (input.units.some(({ id }) => !id || !existingUnitIdsForPermissions.has(id))) {
          await requirePermission(ctx.prisma, ctx.user.role, "units", "create");
        }
        if (Array.from(existingUnitIdsForPermissions).some((id) => !input.units.some((unit) => unit.id === id))) {
          await requirePermission(ctx.prisma, ctx.user.role, "units", "delete");
        }
        const property = await ctx.prisma
          .$transaction(
            async (tx) => {
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
              const removedUnitIds = existingUnits
                .map((unit) => unit.id)
                .filter((unitId) => !submittedExistingUnitIds.includes(unitId));

              if (removedUnitIds.length > 0) {
                const [lease, maintenanceTicket, note] = await Promise.all([
                  tx.lease.findFirst({ where: { unitId: { in: removedUnitIds } }, select: { id: true } }),
                  tx.maintenanceTicketUnit.findFirst({
                    where: { unitId: { in: removedUnitIds } },
                    select: { ticketId: true },
                  }),
                  tx.note.findFirst({ where: { unitId: { in: removedUnitIds } }, select: { id: true } }),
                ]);
                if (lease || maintenanceTicket || note) {
                  throw new TRPCError({
                    code: "CONFLICT",
                    message: "Units with history cannot be deleted. Retain the unit to preserve its records.",
                  });
                }
              }

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
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          )
          .catch((error: unknown) => {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
              throw new TRPCError({ code: "CONFLICT", message: "The property changed. Please try again." });
            }
            throw error;
          });

        return withPropertyNotes(property);
      }),
    /** Marks a property as archived. */
    archive: permissionProcedure("properties", "archive")
      .input(propertyByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.property.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
        return ctx.prisma.property
          .update({
            where: { id: input.id },
            select: propertySelect,
            data: { status: "archived" },
          })
          .then(withPropertyNotes);
      }),
    /** Marks a property as inactive. */
    inactivate: permissionProcedure("properties", "archive")
      .input(propertyStatusInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.property.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
        return ctx.prisma.property
          .update({
            where: { id: input.id },
            select: propertySelect,
            data: { status: "archived" },
          })
          .then(withPropertyNotes);
      }),
    /** Restores an archived property to active status. */
    reactivate: permissionProcedure("properties", "archive")
      .input(propertyStatusInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.property.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
        return ctx.prisma.property
          .update({
            where: { id: input.id },
            select: propertySelect,
            data: { status: "active" },
          })
          .then(withPropertyNotes);
      }),
    /** Permanently deletes a property without financial history and its related operational records. */
    delete: permissionProcedure("properties", "delete")
      .input(propertyByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        await requirePermission(ctx.prisma, ctx.user.role, "units", "delete");
        try {
          const property = await ctx.prisma.$transaction(
            async (tx) => {
              const property = await tx.property.findFirstOrThrow({
                where: { id: input.id, organizationId: ctx.organization.organizationId },
                select: propertySelect,
              });

              const [lease, invoice, application, maintenanceTicket, note, unitNote, activityEvent] = await Promise.all(
                [
                  tx.lease.findFirst({ where: { propertyId: input.id }, select: { id: true } }),
                  tx.invoice.findFirst({
                    where: { organizationId: ctx.organization.organizationId, propertyId: input.id },
                    select: { id: true },
                  }),
                  tx.application.findFirst({ where: { propertyId: input.id }, select: { id: true } }),
                  tx.maintenanceTicket.findFirst({ where: { propertyId: input.id }, select: { id: true } }),
                  tx.note.findFirst({ where: { propertyId: input.id }, select: { id: true } }),
                  tx.note.findFirst({ where: { unit: { propertyId: input.id } }, select: { id: true } }),
                  tx.activityEvent.findFirst({ where: { propertyId: input.id }, select: { id: true } }),
                ],
              );
              if (lease || invoice || application || maintenanceTicket || note || unitNote || activityEvent) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: "Properties with history cannot be deleted. Archive the property instead.",
                });
              }

              await tx.maintenanceTicket.deleteMany({ where: { propertyId: input.id } });
              await tx.application.deleteMany({ where: { propertyId: input.id } });
              await tx.lease.deleteMany({ where: { propertyId: input.id } });
              await tx.unit.deleteMany({ where: { propertyId: input.id } });
              await tx.property.delete({ where: { id: input.id } });

              return property;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );

          return withPropertyNotes(property);
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
            throw new TRPCError({ code: "CONFLICT", message: "The property changed. Please try again." });
          }
          throw error;
        }
      }),
    /** Updates the notes stored on a property. */
    updateNotes: permissionProcedure("property_notes", "edit")
      .input(propertyNotesInputSchema)
      .mutation(async ({ ctx, input }) => {
        await requirePermission(ctx.prisma, ctx.user.role, "properties", "view");
        await ctx.prisma.property.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
        const property = await ctx.prisma.$transaction(async (tx) => {
          const currentProperty = await tx.property.findUniqueOrThrow({
            where: { id: input.id },
            select: { legacyNoteId: true },
          });

          const legacyNote = await synchronizePropertyLegacyNote(
            tx,
            input.id,
            currentProperty.legacyNoteId,
            input.notes,
          );

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
    list: permissionProcedure("tenants", "view").query(async ({ ctx }) => {
      const tenants = await ctx.prisma.tenant.findMany({
        where: { organizationId: ctx.organization.organizationId },
        include: {
          emergencyContacts: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          },
          leases: {
            include: {
              lease: {
                select: {
                  id: true,
                  startsOn: true,
                  status: true,
                  endsOn: true,
                  monthlyRentCents: true,
                  propertyId: true,
                  unitId: true,
                  unit: { select: { name: true } },
                  property: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });

      return Promise.all(
        tenants.map(async (tenant) => ({
          ...tenant,
          leases: tenant.leases
            .map(({ lease }) => ({
              ...lease,
              unitLabel: lease.unit.name,
              property: lease.property,
            }))
            .sort((left, right) => right.startsOn.getTime() - left.startsOn.getTime()),
          imageUrl: await createTenantImageDownloadUrl(tenant.imageObjectKey),
          tenantStatus: getTenantStatus(tenant),
        })),
      );
    }),
    /** Returns one tenant with lease history. */
    byId: permissionProcedure("tenants", "view")
      .input(tenantByIdInputSchema)
      .query(async ({ ctx, input }) => {
        const tenant = await ctx.prisma.tenant.findFirst({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
          include: {
            emergencyContacts: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            },
            leases: {
              include: {
                lease: {
                  select: {
                    id: true,
                    startsOn: true,
                    endsOn: true,
                    status: true,
                    monthlyRentCents: true,
                    unitId: true,
                    propertyId: true,
                    unit: { select: { name: true } },
                    property: { select: { id: true, name: true } },
                    invoices: {
                      where: { tenantId: input.id },
                      select: {
                        id: true,
                        status: true,
                        dueOn: true,
                        amountCents: true,
                        paidOn: true,
                        balanceCents: true,
                        invoiceNumber: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (!tenant) return null;

        return {
          ...tenant,
          leases: tenant.leases.map(({ lease }) => ({
            ...lease,
            unitLabel: lease.unit.name,
            property: lease.property,
          })),
          imageUrl: await createTenantImageDownloadUrl(tenant.imageObjectKey),
          tenantStatus: getTenantStatus(tenant),
        };
      }),
    /** Creates a short-lived URL for uploading a tenant image to MinIO. */
    createImageUploadUrl: permissionProcedure("tenants", "edit")
      .input(tenantImageUploadInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.tenant.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
        return createTenantImageUploadUrl(input.contentType, ctx.organization.organizationId, input.id);
      }),
    /** Records a successfully uploaded tenant image and removes the previous object. */
    completeImageUpload: permissionProcedure("tenants", "edit")
      .input(tenantImageUploadCompleteInputSchema)
      .mutation(async ({ ctx, input }) => {
        const expectedObjectKeyPrefix = `organizations/${ctx.organization.organizationId}/tenants/${input.id}/images/`;
        if (!input.objectKey.startsWith(expectedObjectKeyPrefix)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The image must belong to the selected tenant." });
        }
        await verifyImageUpload(input.objectKey);
        const currentTenant = await ctx.prisma.tenant.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
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
    deleteImage: permissionProcedure("tenants", "edit")
      .input(tenantByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const currentTenant = await ctx.prisma.tenant.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
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
    archive: permissionProcedure("tenants", "archive")
      .input(tenantByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.tenant.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
        return ctx.prisma.tenant.update({
          where: { id: input.id },
          data: { archivedAt: new Date() },
        });
      }),
    /** Restores an archived tenant to their lease-derived status. */
    reactivate: permissionProcedure("tenants", "archive")
      .input(tenantByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.tenant.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
        return ctx.prisma.tenant.update({
          where: { id: input.id },
          data: { archivedAt: null },
        });
      }),
    /** Updates tenant contact and account details. */
    create: permissionProcedure("tenants", "create")
      .input(createTenantInputSchema)
      .mutation(({ ctx, input }) => {
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
    update: permissionProcedure("tenants", "edit")
      .input(updateTenantInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.tenant.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
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
    updateEmergencyContact: permissionProcedure("tenants", "edit")
      .input(updateEmergencyContactInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.emergencyContact.findFirstOrThrow({
          where: { id: input.id, tenant: { organizationId: ctx.organization.organizationId } },
        });
        return ctx.prisma.emergencyContact.update({
          where: { id: input.id },
          data: {
            firstName: input.firstName,
            lastName: input.lastName || null,
            phone: input.phone || null,
          },
        });
      }),
    /** Updates the internal notes attached to a tenant. */
    updateNotes: permissionProcedure("tenant_notes", "edit")
      .input(tenantNotesInputSchema)
      .mutation(async ({ ctx, input }) => {
        await requirePermission(ctx.prisma, ctx.user.role, "tenants", "view");
        await ctx.prisma.tenant.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
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
    createLease: permissionProcedure("leases", "create")
      .input(createLeaseInputSchema)
      .mutation(async ({ ctx, input }) => {
        await Promise.all([
          requirePermission(ctx.prisma, ctx.user.role, "properties", "view"),
          requirePermission(ctx.prisma, ctx.user.role, "units", "view"),
          requirePermission(ctx.prisma, ctx.user.role, "tenants", "view"),
        ]);
        try {
          return await ctx.prisma.$transaction(
            async (tx) => {
              // Verify tenant exists
              await tx.tenant.findFirstOrThrow({
                where: { id: input.tenantIds[0], organizationId: ctx.organization.organizationId },
              });

              // Verify all tenants exist
              const tenants = await tx.tenant.findMany({
                where: {
                  id: { in: input.tenantIds },
                  organizationId: ctx.organization.organizationId,
                },
              });

              if (tenants.length !== input.tenantIds.length) {
                throw new TRPCError({
                  code: "NOT_FOUND",
                  message: "One or more tenants not found.",
                });
              }

              // Verify property and unit exist
              const property = await tx.property.findFirstOrThrow({
                where: { id: input.propertyId, organizationId: ctx.organization.organizationId },
              });

              await tx.unit.findFirstOrThrow({
                where: { id: input.unitId, propertyId: input.propertyId },
              });

              // Check for existing active lease on this unit
              const existingLease = await tx.lease.findFirst({
                where: {
                  propertyId: input.propertyId,
                  unitId: input.unitId,
                  status: { in: [LeaseStatus.active, LeaseStatus.notice] },
                },
                select: { id: true },
              });

              if (existingLease) {
                throw new TRPCError({ code: "CONFLICT", message: "The selected unit already has an active lease." });
              }

              const lease = await tx.lease.create({
                data: {
                  organizationId: ctx.organization.organizationId,
                  propertyId: input.propertyId,
                  unitId: input.unitId,
                  monthlyRentCents: input.monthlyRentCents,
                  startsOn: input.startsOn,
                  endsOn: input.endsOn,
                  status: input.status,
                  tenants: {
                    create: input.tenantIds.map((tenantId) => ({
                      organizationId: ctx.organization.organizationId,
                      tenantId,
                    })),
                  },
                },
                include: {
                  tenants: { include: { tenant: true } },
                },
              });

              if (input.status === LeaseStatus.active || input.status === LeaseStatus.notice) {
                await tx.property.update({
                  where: { id: input.propertyId },
                  data: { occupiedUnits: property.occupiedUnits + 1 },
                });
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
    delete: permissionProcedure("tenants", "delete")
      .input(tenantByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.tenant.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
        const [lease, invoice] = await Promise.all([
          ctx.prisma.leaseTenant.findFirst({ where: { tenantId: input.id }, select: { leaseId: true } }),
          ctx.prisma.invoice.findFirst({ where: { tenantId: input.id }, select: { id: true } }),
        ]);
        if (lease) await requirePermission(ctx.prisma, ctx.user.role, "leases", "delete");
        if (invoice) await requirePermission(ctx.prisma, ctx.user.role, "invoices", "delete");
        await ctx.prisma.$transaction(async (tx) => {
          // Find all active leases this tenant is on
          const tenantLeases = await tx.leaseTenant.findMany({
            where: { tenantId: input.id },
            include: { lease: { select: { id: true, propertyId: true, status: true } } },
          });

          const leaseIdsToDelete = new Set<number>();

          for (const tl of tenantLeases) {
            leaseIdsToDelete.add(tl.leaseId);
          }

          await tx.invoice.deleteMany({ where: { tenantId: input.id } });
          await tx.leaseTenant.deleteMany({ where: { tenantId: input.id } });

          const remainingLeaseTenants = await tx.leaseTenant.findMany({
            where: { leaseId: { in: Array.from(leaseIdsToDelete) } },
            select: { leaseId: true },
            distinct: ["leaseId"],
          });
          const remainingLeaseIds = new Set(remainingLeaseTenants.map(({ leaseId }) => leaseId));
          const orphanedLeases = tenantLeases.filter(({ leaseId }) => !remainingLeaseIds.has(leaseId));
          const orphanedLeaseIds = orphanedLeases.map(({ leaseId }) => leaseId);

          await tx.lease.deleteMany({ where: { id: { in: orphanedLeaseIds } } });

          const activeLeasesByProperty = new Map<number, number>();
          for (const { lease } of orphanedLeases) {
            if (lease.status === LeaseStatus.active || lease.status === LeaseStatus.notice) {
              activeLeasesByProperty.set(lease.propertyId, (activeLeasesByProperty.get(lease.propertyId) ?? 0) + 1);
            }
          }

          await Promise.all(
            Array.from(activeLeasesByProperty.entries()).map(([propertyId, count]) =>
              tx.property.update({
                where: { id: propertyId },
                data: { occupiedUnits: { decrement: count } },
              }),
            ),
          );

          await tx.maintenanceTicket.updateMany({
            where: { requestedByTenantId: input.id },
            data: { requestedByType: null, requestedByTenantId: null },
          });
          await tx.tenant.delete({ where: { id: input.id } });
        });
      }),
  }),
  invoices: router({
    list: publicProcedure.input(invoiceListInputSchema).query(async ({ ctx, input }) => {
      await requirePermission(ctx.prisma, ctx.user.role, "invoices", "view");
      await synchronizeOverdueInvoices(ctx.prisma);
      const invoices = await ctx.prisma.invoice.findMany({
        where: {
          organizationId: ctx.organization.organizationId,
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
        },
        include: {
          lease: { select: { unit: { select: { name: true } } } },
          property: { select: { id: true, name: true } },
        },
        orderBy: { dueOn: "desc" },
      });

      return invoices.map(({ lease, ...invoice }) => ({
        ...invoice,
        lease: { unitLabel: lease.unit.name },
      }));
    }),
    byId: publicProcedure.input(invoiceByIdInputSchema).query(async ({ ctx, input }) => {
      await requirePermission(ctx.prisma, ctx.user.role, "invoices", "view");
      await synchronizeOverdueInvoices(ctx.prisma);
      const invoice = await ctx.prisma.invoice.findFirst({
        where: { id: input.id, organizationId: ctx.organization.organizationId },
        include: {
          property: { select: { id: true, name: true } },
          tenant: { select: { id: true, firstName: true, lastName: true } },
          lease: { select: { startsOn: true, endsOn: true, unit: { select: { name: true } } } },
          items: { orderBy: { id: "asc" } },
          payments: {
            orderBy: { paidOn: "desc" },
            include: { tenant: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      });

      if (!invoice) return null;

      return {
        ...invoice,
        lease: {
          startsOn: invoice.lease.startsOn,
          endsOn: invoice.lease.endsOn,
          unitLabel: invoice.lease.unit.name,
        },
      };
    }),
    pdf: publicProcedure.input(invoiceByIdInputSchema).query(async ({ ctx, input }) => {
      await requirePermission(ctx.prisma, ctx.user.role, "invoices", "view");
      await synchronizeOverdueInvoices(ctx.prisma);
      const invoice = await ctx.prisma.invoice.findFirst({
        where: { id: input.id, organizationId: ctx.organization.organizationId },
        include: {
          property: {
            select: { name: true, line1: true, line2: true, city: true, region: true, postalCode: true },
          },
          tenant: { select: { firstName: true, lastName: true } },
          lease: { select: { unit: { select: { name: true } } } },
          items: { orderBy: { id: "asc" } },
          payments: {
            orderBy: { paidOn: "desc" },
            include: { tenant: { select: { firstName: true, lastName: true } } },
          },
        },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });

      const organizationLogo = await getObjectBuffer(
        ctx.organization.organization.avatarObjectKey,
        imageUploadMaxSizeBytes,
      );
      const organization = {
        addressLine1: ctx.organization.organization.addressLine1,
        addressLine2: ctx.organization.organization.addressLine2,
        city: ctx.organization.organization.city,
        region: ctx.organization.organization.region,
        postalCode: ctx.organization.organization.postalCode,
        phone: ctx.organization.organization.phone,
      };
      const fileName = `invoice-${String(invoice.invoiceNumber).padStart(7, "0")}.pdf`;
      const pdfInvoice = {
        ...invoice,
        lease: { unitLabel: invoice.lease.unit.name },
      };
      return {
        contentBase64: (await renderInvoicePdf(pdfInvoice, organizationLogo, organization)).toString("base64"),
        fileName,
      };
    }),
    createManual: publicProcedure.input(createManualInvoiceInputSchema).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.prisma, ctx.user.role, "invoices", "create");
      const lease = await ctx.prisma.lease.findFirst({
        where: { id: input.leaseId, organizationId: ctx.organization.organizationId },
        select: { id: true, propertyId: true },
      });
      if (!lease || lease.propertyId !== input.propertyId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Select a lease for the chosen property." });
      }

      // Verify tenant is on this lease
      const leaseTenant = await ctx.prisma.leaseTenant.findFirst({
        where: { leaseId: lease.id, tenantId: input.tenantId },
      });
      if (!leaseTenant) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The selected tenant is not on this lease." });
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
          const existingInvoice = await tx.invoice.findFirst({
            where: {
              leaseId: lease.id,
              tenantId: input.tenantId,
              periodStartsOn: dueOn,
            },
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
              tenantId: input.tenantId,
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
      await requirePermission(ctx.prisma, ctx.user.role, "invoices", "edit");
      try {
        return await ctx.prisma.$transaction(
          async (tx) => {
            const invoice = await tx.invoice.findFirstOrThrow({
              where: { id: input.id, organizationId: ctx.organization.organizationId },
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
      await requirePermission(ctx.prisma, ctx.user.role, "invoices", "edit");
      try {
        return await ctx.prisma.$transaction(
          async (tx) => {
            const invoice = await tx.invoice.findFirstOrThrow({
              where: { id: input.id, organizationId: ctx.organization.organizationId },
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
      await requirePermission(ctx.prisma, ctx.user.role, "invoices", "edit");
      const amountCents = input.items.reduce((total, item) => total + item.quantity * item.rateCents, 0);
      if (amountCents <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An invoice must have a positive total." });
      }
      try {
        const dueOn = new Date(input.dueOn);
        dueOn.setUTCHours(0, 0, 0, 0);
        return await ctx.prisma.$transaction(
          async (tx) => {
            const invoice = await tx.invoice.findFirstOrThrow({
              where: { id: input.id, organizationId: ctx.organization.organizationId },
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
    delete: publicProcedure.input(deleteInvoiceInputSchema).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.prisma, ctx.user.role, "invoices", "delete");
      await ctx.prisma.invoice.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.organization.organizationId },
      });
      return ctx.prisma.invoice.delete({ where: { id: input.id }, select: { id: true } });
    }),
    deletePayment: publicProcedure.input(deleteInvoicePaymentInputSchema).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.prisma, ctx.user.role, "invoices", "delete");
      return ctx.prisma.$transaction(async (tx) => {
        const payment = await tx.invoicePayment.findFirstOrThrow({
          where: { id: input.id, invoice: { organizationId: ctx.organization.organizationId } },
          select: { invoiceId: true, amountCents: true },
        });
        const invoice = await tx.invoice.findFirstOrThrow({
          where: { id: payment.invoiceId, organizationId: ctx.organization.organizationId },
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
  applicationStatuses: router({
    list: permissionProcedure("applications", "view").query(({ ctx }) =>
      ctx.prisma.applicationStatus.findMany({
        where: { organizationId: ctx.organization.organizationId },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        select: { id: true, label: true, sortOrder: true, isActive: true },
      }),
    ),
    create: permissionProcedure("applications", "edit")
      .input(applicationStatusInputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await ctx.prisma.applicationStatus.create({
            data: { organizationId: ctx.organization.organizationId, ...input },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "An application status already uses this label." });
          }
          throw error;
        }
      }),
    update: permissionProcedure("applications", "edit")
      .input(updateApplicationStatusInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.applicationStatus.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
          select: { id: true },
        });
        const { id, ...data } = input;
        try {
          return await ctx.prisma.applicationStatus.update({ where: { id }, data });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "An application status already uses this label." });
          }
          throw error;
        }
      }),
    reorder: permissionProcedure("applications", "edit")
      .input(reorderApplicationStatusesInputSchema)
      .mutation(async ({ ctx, input }) => {
        const statuses = await ctx.prisma.applicationStatus.findMany({
          where: { organizationId: ctx.organization.organizationId },
          select: { id: true },
        });
        const statusIds = new Set(statuses.map((status) => status.id));
        const submittedIds = new Set(input.ids);
        if (
          statuses.length !== input.ids.length ||
          submittedIds.size !== input.ids.length ||
          !input.ids.every((id) => statusIds.has(id))
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Provide each active organization status exactly once.",
          });
        }
        return ctx.prisma.$transaction(
          input.ids.map((id, sortOrder) => ctx.prisma.applicationStatus.update({ where: { id }, data: { sortOrder } })),
        );
      }),
  }),
  applications: router({
    list: permissionProcedure("applications", "view").query(({ ctx }) =>
      ctx.prisma.application.findMany({
        where: { organizationId: ctx.organization.organizationId, archivedAt: null },
        orderBy: [{ submittedOn: "desc" }, { id: "desc" }],
        include: {
          property: { select: { id: true, name: true } },
          applicant: true,
          status: { select: { id: true, label: true } },
        },
      }),
    ),
    byId: permissionProcedure("applications", "view")
      .input(applicationByIdInputSchema)
      .query(({ ctx, input }) =>
        ctx.prisma.application.findFirst({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
          include: {
            property: { select: { id: true, name: true, city: true, region: true } },
            applicant: true,
            status: { select: { id: true, label: true } },
          },
        }),
      ),
    create: permissionProcedure("applications", "create")
      .input(createApplicationInputSchema)
      .mutation(async ({ ctx, input }) => {
        const [property, status] = await Promise.all([
          ctx.prisma.property.findFirst({
            where: { id: input.propertyId, organizationId: ctx.organization.organizationId },
            select: { id: true },
          }),
          ctx.prisma.applicationStatus.findFirst({
            where: { id: input.statusId, organizationId: ctx.organization.organizationId, isActive: true },
            select: { id: true },
          }),
        ]);
        if (!property) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected property must belong to the active organization.",
          });
        }
        if (!status) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected status must belong to the active organization.",
          });
        }

        return ctx.prisma.$transaction(async (tx) => {
          const applicant = await tx.applicant.create({
            data: { organizationId: ctx.organization.organizationId, ...getApplicantData(input.applicant) },
          });

          return tx.application.create({
            data: {
              organizationId: ctx.organization.organizationId,
              propertyId: input.propertyId,
              statusId: input.statusId,
              annualIncomeCents: input.annualIncomeCents,
              requestedMoveInDate: input.requestedMoveInDate,
              applicantId: applicant.id,
            },
          });
        });
      }),
    update: permissionProcedure("applications", "edit")
      .input(updateApplicationInputSchema)
      .mutation(async ({ ctx, input }) => {
        const application = await ctx.prisma.application.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
          select: { applicantId: true, statusId: true },
        });
        const [property, status] = await Promise.all([
          ctx.prisma.property.findFirst({
            where: { id: input.propertyId, organizationId: ctx.organization.organizationId },
            select: { id: true },
          }),
          ctx.prisma.applicationStatus.findFirst({
            where: {
              id: input.statusId,
              organizationId: ctx.organization.organizationId,
              OR: [{ isActive: true }, { id: application.statusId }],
            },
            select: { id: true },
          }),
        ]);
        if (!property) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected property must belong to the active organization.",
          });
        }
        if (!status) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected status must belong to the active organization.",
          });
        }

        const applicantData = getApplicantData(input.applicant);
        return ctx.prisma.$transaction(async (tx) => {
          const applicantUsageCount = await tx.application.count({
            where: { organizationId: ctx.organization.organizationId, applicantId: application.applicantId },
          });
          const applicant =
            applicantUsageCount > 1
              ? await tx.applicant.create({
                  data: { organizationId: ctx.organization.organizationId, ...applicantData },
                })
              : await tx.applicant.update({ where: { id: application.applicantId }, data: applicantData });
          return tx.application.update({
            where: { id: input.id },
            data: {
              propertyId: input.propertyId,
              statusId: input.statusId,
              annualIncomeCents: input.annualIncomeCents,
              requestedMoveInDate: input.requestedMoveInDate,
              applicantId: applicant.id,
            },
          });
        });
      }),
    updateStatus: permissionProcedure("applications", "edit")
      .input(setApplicationStatusInputSchema)
      .mutation(async ({ ctx, input }) => {
        const application = await ctx.prisma.application.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
          select: { id: true, statusId: true },
        });
        const status = await ctx.prisma.applicationStatus.findFirst({
          where: {
            id: input.statusId,
            organizationId: ctx.organization.organizationId,
            OR: [{ isActive: true }, { id: application.statusId }],
          },
          select: { id: true },
        });
        if (!status) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected status must belong to the active organization.",
          });
        }
        return ctx.prisma.application.update({ where: { id: input.id }, data: { statusId: input.statusId } });
      }),
    archive: permissionProcedure("applications", "archive")
      .input(applicationByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.application.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId, archivedAt: null },
          select: { id: true },
        });
        return ctx.prisma.application.update({ where: { id: input.id }, data: { archivedAt: new Date() } });
      }),
    reactivate: permissionProcedure("applications", "archive")
      .input(applicationByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.application.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
          select: { id: true },
        });
        return ctx.prisma.application.update({ where: { id: input.id }, data: { archivedAt: null } });
      }),
    delete: permissionProcedure("applications", "delete")
      .input(applicationByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.$transaction(async (tx) => {
          const application = await tx.application.findFirstOrThrow({
            where: { id: input.id, organizationId: ctx.organization.organizationId },
            select: { applicantId: true },
          });
          await tx.application.delete({ where: { id: input.id } });
          await tx.applicant.deleteMany({
            where: {
              id: application.applicantId,
              organizationId: ctx.organization.organizationId,
              applications: { none: {} },
            },
          });
        });
      }),
  }),
  maintenance: router({
    list: permissionProcedure("maintenance", "view").query(({ ctx }) =>
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
    byId: permissionProcedure("maintenance", "view")
      .input(maintenanceTicketByIdInputSchema)
      .query(async ({ ctx, input }) => {
        const ticket = await ctx.prisma.maintenanceTicket.findFirst({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
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
    createImageUploadUrl: permissionProcedure("maintenance", "edit")
      .input(maintenanceImageUploadInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.maintenanceTicket.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
          select: { id: true },
        });
        return createMaintenanceImageUploadUrl(input.contentType, ctx.organization.organizationId, input.id);
      }),
    completeImageUpload: permissionProcedure("maintenance", "edit")
      .input(maintenanceImageUploadCompleteInputSchema)
      .mutation(async ({ ctx, input }) => {
        const expectedObjectKeyPrefix = `organizations/${ctx.organization.organizationId}/maintenance/${input.id}/images/`;
        if (!input.objectKey.startsWith(expectedObjectKeyPrefix)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The image must belong to the selected maintenance ticket.",
          });
        }
        await verifyImageUpload(input.objectKey);
        await ctx.prisma.maintenanceTicket.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
        return ctx.prisma.maintenanceAttachment.create({
          data: {
            ticketId: input.id,
            objectKey: input.objectKey,
            fileName: input.fileName,
            contentType: input.contentType,
          },
        });
      }),
    deleteImage: permissionProcedure("maintenance", "edit")
      .input(maintenanceAttachmentByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const attachment = await ctx.prisma.maintenanceAttachment.findFirstOrThrow({
          where: { id: input.id, ticket: { organizationId: ctx.organization.organizationId } },
        });
        await ctx.prisma.maintenanceAttachment.delete({ where: { id: input.id } });
        await deleteMaintenanceImageObject(attachment.objectKey);
        return attachment;
      }),
    updateStatus: permissionProcedure("maintenance", "edit")
      .input(updateMaintenanceTicketStatusInputSchema)
      .mutation(async ({ ctx, input }) => {
        if (input.noteBody) {
          await requireNotePermission(ctx.prisma, ctx.user.role, { maintenanceTicketId: input.id }, "create");
        }
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
            const ticket = await tx.maintenanceTicket.update({
              where: { id: input.id },
              data: { status: input.status },
            });
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
            const ticket = await tx.maintenanceTicket.update({
              where: { id: input.id },
              data: { status: input.status },
            });
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
    update: permissionProcedure("maintenance", "edit")
      .input(updateMaintenanceTicketInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.maintenanceTicket.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
        const [property, category] = await Promise.all([
          ctx.prisma.property.findFirst({
            where: { id: input.propertyId, organizationId: ctx.organization.organizationId },
            select: { id: true },
          }),
          ctx.prisma.maintenanceCategory.findFirst({
            where: { id: input.categoryId, organizationId: ctx.organization.organizationId },
            select: { id: true },
          }),
        ]);
        if (!property) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected property must belong to the active organization.",
          });
        }
        if (!category) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected category must belong to the active organization.",
          });
        }

        const priority = input.isUrgent ? "urgent" : input.priority;
        const units = await ctx.prisma.unit.findMany({
          where: {
            id: { in: input.unitIds },
            propertyId: input.propertyId,
            property: { organizationId: ctx.organization.organizationId },
          },
          select: { id: true, name: true },
        });
        if (units.length !== input.unitIds.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selected units must belong to the chosen property." });
        }

        if (input.requestedByType === "tenant") {
          const tenantLease = await ctx.prisma.lease.findFirst({
            where: {
              tenantId: input.requestedById,
              propertyId: input.propertyId,
              organizationId: ctx.organization.organizationId,
              unitLabel: input.unitIds.length ? { in: units.map((unit) => unit.name) } : undefined,
              status: { in: ["active", "notice"] },
            },
            select: { id: true },
          });
          if (!tenantLease) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "The selected tenant is not assigned to the selected unit.",
            });
          }
        } else {
          const landlord = await ctx.prisma.landlord.findFirst({
            where: { id: input.requestedById, organizationId: ctx.organization.organizationId },
            select: { id: true },
          });
          if (!landlord) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Selected landlord must belong to the active organization.",
            });
          }
        }

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
    archive: permissionProcedure("maintenance", "archive")
      .input(maintenanceTicketByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.maintenanceTicket.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
        return ctx.prisma.maintenanceTicket.update({ where: { id: input.id }, data: { archivedAt: new Date() } });
      }),
    delete: permissionProcedure("maintenance", "delete")
      .input(maintenanceTicketByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const attachments = await ctx.prisma.maintenanceAttachment.findMany({
          where: { ticketId: input.id, ticket: { organizationId: ctx.organization.organizationId } },
          select: { objectKey: true },
        });
        await ctx.prisma.maintenanceTicket.findFirstOrThrow({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
        });
        const ticket = await ctx.prisma.maintenanceTicket.delete({ where: { id: input.id } });
        await Promise.all(attachments.map((attachment) => deleteMaintenanceImageObject(attachment.objectKey)));
        return ticket;
      }),
    create: permissionProcedure("maintenance", "create")
      .input(createMaintenanceTicketInputSchema)
      .mutation(async ({ ctx, input }) => {
        const priority = input.isUrgent ? "urgent" : input.priority;
        const units = await ctx.prisma.unit.findMany({
          where: {
            id: { in: input.unitIds },
            propertyId: input.propertyId,
            property: { organizationId: ctx.organization.organizationId },
          },
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
              organizationId: ctx.organization.organizationId,
              unitLabel: input.unitIds.length ? { in: units.map((unit) => unit.name) } : undefined,
              status: { in: ["active", "notice"] },
            },
            select: { id: true },
          });
          if (!tenantLease) {
            throw new Error("The selected tenant is not assigned to the selected unit.");
          }
        } else {
          await ctx.prisma.landlord.findFirstOrThrow({
            where: { id: input.requestedById, organizationId: ctx.organization.organizationId },
            select: { id: true },
          });
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
          organizationId: ctx.organization.organizationId,
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
          where: { organizationId: ctx.organization.organizationId },
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          select: { id: true, label: true, sortOrder: true },
        }),
        ctx.prisma.amenityType.findMany({
          where: { organizationId: ctx.organization.organizationId },
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
        where: { organizationId: ctx.organization.organizationId },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        select: { id: true, label: true, sortOrder: true },
      }),
    ),
    /** Updates an amenity option. */
    update: publicProcedure.input(updateAmenityInputSchema).mutation(async ({ ctx, input }) => {
      await ctx.prisma.amenityType.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.organization.organizationId },
      });
      return ctx.prisma.amenityType.update({
        where: { id: input.id },
        data: { label: input.label, sortOrder: input.sortOrder },
        select: { id: true, label: true, sortOrder: true },
      });
    }),
  }),
  notes: router({
    /** Lists the notes attached to one record. */
    list: publicProcedure.input(noteListInputSchema).query(async ({ ctx, input }) => {
      const { limit, ...subject } = input;
      await requireNotePermission(ctx.prisma, ctx.user.role, subject, "view");

      return ctx.prisma.note.findMany({
        where: {
          ...subject,
          OR: [
            { property: { organizationId: ctx.organization.organizationId } },
            { tenant: { organizationId: ctx.organization.organizationId } },
            { unit: { property: { organizationId: ctx.organization.organizationId } } },
            { maintenanceTicket: { organizationId: ctx.organization.organizationId } },
            { application: { organizationId: ctx.organization.organizationId } },
            { invoice: { organizationId: ctx.organization.organizationId } },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        select: { id: true, body: true, createdAt: true, updatedAt: true },
      });
    }),
    /** Adds an internal note to one record. */
    create: publicProcedure.input(createNoteInputSchema).mutation(async ({ ctx, input }) => {
      await requireNotePermission(ctx.prisma, ctx.user.role, input, "create");
      if ("propertyId" in input) {
        await ctx.prisma.property.findFirstOrThrow({
          where: { id: input.propertyId, organizationId: ctx.organization.organizationId },
        });
      } else if ("tenantId" in input) {
        await ctx.prisma.tenant.findFirstOrThrow({
          where: { id: input.tenantId, organizationId: ctx.organization.organizationId },
        });
      } else if ("unitId" in input) {
        await ctx.prisma.unit.findFirstOrThrow({
          where: { id: input.unitId, property: { organizationId: ctx.organization.organizationId } },
        });
      } else if ("applicationId" in input) {
        await ctx.prisma.application.findFirstOrThrow({
          where: { id: input.applicationId, organizationId: ctx.organization.organizationId },
        });
      } else if ("invoiceId" in input) {
        await ctx.prisma.invoice.findFirstOrThrow({
          where: { id: input.invoiceId, organizationId: ctx.organization.organizationId },
        });
      } else {
        await ctx.prisma.maintenanceTicket.findFirstOrThrow({
          where: { id: input.maintenanceTicketId, organizationId: ctx.organization.organizationId },
        });
      }
      return ctx.prisma.note.create({
        data: input,
        select: { id: true, body: true, createdAt: true, updatedAt: true },
      });
    }),
    /** Updates an internal note. */
    update: publicProcedure.input(updateNoteInputSchema).mutation(async ({ ctx, input }) => {
      const existingNote = await ctx.prisma.note.findFirstOrThrow({
        where: {
          id: input.id,
          OR: [
            { property: { organizationId: ctx.organization.organizationId } },
            { tenant: { organizationId: ctx.organization.organizationId } },
            { unit: { property: { organizationId: ctx.organization.organizationId } } },
            { maintenanceTicket: { organizationId: ctx.organization.organizationId } },
            { application: { organizationId: ctx.organization.organizationId } },
            { invoice: { organizationId: ctx.organization.organizationId } },
          ],
        },
        select: {
          propertyId: true,
          unitId: true,
          tenantId: true,
          maintenanceTicketId: true,
          applicationId: true,
          invoiceId: true,
        },
      });
      await requireNotePermission(ctx.prisma, ctx.user.role, existingNote, "edit");
      return ctx.prisma.$transaction(async (tx) => {
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
      });
    }),
    /** Deletes an internal note. */
    delete: publicProcedure.input(deleteNoteInputSchema).mutation(async ({ ctx, input }) => {
      const existingNote = await ctx.prisma.note.findFirstOrThrow({
        where: {
          id: input.id,
          OR: [
            { property: { organizationId: ctx.organization.organizationId } },
            { tenant: { organizationId: ctx.organization.organizationId } },
            { unit: { property: { organizationId: ctx.organization.organizationId } } },
            { maintenanceTicket: { organizationId: ctx.organization.organizationId } },
            { application: { organizationId: ctx.organization.organizationId } },
            { invoice: { organizationId: ctx.organization.organizationId } },
          ],
        },
        select: {
          propertyId: true,
          unitId: true,
          tenantId: true,
          maintenanceTicketId: true,
          applicationId: true,
          invoiceId: true,
        },
      });
      await requireNotePermission(ctx.prisma, ctx.user.role, existingNote, "delete");
      return ctx.prisma.$transaction(async (tx) => {
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
      });
    }),
  }),
  leases: router({
    /** Archives a lease without changing its contractual status. */
    archive: permissionProcedure("leases", "archive")
      .input(leaseByIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.prisma.lease.update({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
          data: { archivedAt: new Date() },
          select: { id: true, archivedAt: true },
        }),
      ),
    /** Restores an archived lease to the default lease directory. */
    reactivate: permissionProcedure("leases", "archive")
      .input(leaseByIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.prisma.lease.update({
          where: { id: input.id, organizationId: ctx.organization.organizationId },
          data: { archivedAt: null },
          select: { id: true, archivedAt: true },
        }),
      ),
    /** Permanently deletes a draft lease without invoices. */
    delete: permissionProcedure("leases", "delete")
      .input(leaseByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.prisma.$transaction(
          async (tx) => {
            const lease = await tx.lease.findFirstOrThrow({
              where: { id: input.id, organizationId: ctx.organization.organizationId },
              include: { _count: { select: { invoices: true } } },
            });
            if (lease.status !== LeaseStatus.draft || lease._count.invoices > 0) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Only draft leases without invoices can be deleted. Archive the lease instead.",
              });
            }
            return tx.lease.delete({
              where: { id: input.id, organizationId: ctx.organization.organizationId },
              select: { id: true },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      }),
    /** Creates a new lease with tenants and optionally generates invoices. */
    create: permissionProcedure("leases", "create")
      .input(createLeaseWithInvoicesInputSchema)
      .mutation(async ({ ctx, input }) => {
        await Promise.all([
          requirePermission(ctx.prisma, ctx.user.role, "properties", "view"),
          requirePermission(ctx.prisma, ctx.user.role, "units", "view"),
          requirePermission(ctx.prisma, ctx.user.role, "tenants", "view"),
        ]);
        if (input.generateInvoices) {
          await requirePermission(ctx.prisma, ctx.user.role, "invoices", "create");
        }
        const { propertyId, unitId, tenantIds, generateInvoices, ...leaseData } = input;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            return await ctx.prisma.$transaction(
              async (tx) => {
                const property = await tx.property.findFirstOrThrow({
                  where: { id: propertyId, organizationId: ctx.organization.organizationId },
                });
                await tx.unit.findFirstOrThrow({ where: { id: unitId, propertyId } });
                const tenants = await tx.tenant.findMany({
                  where: { id: { in: tenantIds }, organizationId: ctx.organization.organizationId },
                });
                if (tenants.length !== tenantIds.length) {
                  throw new TRPCError({ code: "NOT_FOUND", message: "One or more tenants not found." });
                }

                if (leaseData.status === LeaseStatus.active || leaseData.status === LeaseStatus.notice) {
                  const existingLease = await tx.lease.findFirst({
                    where: {
                      propertyId,
                      unitId,
                      status: { in: [LeaseStatus.active, LeaseStatus.notice] },
                    },
                    select: { id: true },
                  });
                  if (existingLease) {
                    throw new TRPCError({
                      code: "CONFLICT",
                      message: "The selected unit already has an active lease.",
                    });
                  }
                }

                const createdLease = await tx.lease.create({
                  data: {
                    organizationId: ctx.organization.organizationId,
                    propertyId,
                    unitId,
                    ...leaseData,
                    tenants: {
                      create: tenantIds.map((tenantId) => ({
                        organizationId: ctx.organization.organizationId,
                        tenantId,
                      })),
                    },
                  },
                  include: {
                    tenants: { include: { tenant: true } },
                  },
                });

                if (leaseData.status === LeaseStatus.active || leaseData.status === LeaseStatus.notice) {
                  await tx.property.update({
                    where: { id: propertyId },
                    data: { occupiedUnits: property.occupiedUnits + 1 },
                  });
                }

                if (generateInvoices) {
                  const firstPeriod = new Date(
                    createdLease.startsOn.getFullYear(),
                    createdLease.startsOn.getMonth(),
                    1,
                  );
                  const periods = [firstPeriod];
                  let current = new Date(firstPeriod);
                  const invoiceThrough =
                    createdLease.endsOn ??
                    new Date(
                      firstPeriod.getFullYear(),
                      firstPeriod.getMonth() + openEndedLeaseInvoiceHorizonMonths - 1,
                      1,
                    );

                  while (current < invoiceThrough) {
                    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
                    if (current <= invoiceThrough) {
                      periods.push(new Date(current));
                    }
                  }

                  for (const periodStartsOn of periods) {
                    const periodEndsOn = new Date(periodStartsOn.getFullYear(), periodStartsOn.getMonth() + 1, 0);
                    const dueOn = new Date(periodStartsOn.getFullYear(), periodStartsOn.getMonth(), 1);

                    for (const tenant of tenants) {
                      await tx.invoice.create({
                        data: {
                          organizationId: ctx.organization.organizationId,
                          leaseId: createdLease.id,
                          propertyId,
                          tenantId: tenant.id,
                          periodStartsOn,
                          periodEndsOn,
                          dueOn,
                          amountCents: createdLease.monthlyRentCents,
                          balanceCents: createdLease.monthlyRentCents,
                          items: {
                            create: {
                              item: "Rent",
                              quantity: 1,
                              rateCents: createdLease.monthlyRentCents,
                              amountCents: createdLease.monthlyRentCents,
                            },
                          },
                        },
                      });
                    }
                  }
                }

                return createdLease;
              },
              { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
            );
          } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
              throw error;
            }

            if (attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
            }
          }
        }

        throw new TRPCError({
          code: "CONFLICT",
          message: "The lease could not be created because related data changed. Please try again.",
        });
      }),
  }),
  units: router({
    /** Lists units, optionally filtered to a property. */
    list: permissionProcedure("units", "view")
      .input(listUnitsInputSchema)
      .query(async ({ ctx, input }) => {
        const units = await ctx.prisma.unit.findMany({
          where: {
            property: { organizationId: ctx.organization.organizationId },
            ...(input.propertyId ? { propertyId: input.propertyId } : {}),
          },
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
    byId: permissionProcedure("units", "view")
      .input(unitByIdInputSchema)
      .query(async ({ ctx, input }) => {
        const unit = await ctx.prisma.unit.findFirst({
          where: { id: input.id, property: { organizationId: ctx.organization.organizationId } },
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
    create: permissionProcedure("units", "create")
      .input(createUnitInputSchema)
      .mutation(async ({ ctx, input }) => {
        await requirePermission(ctx.prisma, ctx.user.role, "properties", "view");
        const { propertyId, ...unitDetails } = input;
        await ctx.prisma.property.findFirstOrThrow({
          where: { id: propertyId, organizationId: ctx.organization.organizationId },
        });
        await validateUnitOptionIds(ctx.prisma, ctx.organization.organizationId, [unitDetails]);

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
    update: permissionProcedure("units", "edit")
      .input(updateUnitInputSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.prisma.unit.findFirstOrThrow({
          where: { id: input.id, property: { organizationId: ctx.organization.organizationId } },
        });
        await validateUnitOptionIds(ctx.prisma, ctx.organization.organizationId, [input]);
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
    /** Deletes a unit without lease, maintenance, or note history. */
    delete: permissionProcedure("units", "delete")
      .input(unitByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          const unit = await ctx.prisma.$transaction(
            async (tx) => {
              const unit = await tx.unit.findFirstOrThrow({
                where: { id: input.id, property: { organizationId: ctx.organization.organizationId } },
                include: {
                  amenities: {
                    select: { option: { select: { id: true, label: true } } },
                  },
                  utilities: {
                    select: { option: { select: { id: true, label: true } } },
                  },
                },
              });

              const [lease, maintenanceTicket, note] = await Promise.all([
                tx.lease.findFirst({ where: { unitId: input.id }, select: { id: true } }),
                tx.maintenanceTicketUnit.findFirst({ where: { unitId: input.id }, select: { ticketId: true } }),
                tx.note.findFirst({ where: { unitId: input.id }, select: { id: true } }),
              ]);
              if (lease || maintenanceTicket || note) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: "Units with history cannot be deleted. Retain the unit to preserve its records.",
                });
              }

              await tx.unit.delete({ where: { id: input.id } });

              return unit;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );

          return serializeUnit(unit);
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
            throw new TRPCError({ code: "CONFLICT", message: "The unit changed. Please try again." });
          }
          throw error;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
