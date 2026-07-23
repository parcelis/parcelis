import {
  createPropertyInputSchema,
  propertyByIdInputSchema,
  propertyNotesInputSchema,
  type UnitDetailsInput,
  updatePropertyInputSchema,
} from "@parcelis/schemas";
import { UnitType } from "@parcelis/db";
import { getPublicObjectStorageConfig } from "../modules/object-storage.config";
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

function formatUnitType(unitType: UnitDetailsInput["unitType"]) {
  return unitType === "Commercial" ? UnitType.commercial : UnitType.residential;
}

function getUnitCreateData(propertyId: string, unitDetails: UnitDetailsInput) {
  return {
    propertyId,
    name: unitDetails.name,
    marketRateCents: unitDetails.marketRateCents,
    unitType: formatUnitType(unitDetails.unitType),
    bedrooms: unitDetails.bedrooms,
    bathrooms: unitDetails.bathrooms,
    squareFeet: unitDetails.squareFeet,
    rentIncludes: {
      create: unitDetails.rentIncludeOptionIds.map((optionId) => ({
        option: { connect: { id: optionId } },
      })),
    },
    amenities: {
      create: unitDetails.amenityOptionIds.map((optionId) => ({
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
    rentIncludes: {
      create: unitDetails.rentIncludeOptionIds.map((optionId) => ({
        option: { connect: { id: optionId } },
      })),
    },
    amenities: {
      create: unitDetails.amenityOptionIds.map((optionId) => ({
        option: { connect: { id: optionId } },
      })),
    },
  };
}

function serializeUnit<
  T extends {
    bathrooms: unknown;
    amenities: Array<{ option: { id: string } }>;
    rentIncludes: Array<{ option: { id: string } }>;
  },
>(unit: T) {
  return {
    ...unit,
    bathrooms: unit.bathrooms === null ? null : Number(unit.bathrooms),
    amenityOptionIds: unit.amenities.map((amenity) => amenity.option.id),
    rentIncludeOptionIds: unit.rentIncludes.map(
      (rentInclude) => rentInclude.option.id,
    ),
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
  health: publicProcedure.query(() => ({
    status: "ok",
    service: "parcelis-api",
    objectStorage: getPublicObjectStorageConfig(),
  })),

  properties: router({
    list: publicProcedure.query(async ({ ctx }) => {
      const properties = await ctx.prisma.property.findMany({
        include: {
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
              amenities: { select: { option: { select: { id: true } } } },
              rentIncludes: { select: { option: { select: { id: true } } } },
            },
          },
        },
        orderBy: { name: "asc" },
        take: 50,
      });

      return properties.map((property) =>
        withOperatingMetrics({
          ...property,
          units: property.units.map(serializeUnit),
        }),
      );
    }),
    byId: publicProcedure
      .input(propertyByIdInputSchema)
      .query(async ({ ctx, input }) => {
        const property = await ctx.prisma.property.findUnique({
          where: { id: input.id },
          include: {
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
                amenities: { select: { option: { select: { id: true } } } },
                rentIncludes: { select: { option: { select: { id: true } } } },
              },
            },
          },
        });

        return property
          ? {
              ...property,
              units: property.units.map(serializeUnit),
            }
          : null;
      }),
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
            .filter((unitId): unitId is string =>
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
                await tx.unitRentInclude.deleteMany({
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
    archive: publicProcedure
      .input(propertyByIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.prisma.property.update({
          where: { id: input.id },
          select: propertySelect,
          data: { status: "archived" },
        }),
      ),
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
  unitOptions: router({
    list: publicProcedure.query(async ({ ctx }) => {
      const [rentIncludes, amenities] = await Promise.all([
        ctx.prisma.rentIncludeOption.findMany({
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          select: { id: true, label: true, sortOrder: true },
        }),
        ctx.prisma.amenityOption.findMany({
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          select: { id: true, label: true, sortOrder: true },
        }),
      ]);

      return { rentIncludes, amenities };
    }),
  }),
});

export type AppRouter = typeof appRouter;
