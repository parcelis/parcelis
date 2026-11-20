import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

const originalNote = {
  id: 9,
  body: "Inspection scheduled",
  createdAt: new Date("2026-11-19T10:00:00Z"),
  updatedAt: new Date("2026-11-19T10:00:00Z"),
};
const updatedNote = { ...originalNote, body: "Inspection completed" };
const property = { id: 2, name: "Oak House", organizationId: 7 };
type Operation = "create" | "update" | "delete";
type Scenario = "success" | "logging failure" | "foreign property" | "denied note permission" | "denied property view";

function createHarness(operation: Operation, scenario: Scenario) {
  const state = {
    note: operation === "create" ? null : (originalNote as typeof originalNote | null),
    events: [] as unknown[],
    transactions: 0,
  };
  const caller = appRouter.createCaller({
    prisma: {
      rolePermission: {
        findUnique: async ({ where }: { where: { role_resource: { resource: string } } }) => {
          const resource = where.role_resource.resource;
          const denied =
            (scenario === "denied note permission" && resource === "property_notes") ||
            (scenario === "denied property view" && resource === "properties");
          return {
            canView: !denied,
            canCreate: !denied && resource === "property_notes",
            canEdit: !denied && resource === "property_notes",
            canDelete: !denied && resource === "property_notes",
          };
        },
      },
      note: {
        findFirstOrThrow: async ({ where }: { where: { id: number; OR: unknown[] } }) => {
          assert.equal(where.id, originalNote.id);
          assert.ok(
            where.OR.some((filter) => JSON.stringify(filter) === JSON.stringify({ property: { organizationId: 7 } })),
          );
          if (scenario === "foreign property") throw new TRPCError({ code: "NOT_FOUND" });
          return {
            propertyId: property.id,
            tenantId: null,
            unitId: null,
            maintenanceTicketId: null,
            applicationId: null,
            invoiceId: null,
          };
        },
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        state.transactions += 1;
        let pendingNote = state.note;
        const pendingEvents: unknown[] = [];
        const tx = {
          property: {
            updateMany: async () => ({ count: 0 }),
            findFirstOrThrow: async ({ where }: { where: unknown }) => {
              assert.deepEqual(where, { id: property.id, organizationId: 7 });
              if (scenario === "foreign property") throw new TRPCError({ code: "NOT_FOUND" });
              return property;
            },
          },
          note: {
            create: async ({ data }: { data: unknown }) => {
              assert.equal(operation, "create");
              assert.deepEqual(data, { propertyId: property.id, body: originalNote.body });
              pendingNote = originalNote;
              return originalNote;
            },
            update: async ({ where, data }: { where: unknown; data: unknown }) => {
              assert.equal(operation, "update");
              assert.deepEqual(where, { id: originalNote.id });
              assert.deepEqual(data, { body: updatedNote.body });
              pendingNote = updatedNote;
              return { ...updatedNote, propertyId: property.id, tenantId: null };
            },
            findUniqueOrThrow: async () => ({ legacyProperty: null, legacyTenant: null }),
            delete: async ({ where }: { where: unknown }) => {
              assert.equal(operation, "delete");
              assert.deepEqual(where, { id: originalNote.id });
              pendingNote = null;
              return originalNote;
            },
          },
          activityEvent: {
            create: async ({ data }: { data: unknown }) => {
              if (scenario === "logging failure") throw new Error("Activity write failed");
              pendingEvents.push(data);
            },
          },
        };
        const result = await callback(tx);
        state.note = pendingNote;
        state.events.push(...pendingEvents);
        return result;
      },
    },
    session: { userId: 1, user: { id: 1, name: "Property Manager", role: "property_manager" } },
    organization: { organizationId: 7 },
  } as unknown as Context);
  return { caller, state };
}

for (const operation of ["create", "update", "delete"] as const) {
  for (const scenario of [
    "success",
    "logging failure",
    "foreign property",
    "denied note permission",
    "denied property view",
  ] as const) {
    test(`property note ${operation}: ${scenario}`, async () => {
      const { caller, state } = createHarness(operation, scenario);
      const initialNote = state.note;
      const result =
        operation === "create"
          ? caller.notes.create({ propertyId: property.id, body: originalNote.body })
          : operation === "update"
            ? caller.notes.update({ id: originalNote.id, body: updatedNote.body })
            : caller.notes.delete({ id: originalNote.id });
      if (scenario === "success") {
        assert.deepEqual(await result, operation === "update" ? updatedNote : originalNote);
        assert.deepEqual(
          state.note,
          operation === "delete" ? null : operation === "update" ? updatedNote : originalNote,
        );
        assert.equal(state.transactions, 1);
        assert.deepEqual(state.events, [
          {
            organizationId: 7,
            subjectType: "property",
            subjectId: property.id,
            subjectLabel: property.name,
            propertyId: property.id,
            action: `property.note_${operation === "create" ? "added" : operation === "update" ? "updated" : "deleted"}`,
            metadata: { noteId: originalNote.id },
            actorId: "1",
            actorLabel: "Property Manager",
          },
        ]);
      } else {
        if (scenario === "logging failure") await assert.rejects(result, /Activity write failed/);
        else await assert.rejects(result, { code: scenario === "foreign property" ? "NOT_FOUND" : "FORBIDDEN" });
        assert.deepEqual(state.note, initialNote);
        assert.deepEqual(state.events, []);
        if (scenario.startsWith("denied")) assert.equal(state.transactions, 0);
      }
    });
  }
}
