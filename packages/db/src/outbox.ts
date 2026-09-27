import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { OutboxEventStatus, Prisma, PrismaClient } from "@prisma/client";

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
  if (
    event.eventType !== input.eventType ||
    event.schemaVersion !== input.schemaVersion ||
    !isDeepStrictEqual(event.payload, input.payload)
  ) {
    throw new Error("Outbox idempotency key is already used by a different event.");
  }

  return event;
}

// Default configuration values for claiming outbox events.
const defaultOutboxClaimLimit = 25;
const maximumOutboxClaimLimit = 100;
const defaultOutboxLockDurationMs = 60_000;
const defaultOutboxRetryBaseDelayMs = 1_000;
const maximumOutboxRetryDelayMs = 15 * 60_000;

// Options for claiming available outbox events.
export type ClaimAvailableOutboxEventsOptions = {
  now?: Date;
  limit?: number;
  lockDurationMs?: number;
  claimToken?: string;
};

// Constructs the Prisma where input for claimable outbox events based on the current time.
function getClaimableOutboxEventWhere(now: Date): Prisma.OutboxEventWhereInput {
  return {
    OR: [
      {
        status: OutboxEventStatus.pending,
        availableAt: { lte: now },
      },
      {
        status: OutboxEventStatus.processing,
        OR: [{ lockedUntil: { lte: now } }, { lockedUntil: null }],
      },
    ],
  };
}

