import { Prisma } from "@prisma/client";

// Functions for recording and managing outbox events in the database.
export type RecordOutboxEventInput = {
  organizationId: number;
  eventType: string;
  schemaVersion: number;
  payload: Prisma.InputJsonValue;
  idempotencyKey: string;
  availableAt?: Date;
};

// Records a new outbox event in the database, ensuring idempotency based on the provided idempotency key.
export async function recordOutboxEvent(tx: Prisma.TransactionClient, input: RecordOutboxEventInput) {
  await tx.outboxEvent.createMany({
    data: {
      organizationId: input.organizationId,
      eventType: input.eventType,
      schemaVersion: input.schemaVersion,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      ...(input.availableAt ? { availableAt: input.availableAt } : {}),
    },
    skipDuplicates: true,
  });

  // Retrieve the event after attempting to create it to ensure we have the latest state.
  const event = await tx.outboxEvent.findUniqueOrThrow({
    where: {
      organizationId_idempotencyKey: {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });

  // Ensure the retrieved event matches the expected event type and schema version.
  if (event.eventType !== input.eventType || event.schemaVersion !== input.schemaVersion) {
    throw new Error(`Outbox idempotency key is already used by ${event.eventType} v${event.schemaVersion}.`);
  }

  return event;
}
