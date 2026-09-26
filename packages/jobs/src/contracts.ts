import { z } from "zod";
import { queueNames } from "./queue-names.js";

const idSchema = z.number().int().positive();

export const outboxEventTypes = {
  leaseActivation: "lease.activate",
} as const;

export const leaseActivationOutboxPayloadSchema = z
  .object({
    organizationId: idSchema,
    leaseId: idSchema,
  })
  .strict();
export type LeaseActivationOutboxPayload = z.infer<typeof leaseActivationOutboxPayloadSchema>;

export const leaseActivationJobName = "lease.activate.v1";
export const leaseActivationJobSchema = leaseActivationOutboxPayloadSchema
  .extend({ outboxEventId: idSchema })
  .strict();
export type LeaseActivationJob = z.infer<typeof leaseActivationJobSchema>;

const outboxEventContracts = {
  [outboxEventTypes.leaseActivation]: {
    schemaVersion: 1,
    queueName: queueNames.leasingNotifications,
    jobName: leaseActivationJobName,
    payloadSchema: leaseActivationOutboxPayloadSchema,
    jobSchema: leaseActivationJobSchema,
  },
} as const;

type OutboxEventType = keyof typeof outboxEventContracts;

export function getOutboxEventContract(eventType: string, schemaVersion: number) {
  const contract = outboxEventContracts[eventType as OutboxEventType];

  if (!contract || contract.schemaVersion !== schemaVersion) {
    throw new Error(`Unsupported outbox event: ${eventType} v${schemaVersion}.`);
  }

  return contract;
}

export function parseOutboxEventPayload(eventType: string, schemaVersion: number, payload: unknown) {
  return getOutboxEventContract(eventType, schemaVersion).payloadSchema.parse(payload);
}

export function getOutboxEventJobId(outboxEventId: number) {
  return `outbox-event-${outboxEventId}`;
}
