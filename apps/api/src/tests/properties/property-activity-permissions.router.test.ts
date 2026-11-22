import assert from "node:assert/strict";
import test from "node:test";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

for (const canView of [false, true]) {
  for (const input of [{}, { propertyId: 2 }, { subjectType: "property" as const, subjectId: 2 }]) {
    test(`property activity visibility ${canView}: ${JSON.stringify(input)}`, async () => {
      let reads = 0;
      const event = { id: 1, subjectLabel: "Private property", property: { name: "Private property" } };
      const caller = appRouter.createCaller({
        prisma: {
          rolePermission: { findMany: async () => [{ resource: "properties", canView }] },
          activityEvent: {
            findMany: async ({
              where,
            }: {
              where: { organizationId: number; propertyId?: number; subjectType: unknown };
            }) => {
              reads++;
              assert.equal(where.organizationId, 7);
              assert.equal(where.propertyId, "propertyId" in input ? 2 : undefined);
              assert.deepEqual(
                where.subjectType,
                "subjectType" in input ? "property" : canView ? { not: "lease" } : { notIn: ["lease", "property"] },
              );
              return canView ? [event] : [];
            },
          },
        },
        session: { user: { id: 1, name: "Test User", role: "property_manager" } },
        organization: { organizationId: 7 },
      } as unknown as Context);
      assert.deepEqual(await caller.activityEvents.list(input), canView ? [event] : []);
      assert.equal(reads, !canView && "subjectType" in input ? 0 : 1);
    });
  }
}