// Claims available outbox events for processing, ensuring they are locked and assigned a claim token.
export async function claimAvailableOutboxEvents(
  prisma: PrismaClient | Prisma.TransactionClient,
  options: ClaimAvailableOutboxEventsOptions = {},
) {
  // Determine the current time, claim limit, and lock duration based on the provided options or defaults.
  const now = options.now ?? new Date();
  const limit = options.limit ?? defaultOutboxClaimLimit;
  const lockDurationMs = options.lockDurationMs ?? defaultOutboxLockDurationMs;

  // Validate the claim limit to ensure it is within the acceptable range.
  if (!Number.isInteger(limit) || limit < 1 || limit > maximumOutboxClaimLimit) {
    throw new Error(`Outbox claim limit must be an integer between 1 and ${maximumOutboxClaimLimit}.`);
  }

  // Validate the lock duration to ensure it is a positive integer.
  if (!Number.isInteger(lockDurationMs) || lockDurationMs < 1) {
    throw new Error("Outbox lock duration must be a positive integer.");
  }

  // Generate the claim token, calculate the locked until timestamp, and determine the claimable outbox events.
  const claimToken = options.claimToken ?? randomUUID();
  const lockedUntil = new Date(now.getTime() + lockDurationMs);
  const claimableWhere = getClaimableOutboxEventWhere(now);

  // Retrieve the candidate outbox events that are eligible for claiming.
  const candidates = await prisma.outboxEvent.findMany({
    where: claimableWhere,
    select: { id: true },
    orderBy: [{ availableAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  // Attempt to claim each candidate outbox event by updating its status and assigning the claim token.
  const results = await Promise.all(
    candidates.map((candidate) =>
      prisma.outboxEvent.updateMany({
        where: { id: candidate.id, ...claimableWhere },
        data: {
          status: OutboxEventStatus.processing,
          attemptCount: { increment: 1 },
          lastAttemptAt: now,
          lockedUntil,
          claimToken,
        },
      }),
    ),
  );
  // Determine which outbox events were successfully claimed based on the update results.
  const claimedIds = candidates.filter((_, index) => results[index]?.count === 1).map(({ id }) => id);

  // If no outbox events were successfully claimed, return an empty array.
  if (claimedIds.length === 0) {
    return [];
  }

  // Retrieve and return the successfully claimed outbox events, ensuring they are still in the processing state and match the claim token.
  return prisma.outboxEvent.findMany({
    where: {
      id: { in: claimedIds },
      status: OutboxEventStatus.processing,
      claimToken,
    },
    orderBy: { id: "asc" },
  });
}

// Input type for claiming an outbox event.
export type ClaimedOutboxEventInput = {
  id: number;
  claimToken: string;
};

// Type representing a Prisma client that can be used to interact with outbox events.
type OutboxEventClient = PrismaClient | Prisma.TransactionClient;

// Updates a claimed outbox event with the specified data. Throws an error if the claim is no longer valid.
async function updateClaimedOutboxEvent(
  prisma: OutboxEventClient,
  input: ClaimedOutboxEventInput,
  data: Prisma.OutboxEventUpdateManyMutationInput,
) {
  // Attempt to update the claimed outbox event with the provided data. If the update affects no rows, it means the claim is no longer valid.
  const updated = await prisma.outboxEvent.updateMany({
    where: {
      id: input.id,
      status: OutboxEventStatus.processing,
      claimToken: input.claimToken,
    },
    data,
  });
  // If the update did not affect exactly one row, throw an error indicating the claim is no longer valid.
  if (updated.count !== 1) {
    throw new Error("Outbox event claim is no longer valid.");
  }
  // Return the updated outbox event.
  return prisma.outboxEvent.findUniqueOrThrow({ where: { id: input.id } });
}

// Marks a claimed outbox event as dispatched. Updates the status, dispatched timestamp, and clears the claim and lock information.
export async function markOutboxEventDispatched(
  prisma: OutboxEventClient,
  input: ClaimedOutboxEventInput & { dispatchedAt?: Date },
) {
  return updateClaimedOutboxEvent(prisma, input, {
    status: OutboxEventStatus.dispatched,
    dispatchedAt: input.dispatchedAt ?? new Date(),
    lockedUntil: null,
    claimToken: null,
    lastError: null,
  });
}

// Calculates the retry delay for an outbox event based on the attempt count and base delay. Ensures the delay does not exceed the maximum allowed retry delay.
export function getOutboxRetryDelayMs(attemptCount: number, baseDelayMs = defaultOutboxRetryBaseDelayMs) {
  if (!Number.isInteger(attemptCount) || attemptCount < 1) {
    throw new Error("Outbox attempt count must be a positive integer.");
  }

  if (!Number.isInteger(baseDelayMs) || baseDelayMs < 1) {
    throw new Error("Outbox retry base delay must be a positive integer.");
  }

  return Math.min(baseDelayMs * 2 ** (attemptCount - 1), maximumOutboxRetryDelayMs);
}

// Reschedules a claimed outbox event for a future retry based on the calculated retry delay. Updates the status, available timestamp, and clears the claim and lock information.
export async function rescheduleOutboxEvent(
  prisma: OutboxEventClient,
  input: ClaimedOutboxEventInput & { error: string; now?: Date },
) {
  const event = await prisma.outboxEvent.findFirstOrThrow({
    where: {
      id: input.id,
      status: OutboxEventStatus.processing,
      claimToken: input.claimToken,
    },
    select: { attemptCount: true },
  });
  const now = input.now ?? new Date();
  const availableAt = new Date(now.getTime() + getOutboxRetryDelayMs(event.attemptCount));

  return updateClaimedOutboxEvent(prisma, input, {
    status: OutboxEventStatus.pending,
    availableAt,
    lockedUntil: null,
    claimToken: null,
    lastError: input.error,
    failedAt: null,
  });
}

// Marks a claimed outbox event as failed. Updates the status, failed timestamp, and clears the claim and lock information.
export async function markOutboxEventFailed(
  prisma: OutboxEventClient,
  input: ClaimedOutboxEventInput & { error: string; failedAt?: Date },
) {
  return updateClaimedOutboxEvent(prisma, input, {
    status: OutboxEventStatus.failed,
    failedAt: input.failedAt ?? new Date(),
    lockedUntil: null,
    claimToken: null,
    lastError: input.error,
  });
}

// Replays a failed outbox event by marking it as pending and resetting its relevant timestamps and claim information. Ensures the event belongs to the specified organization.
export async function replayFailedOutboxEvent(
  prisma: OutboxEventClient,
  input: { organizationId: number; eventId: number; availableAt?: Date },
) {
  const updated = await prisma.outboxEvent.updateMany({
    where: {
      id: input.eventId,
      organizationId: input.organizationId,
      status: OutboxEventStatus.failed,
    },
    data: {
      status: OutboxEventStatus.pending,
      availableAt: input.availableAt ?? new Date(),
      failedAt: null,
      lockedUntil: null,
      claimToken: null,
    },
  });

  if (updated.count !== 1) {
    return null;
  }

  return prisma.outboxEvent.findUniqueOrThrow({ where: { id: input.eventId } });
}
