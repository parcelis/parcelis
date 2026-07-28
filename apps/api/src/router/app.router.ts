import {
  createPropertyInputSchema,
  createTagInputSchema,
  createUnitInputSchema,
  propertyByIdInputSchema,
  propertyImageUploadCompleteInputSchema,
  propertyImageUploadInputSchema,
  propertyNotesInputSchema,
  propertyStatusInputSchema,
  listUnitsInputSchema,
  type UnitDetailsInput,
  unitByIdInputSchema,
  updateUnitInputSchema,
  updateAmenityInputSchema,
  updatePropertyInputSchema,
} from "@parcelis/schemas";
import { LeaseStatus, UnitType } from "@parcelis/db";
import {
  createPropertyImageDownloadUrl,
  createPropertyImageUploadUrl,
  deletePropertyImageObject,
  getPublicObjectStorageConfig,
} from "../modules/object-storage.config";
import { publicProcedure, router } from "./trpc";

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
  notes: true,
  unitCount: true,
  occupiedUnits: true,
  status: true,
} as const;

const openMaintenanceStatuses = new Set([
  "open",
  "in_progress",
  "waiting_vendor",
]);
const unitStatuses: Array<"vacant" | LeaseStatus> = [
  "vacant",
  ...Object.values(LeaseStatus),
];

function formatUnitType(unitType: UnitDetailsInput["unitType"]) {
  return unitType === "Commercial" ? UnitType.commercial : UnitType.residential;
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
      endsOn: Date;
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
  const activeLeases = property.leases.filter(
    (lease) => lease.status === "active" || lease.status === "notice",
  );
  const openMaintenanceTickets = property.maintenanceTickets.filter((ticket) =>
    openMaintenanceStatuses.has(ticket.status),
  ).length;
  const urgentMaintenanceTickets = property.maintenanceTickets.filter(
    (ticket) => ticket.priority === "urgent" && ticket.status !== "resolved",
  ).length;

  return {
    ...property,
    monthlyRentCents: activeLeases.reduce(
      (sum, lease) => sum + lease.monthlyRentCents,
      0,
    ),
    amountOverdueCents: activeLeases.reduce(
      (sum, lease) => sum + lease.amountOverdueCents,
      0,
    ),
    expiringLeases90Days: activeLeases.filter(
      (lease) => lease.endsOn >= now && lease.endsOn <= expiresBefore,
    ).length,
    openMaintenanceTickets,
    urgentMaintenanceTickets,
  };
}

