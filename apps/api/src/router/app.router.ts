import {
  createPropertyInputSchema,
  propertyByIdInputSchema,
  propertyNotesInputSchema,
  updatePropertyInputSchema,
} from "@parcelis/schemas";
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

const openMaintenanceStatuses = new Set(["open", "in_progress", "waiting_vendor"]);

function withOperatingMetrics<
  T extends {
    leases: Array<{
      monthlyRentCents: number;
      amountOverdueCents: number;
      endsOn: Date;
      status: string;
      unitLabel: string;
    }>;
    maintenanceTickets: Array<{ priority: string; status: string; unitLabel: string | null }>;
  },
>(property: T) {
  const now = new Date();
  const expiresBefore = new Date(now);
  expiresBefore.setDate(expiresBefore.getDate() + 90);
  const activeLeases = property.leases.filter((lease) => lease.status === "active" || lease.status === "notice");
  const openMaintenanceTickets = property.maintenanceTickets.filter((ticket) =>
    openMaintenanceStatuses.has(ticket.status),
  ).length;
  const urgentMaintenanceTickets = property.maintenanceTickets.filter(
    (ticket) => ticket.priority === "urgent" && ticket.status !== "resolved",
  ).length;

  return {
    ...property,
    monthlyRentCents: activeLeases.reduce((sum, lease) => sum + lease.monthlyRentCents, 0),
    amountOverdueCents: activeLeases.reduce((sum, lease) => sum + lease.amountOverdueCents, 0),
    expiringLeases90Days: activeLeases.filter((lease) => lease.endsOn >= now && lease.endsOn <= expiresBefore).length,
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
        },
        orderBy: { name: "asc" },
        take: 50,
      });

      return properties.map(withOperatingMetrics);
    }),
    byId: publicProcedure.input(propertyByIdInputSchema).query(({ ctx, input }) =>
      ctx.prisma.property.findUnique({
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
        },
      }),
    ),
    create: publicProcedure.input(createPropertyInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.property.create({
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
          notes: input.notes === undefined ? undefined : input.notes ?? null,
          unitCount: input.unitCount,
        },
      }),
    ),
    update: publicProcedure.input(updatePropertyInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.property.update({
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
      }),
    ),
    archive: publicProcedure.input(propertyByIdInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.property.update({
        where: { id: input.id },
        select: propertySelect,
        data: { status: "archived" },
      }),
    ),
    delete: publicProcedure.input(propertyByIdInputSchema).mutation(async ({ ctx, input }) => {
      const property = await ctx.prisma.property.findUniqueOrThrow({
        where: { id: input.id },
        select: propertySelect,
      });

      await ctx.prisma.$transaction([
        ctx.prisma.maintenanceTicket.deleteMany({ where: { propertyId: input.id } }),
        ctx.prisma.lease.deleteMany({ where: { propertyId: input.id } }),
        ctx.prisma.property.delete({ where: { id: input.id } }),
      ]);

      return property;
    }),
    updateNotes: publicProcedure.input(propertyNotesInputSchema).mutation(({ ctx, input }) =>
      ctx.prisma.property.update({
        where: { id: input.id },
        select: propertySelect,
        data: { notes: input.notes ?? null },
      }),
    ),
  }),
});

export type AppRouter = typeof appRouter;
