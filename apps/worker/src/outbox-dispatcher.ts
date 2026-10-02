import {
  claimAvailableOutboxEvents,
  markOutboxEventDispatched,
  markOutboxEventFailed,
  NotificationDeliveryStatus,
  OutboxEventStatus,
  type OutboxEvent,
  PrismaClient,
  rescheduleOutboxEvent,
} from "@parcelis/db";
import { getOutboxEventContract, getOutboxEventJobId, outboxEventTypes, parseOutboxEventPayload } from "@parcelis/jobs";
import type { Queue } from "bullmq";

// Interval in milliseconds between polling for available outbox events.
const pollIntervalMs = 1_000;
const notificationRecoveryIntervalMs = 60_000;
const notificationRecoveryBatchSize = 100;
const jobRetryOptions = { attempts: 3, backoff: { type: "exponential" as const, delay: 1_000 } };

// Extracts the error message from an unknown error object. If the error is an instance of Error, returns its message; otherwise, converts it to a string.
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getOutboxJob(event: OutboxEvent) {
  const contract = getOutboxEventContract(event.eventType, event.schemaVersion);
  const payload = parseOutboxEventPayload(event.eventType, event.schemaVersion, event.payload);
  if (payload.organizationId !== event.organizationId) {
    throw new Error("Outbox payload organization does not match the event organization.");
  }
  return {
    contract,
    jobData: contract.jobSchema.parse({ ...payload, outboxEventId: event.id }),
    delay:
      event.eventType === outboxEventTypes.leaseActivation &&
      "activateAt" in payload &&
      typeof payload.activateAt === "string"
        ? Math.max(0, Date.parse(payload.activateAt) - Date.now())
        : 0,
  };
}

export async function dispatchOutboxEvent(prisma: PrismaClient, queues: Map<string, Queue>, event: OutboxEvent) {
  const claimToken = event.claimToken;

  if (!claimToken) {
    return;
  }

  let contract;
  let jobData;
  let delay;

  try {
    ({ contract, jobData, delay } = getOutboxJob(event));
  } catch (error) {
    await markOutboxEventFailed(prisma, {
      id: event.id,
      claimToken,
      error: getErrorMessage(error),
    });
    return;
  }

  const queue = queues.get(contract.queueName);

  if (!queue) {
    await markOutboxEventFailed(prisma, {
      id: event.id,
      claimToken,
      error: `No queue is configured for ${contract.queueName}.`,
    });
    return;
  }

  try {
    await queue.add(contract.jobName, jobData, {
      jobId: getOutboxEventJobId(event.id),
      ...(delay ? { delay } : {}),
      ...jobRetryOptions,
    });
  } catch (error) {
    try {
      await rescheduleOutboxEvent(prisma, {
        id: event.id,
        claimToken,
        error: getErrorMessage(error),
      });
    } catch (rescheduleError) {
      console.error(`[parcelis] Could not reschedule outbox event ${event.id}: ${getErrorMessage(rescheduleError)}`);
    }
    return;
  }

  try {
    await markOutboxEventDispatched(prisma, { id: event.id, claimToken });
  } catch (error) {
    console.error(`[parcelis] Could not mark outbox event ${event.id} as dispatched: ${getErrorMessage(error)}`);
  }
}

export async function reconcileDispatchedNotificationJobs(prisma: PrismaClient, queues: Map<string, Queue>) {
  let lastDeliveryId = 0;

  while (true) {
    const deliveries = await prisma.notificationDelivery.findMany({
      where: {
        id: { gt: lastDeliveryId },
        status: { in: [NotificationDeliveryStatus.queued, NotificationDeliveryStatus.sending] },
        outboxEvent: { is: { status: OutboxEventStatus.dispatched } },
      },
      include: { outboxEvent: true },
      orderBy: { id: "asc" },
      take: notificationRecoveryBatchSize,
    });

    if (deliveries.length === 0) {
      return;
    }

    for (const delivery of deliveries) {
      lastDeliveryId = delivery.id;

      try {
        const event = delivery.outboxEvent;
        const { contract, jobData } = getOutboxJob(event);
        const queue = queues.get(contract.queueName);

        if (!queue) {
          throw new Error(`No queue is configured for ${contract.queueName}.`);
        }

        const jobId = getOutboxEventJobId(event.id);
        if (await queue.getJob(jobId)) {
          continue;
        }

        await queue.add(
          contract.jobName,
          delivery.providerMessageId ? { ...jobData, acceptedMessageId: delivery.providerMessageId } : jobData,
          { jobId, ...jobRetryOptions },
        );
      } catch (error) {
        console.error(`[parcelis] Could not recover notification delivery ${delivery.id}: ${getErrorMessage(error)}`);
      }
    }

    if (deliveries.length < notificationRecoveryBatchSize) {
      return;
    }
  }
}

// Starts the outbox dispatcher, which continuously polls for available outbox events, claims them, and dispatches them to the appropriate queues. Returns a function to stop the dispatcher.
export function startOutboxDispatcher(prisma: PrismaClient, queues: Map<string, Queue>) {
  let stopped = false;
  let dispatchInProgress = false;
  let nextNotificationRecoveryAt = 0;

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
        try {
          await dispatchOutboxEvent(prisma, queues, event);
        } catch (error) {
          console.error(`[parcelis] Could not process outbox event ${event.id}: ${getErrorMessage(error)}`);
        }
      }

      if (Date.now() >= nextNotificationRecoveryAt) {
        nextNotificationRecoveryAt = Date.now() + notificationRecoveryIntervalMs;
        await reconcileDispatchedNotificationJobs(prisma, queues);
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