export const appRouter = router({
  /** Reports API health and the public object-storage configuration. */
  health: publicProcedure.query(() => ({
    status: "ok",
    service: "parcelis-api",
    objectStorage: getPublicObjectStorageConfig(),
  })),

  properties: router({
    /** Lists up to 50 properties with units, lease metrics, and maintenance metrics. */
    list: publicProcedure.query(async ({ ctx }) => {
      const properties = await ctx.prisma.property.findMany({
        include: {
          tags: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
          leases: {
            select: {
              monthlyRentCents: true,
              amountOverdueCents: true,
              endsOn: true,
              status: true,
              unitLabel: true,
            },
          },
          maintenanceTickets: {
            select: {
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
        properties.map(async (property) => ({
          ...withOperatingMetrics({
            ...property,
            units: property.units.map(serializeUnit),
          }),
          imageUrl: await createPropertyImageDownloadUrl(
            property.imageObjectKey,
          ),
        })),
      );
    }),
    /** Returns one property with its units, leases, and maintenance tickets. */
    byId: publicProcedure
      .input(propertyByIdInputSchema)
      .query(async ({ ctx, input }) => {
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
              ...property,
              units: property.units.map(serializeUnit),
              unitStatuses,
              imageUrl: await createPropertyImageDownloadUrl(
                property.imageObjectKey,
              ),
            }
          : null;
      }),
    /** Creates a short-lived URL for uploading a property image to MinIO. */
    createImageUploadUrl: publicProcedure
      .input(propertyImageUploadInputSchema)
      .mutation(async ({ ctx, input }) => {
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

        if (
          currentProperty.imageObjectKey &&
          currentProperty.imageObjectKey !== input.objectKey
        ) {
          await deletePropertyImageObject(currentProperty.imageObjectKey);
        }

        return property;
      }),
    /** Removes the current image reference and its MinIO object. */
    deleteImage: publicProcedure
      .input(propertyByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
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

        return property;
      }),
    /** Creates a property and its initial units. */
    create: publicProcedure
      .input(createPropertyInputSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.prisma.$transaction(async (tx) => {
          const property = await tx.property.create({
            select: propertySelect,
            data: {
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
              notes:
                input.notes === undefined ? undefined : (input.notes ?? null),
              unitCount: input.unitCount,
            },
          });

          await Promise.all(
            input.units.map((unit) =>
              tx.unit.create({
                data: getUnitCreateData(property.id, unit),
              }),
            ),
          );

          return property;
        });
      }),
    /** Updates a property and synchronizes its units. */
    update: publicProcedure
      .input(updatePropertyInputSchema)
      .mutation(async ({ ctx, input }) => {
        const property = await ctx.prisma.property.update({
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
            notes: input.notes ?? null,
            unitCount: input.unitCount,
          },
        });

        await ctx.prisma.$transaction(async (tx) => {
          const existingUnits = await tx.unit.findMany({
            where: { propertyId: input.id },
            select: { id: true },
          });
          const existingUnitIds = new Set(existingUnits.map((unit) => unit.id));
          const submittedExistingUnitIds = input.units
            .map((unit) => unit.id)
            .filter((unitId): unitId is number =>
              Boolean(unitId && existingUnitIds.has(unitId)),
            );

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
        });

        return property;
      }),
    /** Marks a property as archived. */
    archive: publicProcedure
      .input(propertyByIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.prisma.property.update({
          where: { id: input.id },
          select: propertySelect,
          data: { status: "archived" },
        }),
      ),
    /** Marks a property as inactive. */
    inactivate: publicProcedure
      .input(propertyStatusInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.prisma.property.update({
          where: { id: input.id },
          select: propertySelect,
          data: { status: "archived" },
        }),
      ),
    /** Restores an inactive property to active status. */
    reactivate: publicProcedure
      .input(propertyStatusInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.prisma.property.update({
          where: { id: input.id },
          select: propertySelect,
          data: { status: "active" },
        }),
      ),
    /** Permanently deletes a property and its related operational records. */
    delete: publicProcedure
      .input(propertyByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
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

        return property;
      }),
    /** Updates the notes stored on a property. */
    updateNotes: publicProcedure
      .input(propertyNotesInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.prisma.property.update({
          where: { id: input.id },
          select: propertySelect,
          data: { notes: input.notes ?? null },
        }),
      ),
  }),
  tenants: router({
    /** Lists tenants with their most recent lease first. */
    list: publicProcedure.query(async ({ ctx }) => {
      const tenants = await ctx.prisma.tenant.findMany({
        include: {
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

      return tenants.map((tenant) => ({
        ...tenant,
        tenantStatus: tenant.archivedAt
          ? "archived"
          : tenant.leases.some(
                (lease) =>
                  lease.status === "active" || lease.status === "notice",
              )
            ? "active"
            : "past",
      }));
    }),
  }),
  tags: router({
    list: publicProcedure.query(({ ctx }) =>
      ctx.prisma.tag.findMany({
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        select: { id: true, label: true, sortOrder: true },
      }),
    ),
    create: publicProcedure
      .input(createTagInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.prisma.tag.create({
          data: { label: input.label },
          select: { id: true, label: true, sortOrder: true },
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
    update: publicProcedure
      .input(updateAmenityInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.prisma.amenityType.update({
          where: { id: input.id },
          data: { label: input.label, sortOrder: input.sortOrder },
          select: { id: true, label: true, sortOrder: true },
        }),
      ),
  }),
  units: router({
    /** Lists units, optionally filtered to a property. */
    list: publicProcedure
      .input(listUnitsInputSchema)
      .query(async ({ ctx, input }) => {
        const units = await ctx.prisma.unit.findMany({
          where: input.propertyId
            ? { propertyId: input.propertyId }
            : undefined,
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
    byId: publicProcedure
      .input(unitByIdInputSchema)
      .query(async ({ ctx, input }) => {
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
    create: publicProcedure
      .input(createUnitInputSchema)
      .mutation(({ ctx, input }) => {
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
    update: publicProcedure
      .input(updateUnitInputSchema)
      .mutation(async ({ ctx, input }) => {
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
    delete: publicProcedure
      .input(unitByIdInputSchema)
      .mutation(async ({ ctx, input }) => {
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
