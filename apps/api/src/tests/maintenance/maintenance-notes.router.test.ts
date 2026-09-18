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
