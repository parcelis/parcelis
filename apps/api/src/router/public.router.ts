import {
  createPropertyInputSchema,
  createTagInputSchema,
  createUnitInputSchema,
  leaseStatusSchema,
  propertyByIdInputSchema,
  propertyImageUploadCompleteInputSchema,
  propertyImageUploadInputSchema,
  tenantByIdInputSchema,
  tenantImageUploadCompleteInputSchema,
  tenantImageUploadInputSchema,
  propertyNotesInputSchema,
  propertyStatusInputSchema,
  listUnitsInputSchema,
  updateAmenityInputSchema,
  updatePropertyInputSchema,
  unitByIdInputSchema,
  updateUnitInputSchema,
} from "@parcelis/schemas";
import { z } from "zod";
import { appRouter } from "./app.router";
import { getApiHealth } from "../modules/health";
import { publicProcedure, router } from "./trpc";

const objectSchema = z.object({}).passthrough();
const dataObjectSchema = z.object({ data: objectSchema });
const dataListSchema = z.object({ data: z.array(objectSchema) });
const unitArchiveResponseSchema = z.object({
  data: z.object({ id: z.number().int().positive(), archivedAt: z.iso.datetime().nullable() }),
});
const propertyInventorySchema = z
  .object({
    unitCount: z.number().int().nonnegative().describe("Planned unit capacity."),
    activeUnitCount: z.number().int().nonnegative().describe("Number of unarchived units."),
    occupiedUnits: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe("Unarchived units with an active or notice lease."),
  })
  .passthrough();
const propertyByIdResponseSchema = z.object({
  data: propertyInventorySchema
    .extend({
      unitStatuses: z
        .array(z.union([z.literal("vacant"), leaseStatusSchema]))
        .describe("Unit status values available for filtering."),
    })
    .nullable(),
});

function unitArchiveResponse(unit: { id: number; archivedAt: Date | null }) {
  return { data: { id: unit.id, archivedAt: unit.archivedAt?.toISOString() ?? null } };
}

