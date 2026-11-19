import assert from "node:assert/strict";
import test from "node:test";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

for (const failLogging of [false, true]) {
  test(`maintenance note creation ${failLogging ? "rolls back when logging fails" : "records ticket activity"}`, async () => {
    const note = { id: 9, body: "Vendor contacted", createdAt: new Date(), updatedAt: new Date() };
    let pendingNote: typeof note | null = null;
    let committedNote: typeof note | null = null;
    let activity: unknown;
    const tx = {
      maintenanceTicket: {
        findFirstOrThrow: async ({ where }: { where: unknown }) => {
          assert.deepEqual(where, { id: 2, organizationId: 7 });
          return { id: 2, organizationId: 7, propertyId: 3, ticketNumber: 12, title: "Leaking faucet" };
        },
      },
      note: {
        create: async ({ data }: { data: unknown }) => {
          assert.deepEqual(data, { maintenanceTicketId: 2, body: note.body });
          pendingNote = note;
          return note;
        },
      },
      activityEvent: {
        create: async ({ data }: { data: unknown }) => {
          assert.deepEqual(pendingNote, note);
          activity = data;
          if (failLogging) throw new Error("Logging failed");
        },
      },
    };
    const caller = appRouter.createCaller({
      prisma: {
        $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
          try {
            const result = await callback(tx);
            committedNote = pendingNote;
            return result;
          } finally {
            pendingNote = null;
          }
        },
      },
      session: { user: { id: 1, name: "Test User", role: "administrator" } },
      organization: { organizationId: 7 },
    } as unknown as Context);
    const result = caller.notes.create({ maintenanceTicketId: 2, body: note.body });
    if (failLogging) await assert.rejects(result, /Logging failed/);
    else assert.deepEqual(await result, note);
    assert.deepEqual(committedNote, failLogging ? null : note);
    assert.equal(pendingNote, null);
    assert.deepEqual(activity, {
      organizationId: 7,
      subjectType: "maintenance_ticket",
      subjectId: 2,
      subjectLabel: "Leaking faucet",
      subjectReference: "MNT-0000012",
      propertyId: 3,
      action: "maintenance.note_added",
      metadata: { noteId: 9 },
      actorId: "1",
      actorLabel: "Test User",
    });
  });
}

for (const operation of ["update", "delete"] as const) {
  for (const scenario of ["maintenance", "logging failure", "other note"] as const) {
    test(`note ${operation}: ${scenario}`, async () => {
      const originalNote = { id: 9, body: "Vendor contacted", createdAt: new Date(), updatedAt: new Date() };
      const updatedNote = { ...originalNote, body: "Vendor arriving tomorrow" };
      const isMaintenance = scenario !== "other note";
      let pendingNote: typeof originalNote | null = originalNote;
      let committedNote: typeof originalNote | null = originalNote;
      let activity: unknown;
      const tx = {
        maintenanceTicket: {
          findFirstOrThrow: async ({ where }: { where: unknown }) => {
            assert.equal(isMaintenance, true);
            assert.deepEqual(where, { id: 2, organizationId: 7 });
            return { id: 2, organizationId: 7, propertyId: 3, ticketNumber: 12, title: "Leaking faucet" };
          },
        },
        note: {
          update: async ({ where, data }: { where: unknown; data: unknown }) => {
            assert.equal(operation, "update");
            assert.deepEqual(where, { id: originalNote.id });
            assert.deepEqual(data, { body: updatedNote.body });
            pendingNote = updatedNote;
            return { ...updatedNote, propertyId: null, tenantId: null };
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
            assert.equal(isMaintenance, true);
            assert.deepEqual(pendingNote, operation === "update" ? updatedNote : null);
            assert.equal(committedNote, originalNote);
            activity = data;
            if (scenario === "logging failure") throw new Error("Logging failed");
          },
        },
      };
      const caller = appRouter.createCaller({
        prisma: {
          note: {
            findFirstOrThrow: async ({ where }: { where: { id: number } }) => {
              assert.equal(where.id, originalNote.id);
              return {
                propertyId: null,
                tenantId: null,
                unitId: null,
                maintenanceTicketId: isMaintenance ? 2 : null,
                applicationId: null,
                invoiceId: isMaintenance ? null : 5,
              };
            },
          },
          $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
            const result = await callback(tx);
            committedNote = pendingNote;
            return result;
          },
        },
        session: { user: { id: 1, name: "Test User", role: "administrator" } },
        organization: { organizationId: 7 },
      } as unknown as Context);

      const result =
        operation === "update"
          ? caller.notes.update({ id: originalNote.id, body: updatedNote.body })
          : caller.notes.delete({ id: originalNote.id });
      if (scenario === "logging failure") {
        await assert.rejects(result, /Logging failed/);
        assert.deepEqual(committedNote, originalNote);
      } else {
        assert.deepEqual(await result, operation === "update" ? updatedNote : originalNote);
        assert.deepEqual(committedNote, operation === "update" ? updatedNote : null);
      }
      assert.deepEqual(
        activity,
        isMaintenance
          ? {
              organizationId: 7,
              subjectType: "maintenance_ticket",
              subjectId: 2,
              subjectLabel: "Leaking faucet",
              subjectReference: "MNT-0000012",
              propertyId: 3,
              action: `maintenance.note_${operation === "update" ? "updated" : "deleted"}`,
              metadata: { noteId: originalNote.id },
              actorId: "1",
              actorLabel: "Test User",
            }
          : undefined,
      );
    });
  }
}
