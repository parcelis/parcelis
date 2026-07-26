import {
  createPropertyInputSchema,
  createUnitInputSchema,
  propertyByIdInputSchema,
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
import { getPublicObjectStorageConfig } from "../modules/object-storage.config";
import { publicProcedure, router } from "./trpc";

const objectSchema = z.object({}).passthrough();
const dataObjectSchema = z.object({ data: objectSchema });
const dataListSchema = z.object({ data: z.array(objectSchema) });

export const publicRouter = router({
  health: publicProcedure
    .meta({ openapi: { method: "GET", path: "/health", tags: ["System"] } })
    .output(dataObjectSchema)
    .query(() => ({
      data: {
        status: "ok",
        service: "parcelis-api",
        objectStorage: getPublicObjectStorageConfig(),
      },
    })),
  properties: router({
    list: publicProcedure
      .meta({ openapi: { method: "GET", path: "/properties", tags: ["Properties"] } })
      .output(dataListSchema)
      .query(async ({ ctx }) => ({
        data: await appRouter.createCaller(ctx).properties.list(),
      })),
    byId: publicProcedure
      .meta({ openapi: { method: "GET", path: "/properties/{id}", tags: ["Properties"] } })
      .input(propertyByIdInputSchema)
      .output(z.object({ data: objectSchema.nullable() }))
      .query(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.byId(input),
      })),
    create: publicProcedure
      .meta({ openapi: { method: "POST", path: "/properties", tags: ["Properties"] } })
      .input(createPropertyInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.create(input),
      })),
    update: publicProcedure
      .meta({ openapi: { method: "PUT", path: "/properties/{id}", tags: ["Properties"] } })
      .input(updatePropertyInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.update(input),
      })),
    archive: publicProcedure
      .meta({
        openapi: { method: "PATCH", path: "/properties/{id}/archive", tags: ["Properties"] },
      })
      .input(propertyByIdInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.archive(input),
      })),
    inactivate: publicProcedure
      .meta({
        openapi: { method: "POST", path: "/properties/{id}/inactive", tags: ["Properties"] },
      })
      .input(propertyStatusInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.inactivate(input),
      })),
    reactivate: publicProcedure
      .meta({
        openapi: { method: "POST", path: "/properties/{id}/reactivate", tags: ["Properties"] },
      })
      .input(propertyStatusInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.reactivate(input),
      })),
    delete: publicProcedure
      .meta({ openapi: { method: "DELETE", path: "/properties/{id}", tags: ["Properties"] } })
      .input(propertyByIdInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.delete(input),
      })),
    updateNotes: publicProcedure
      .meta({
        openapi: { method: "PATCH", path: "/properties/{id}/notes", tags: ["Properties"] },
      })
      .input(propertyNotesInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).properties.updateNotes(input),
      })),
  }),
  unitOptions: router({
    list: publicProcedure
      .meta({ openapi: { method: "GET", path: "/unit-options", tags: ["Unit options"] } })
      .output(dataObjectSchema)
      .query(async ({ ctx }) => ({
        data: await appRouter.createCaller(ctx).unitOptions.list(),
      })),
  }),
  amenities: router({
    list: publicProcedure
      .meta({ openapi: { method: "GET", path: "/amenities", tags: ["Amenities"] } })
      .output(dataListSchema)
      .query(async ({ ctx }) => ({
        data: await appRouter.createCaller(ctx).amenities.list(),
      })),
    update: publicProcedure
      .meta({ openapi: { method: "PUT", path: "/amenities/{id}", tags: ["Amenities"] } })
      .input(updateAmenityInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).amenities.update(input),
      })),
  }),
  units: router({
    list: publicProcedure
      .meta({ openapi: { method: "GET", path: "/units", tags: ["Units"] } })
      .input(listUnitsInputSchema)
      .output(dataListSchema)
      .query(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).units.list(input),
      })),
    byId: publicProcedure
      .meta({ openapi: { method: "GET", path: "/units/{id}", tags: ["Units"] } })
      .input(unitByIdInputSchema)
      .output(z.object({ data: objectSchema.nullable() }))
      .query(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).units.byId(input),
      })),
    create: publicProcedure
      .meta({ openapi: { method: "POST", path: "/units", tags: ["Units"] } })
      .input(createUnitInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).units.create(input),
      })),
    update: publicProcedure
      .meta({ openapi: { method: "PATCH", path: "/units/{id}", tags: ["Units"] } })
      .input(updateUnitInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).units.update(input),
      })),
    delete: publicProcedure
      .meta({ openapi: { method: "DELETE", path: "/units/{id}", tags: ["Units"] } })
      .input(unitByIdInputSchema)
      .output(dataObjectSchema)
      .mutation(async ({ ctx, input }) => ({
        data: await appRouter.createCaller(ctx).units.delete(input),
      })),
  }),
});
