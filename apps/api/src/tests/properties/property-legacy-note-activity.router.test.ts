import assert from "node:assert/strict";
import test from "node:test";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";
import { withActivityActor } from "../../modules/activity-actor";

const propertyInput = {
  name: "Oak House",
  propertyType: "House" as const,
  address: { line1: "123 Oak Street", city: "Chicago", region: "IL", postalCode: "60601" },
  tagIds: [],
  unitCount: 0,
  units: [],
};
type Note = { id: number; body: string };
function harness(originalBody: string | null, failLogging = false) {
  const state = {
    note: originalBody === null ? null : ({ id: 9, body: originalBody } as Note | null),
    property: {
      id: 2,
      name: propertyInput.name,
      legacyNoteId: originalBody === null ? null : 9,
      legacyNotes: originalBody,
    },
    events: [] as unknown[],
  };
  const prisma = {
    property: {
      findFirstOrThrow: async ({ where }: { where: unknown }) => {
        assert.deepEqual(where, { id: 2, organizationId: 7 });
        return state.property;
      },
    },
    tag: { count: async () => 0 },
    amenityType: { count: async () => 0 },
    utilityType: { count: async () => 0 },
    unit: { findMany: async () => [] },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const pending = structuredClone(state);
      const tx = {
        property: {
          findUniqueOrThrow: async () => pending.property,
          create: async () => pending.property,
          update: async ({ data }: { data: Partial<typeof pending.property> }) => {
            Object.assign(pending.property, data);
            return pending.property;
          },
        },
        unit: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
        note: {
          findFirst: async ({ where }: { where: unknown }) => {
            assert.deepEqual(where, { id: 9, propertyId: 2 });
            return pending.note;
          },
          create: async ({ data }: { data: { propertyId: number; body: string } }) => {
            assert.equal(data.propertyId, 2);
            pending.note = { id: 9, body: data.body };
            return pending.note;
          },
          updateMany: async ({ where, data }: { where: unknown; data: { body: string } }) => {
            assert.deepEqual(where, { id: 9, propertyId: 2 });
            pending.note = { id: 9, body: data.body };
            return { count: 1 };
          },
          deleteMany: async ({ where }: { where: unknown }) => {
            assert.deepEqual(where, { id: 9, propertyId: 2 });
            pending.note = null;
            return { count: 1 };
          },
        },
        activityEvent: {
          create: async ({ data }: { data: unknown }) => {
            if (failLogging) throw new Error("Activity write failed");
            pending.events.push(data);
          },
        },
      };
      const result = await callback(tx);
      Object.assign(state, pending);
      return result;
    },
  };
  const caller = appRouter.createCaller({
    prisma,
    session: { userId: 1, user: { id: 1, name: "Test User", role: "administrator" } },
    organization: { organizationId: 7 },
  } as unknown as Context);
  return { caller, state };
}

for (const route of ["create", "update", "updateNotes"] as const) {
  for (const operation of ["added", "updated", "deleted", "unchanged", "empty"] as const) {
    if (route === "create" && !["added", "empty"].includes(operation)) continue;
    for (const failLogging of [false, true]) {
      if (failLogging && ["empty", "unchanged"].includes(operation)) continue;
      test(`properties.${route} note ${operation}${failLogging ? " rolls back on logging failure" : ""}`, async () => {
        const originalBody = ["added", "empty"].includes(operation) ? null : "Original note";
        const notes =
          operation === "deleted" || operation === "empty"
            ? "  "
            : operation === "unchanged"
              ? "Original note"
              : "New note";
        const { caller, state } = harness(originalBody, failLogging);
        const before = structuredClone(state);
        const result =
          route === "create"
            ? caller.properties.create({ ...propertyInput, notes })
            : route === "update"
              ? caller.properties.update({ ...propertyInput, id: 2, notes })
              : caller.properties.updateNotes({ id: 2, notes });
        if (failLogging) {
          await assert.rejects(result, /Activity write failed/);
          assert.deepEqual(state, before);
          return;
        }
        const saved = await result;
        assert.equal(saved.notes, notes.trim() || null);
        assert.deepEqual(
          state.events,
          ["empty", "unchanged"].includes(operation)
            ? []
            : [
                {
                  organizationId: 7,
                  subjectType: "property",
                  subjectId: 2,
                  subjectLabel: propertyInput.name,
                  propertyId: 2,
                  action: `property.note_${operation}`,
                  metadata: { noteId: 9 },
                  actorId: "1",
                  actorLabel: "Test User",
                },
              ],
        );
        assert.equal(state.note?.body ?? null, notes.trim() || null);
      });
    }
  }
}

test("legacy note logging preserves the API-token activity actor", async () => {
  const { caller, state } = harness(null);
  await withActivityActor({ id: "api-token:3", name: "API token: Legacy importer" }, () =>
    caller.properties.updateNotes({ id: 2, notes: "Imported note" }),
  );
  assert.equal(state.events.length, 1);
  assert.equal((state.events[0] as { actorId: string }).actorId, "api-token:3");
  assert.equal((state.events[0] as { actorLabel: string }).actorLabel, "API token: Legacy importer");
});