export const publicRouter = router({
  health: publicProcedure
    .meta({ openapi: { protect: false, method: "GET", path: "/health", tags: ["System"] } })
    .output(dataObjectSchema)
    .query(getApiHealth),
  properties: router({
    list: publicProcedure
      .meta({
        openapi: { protect: true, method: "GET", path: "/properties", tags: ["Properties"] },
      })
      .output(z.object({ data: z.array(propertyInventorySchema) }))
      .query(async ({ ctx }) => ({
        data: await appRouter.createCaller(ctx).properties.list(),
      })),
    byId: publicProcedure
      .meta({
        openapi: { protect: true, method: "GET", path: "/properties/{id}", tags: ["Properties"] },
      })
      .input(propertyByIdInputSchema)
      .output(propertyByIdResponseSchema)
      .query(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.byId(input),
      })),
    create: publicProcedure
      .meta({
        openapi: { protect: true, method: "POST", path: "/properties", tags: ["Properties"] },
      })
      .input(createPropertyInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.create(input),
      })),
    update: publicProcedure
      .meta({
        openapi: {
          protect: true,
          method: "PUT",
          path: "/properties/{id}",
          tags: ["Properties"],
          description: "Synchronizes active units. Archived units stay attached to the property.",
          errorResponses: [400, 401, 403, 404, 409, 500],
        },
      })
      .input(updatePropertyInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.update(input),
      })),
    createImageUploadUrl: publicProcedure
      .meta({
        openapi: { protect: true, method: "POST", path: "/properties/{id}/image-upload-url", tags: ["Properties"] },
      })
      .input(propertyImageUploadInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.createImageUploadUrl(input),
      })),
    completeImageUpload: publicProcedure
      .meta({
        openapi: { protect: true, method: "POST", path: "/properties/{id}/image", tags: ["Properties"] },
      })
      .input(propertyImageUploadCompleteInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.completeImageUpload(input),
      })),
    deleteImage: publicProcedure
      .meta({
        openapi: { protect: true, method: "DELETE", path: "/properties/{id}/image", tags: ["Properties"] },
      })
      .input(propertyByIdInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.deleteImage(input),
      })),
    archive: publicProcedure
      .meta({
        openapi: {
          protect: true,
          method: "PATCH",
          path: "/properties/{id}/archive",
          tags: ["Properties"],
          description: "Scheduled, active, or notice leases block archiving.",
          errorResponses: [400, 401, 403, 404, 409, 500],
        },
      })
      .input(propertyByIdInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.archive(input),
      })),
    inactivate: publicProcedure
      .meta({
        openapi: {
          protect: true,
          method: "POST",
          path: "/properties/{id}/inactive",
          tags: ["Properties"],
          description: "Scheduled, active, or notice leases block archiving.",
          errorResponses: [400, 401, 403, 404, 409, 500],
        },
      })
      .input(propertyStatusInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.inactivate(input),
      })),
    reactivate: publicProcedure
      .meta({
        openapi: { protect: true, method: "POST", path: "/properties/{id}/reactivate", tags: ["Properties"] },
      })
      .input(propertyStatusInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.reactivate(input),
      })),
    delete: publicProcedure
      .meta({
        openapi: { protect: true, method: "DELETE", path: "/properties/{id}", tags: ["Properties"] },
      })
      .input(propertyByIdInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.delete(input),
      })),
    updateNotes: publicProcedure
      .meta({
        openapi: { protect: true, method: "PATCH", path: "/properties/{id}/notes", tags: ["Properties"] },
      })
      .input(propertyNotesInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.updateNotes(input),
      })),
  }),
  tenants: router({
    createImageUploadUrl: publicProcedure
      .meta({
        openapi: { protect: true, method: "POST", path: "/tenants/{id}/image-upload-url", tags: ["Tenants"] },
      })
      .input(tenantImageUploadInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).tenants.createImageUploadUrl(input),
      })),
    completeImageUpload: publicProcedure
      .meta({
        openapi: { protect: true, method: "POST", path: "/tenants/{id}/image", tags: ["Tenants"] },
      })
      .input(tenantImageUploadCompleteInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).tenants.completeImageUpload(input),
      })),
    deleteImage: publicProcedure
      .meta({
        openapi: { protect: true, method: "DELETE", path: "/tenants/{id}/image", tags: ["Tenants"] },
      })
      .input(tenantByIdInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).tenants.deleteImage(input),
      })),
  }),
  tags: router({
    list: publicProcedure
      .meta({ openapi: { protect: true, method: "GET", path: "/tags", tags: ["Tags"] } })
      .output(dataListSchema)
      .query(async ({ ctx }) => ({
        data: await appRouter.createCaller(ctx).tags.list(),
      })),
    create: publicProcedure
      .meta({ openapi: { protect: true, method: "POST", path: "/tags", tags: ["Tags"] } })
      .input(createTagInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).tags.create(input),
      })),
  }),
  unitOptions: router({
    list: publicProcedure
      .meta({
        openapi: { protect: true, method: "GET", path: "/unit-options", tags: ["Unit options"] },
      })
      .output(dataObjectSchema)
      .query(async ({ ctx }) => ({
        data: await appRouter.createCaller(ctx).unitOptions.list(),
      })),
  }),
  amenities: router({
    list: publicProcedure
      .meta({
        openapi: { protect: true, method: "GET", path: "/amenities", tags: ["Amenities"] },
      })
      .output(dataListSchema)
      .query(async ({ ctx }) => ({
        data: await appRouter.createCaller(ctx).amenities.list(),
      })),
    update: publicProcedure
      .meta({
        openapi: { protect: true, method: "PUT", path: "/amenities/{id}", tags: ["Amenities"] },
      })
      .input(updateAmenityInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).amenities.update(input),
      })),
  }),
  units: router({
    list: publicProcedure
      .meta({
        openapi: {
          protect: true,
          method: "GET",
          path: "/units",
          tags: ["Units"],
          description: "Lists active units by default. Use archiveStatus to list archived units or all units.",
        },
      })
      .input(listUnitsInputSchema)
      .output(dataListSchema)
      .query(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).units.list(input),
      })),
    byId: publicProcedure
      .meta({
        openapi: { protect: true, method: "GET", path: "/units/{id}", tags: ["Units"] },
      })
      .input(unitByIdInputSchema)
      .output(z.object({ data: objectSchema.nullable() }))
      .query(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).units.byId(input),
      })),
    create: publicProcedure
      .meta({ openapi: { protect: true, method: "POST", path: "/units", tags: ["Units"] } })
      .input(createUnitInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).units.create(input),
      })),
    update: publicProcedure
      .meta({
        openapi: { protect: true, method: "PATCH", path: "/units/{id}", tags: ["Units"] },
      })
      .input(updateUnitInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).units.update(input),
      })),
    archive: publicProcedure
      .meta({
        openapi: {
          protect: true,
          method: "PATCH",
          path: "/units/{id}/archive",
          tags: ["Units"],
          summary: "Archive a unit",
          description:
            "Archives a unit while preserving its records. Scheduled, active, or notice leases block archiving.",
          errorResponses: [400, 401, 403, 404, 409, 500],
        },
      })
      .input(unitByIdInputSchema)
      .output(unitArchiveResponseSchema)
      .mutation(async ({ ctx, input }) => unitArchiveResponse(await appRouter.createCaller(ctx).units.archive(input))),
    reactivate: publicProcedure
      .meta({
        openapi: {
          protect: true,
          method: "POST",
          path: "/units/{id}/reactivate",
          tags: ["Units"],
          summary: "Restore an archived unit",
          description: "Clears a unit's archive timestamp. Restore its property first if the property is archived.",
          errorResponses: [400, 401, 403, 404, 409, 500],
        },
      })
      .input(unitByIdInputSchema)
      .output(unitArchiveResponseSchema)
      .mutation(async ({ ctx, input }) =>
        unitArchiveResponse(await appRouter.createCaller(ctx).units.reactivate(input)),
      ),
    delete: publicProcedure
      .meta({
        openapi: { protect: true, method: "DELETE", path: "/units/{id}", tags: ["Units"] },
      })
      .input(unitByIdInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).units.delete(input),
      })),
  }),
});
