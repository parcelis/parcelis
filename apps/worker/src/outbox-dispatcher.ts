import {
  claimAvailableOutboxEvents,
  markOutboxEventDispatched,
  markOutboxEventFailed,
  PrismaClient,
  rescheduleOutboxEvent,
} from "@parcelis/db";
import { getOutboxEventContract, getOutboxEventJobId, parseOutboxEventPayload } from "@parcelis/jobs";
import type { Queue } from "bullmq";

// Interval in milliseconds between polling for available outbox events.
const pollIntervalMs = 1_000;

// Extracts the error message from an unknown error object. If the error is an instance of Error, returns its message; otherwise, converts it to a string.
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

// Starts the outbox dispatcher, which continuously polls for available outbox events, claims them, and dispatches them to the appropriate queues. Returns a function to stop the dispatcher.
export function startOutboxDispatcher(prisma: PrismaClient, queues: Map<string, Queue>) {
  let stopped = false;
  let dispatchInProgress = false;

  // Dispatches available outbox events by claiming them, validating their payloads, and adding them to the appropriate queues. Handles failures and rescheduling as needed.
  const dispatchAvailableEvents = async () => {
    if (stopped || dispatchInProgress) {
      return;
    }

    dispatchInProgress = true;

    // Attempt to claim available outbox events and process them. Any errors during this process are caught and logged.
    try {
      const events = await claimAvailableOutboxEvents(prisma);

      for (const event of events) {
        const claimToken = event.claimToken;

        if (!claimToken) {
          continue;
        }

        let contract;
        let payload;

        // Validate the outbox event payload against the expected contract schema. If validation fails, mark the event as failed and continue to the next event.
        try {
          contract = getOutboxEventContract(event.eventType, event.schemaVersion);
          payload = parseOutboxEventPayload(event.eventType, event.schemaVersion, event.payload);
          contract.jobSchema.parse({ ...payload, outboxEventId: event.id });
        } catch (error) {
          await markOutboxEventFailed(prisma, {
            id: event.id,
            claimToken,
            error: getErrorMessage(error),
          });
          continue;
        }

        const queue = queues.get(contract.queueName);

        if (!queue) {
          await markOutboxEventFailed(prisma, {
            id: event.id,
            claimToken,
            error: `No queue is configured for ${contract.queueName}.`,
          });
          continue;
        }

        const jobData = contract.jobSchema.parse({ ...payload, outboxEventId: event.id });

        try {
          await queue.add(contract.jobName, jobData, {
            jobId: getOutboxEventJobId(event.id),
          });
        } catch (error) {
          try {
            await rescheduleOutboxEvent(prisma, {
              id: event.id,
              claimToken,
              error: getErrorMessage(error),
            });
          } catch (rescheduleError) {
            console.error(
              `[parcelis] Could not reschedule outbox event ${event.id}: ${getErrorMessage(rescheduleError)}`,
            );
          }
          continue;
        }

        try {
          await markOutboxEventDispatched(prisma, { id: event.id, claimToken });
        } catch (error) {
          console.error(`[parcelis] Could not mark outbox event ${event.id} as dispatched: ${getErrorMessage(error)}`);
        }
      }
    } catch (error) {
      if (!stopped) {
        console.error(`[parcelis] Outbox dispatch failed: ${getErrorMessage(error)}`);
      }
    } finally {
      dispatchInProgress = false;
    }
  };

  const timer = setInterval(() => void dispatchAvailableEvents(), pollIntervalMs);
  void dispatchAvailableEvents();

  return async function stopOutboxDispatcher() {
    stopped = true;
    clearInterval(timer);

    while (dispatchInProgress) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
}
