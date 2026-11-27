import {
  markNotificationDeliveryAccepted,
  markNotificationDeliveryFailed,
  markNotificationDeliveryRetrying,
  markNotificationDeliverySending,
  markNotificationDeliverySent,
  type PrismaClient,
} from "@parcelis/db";
import {
  EmailConfigurationError,
  getOrganizationEmailConfig,
  renderPasswordResetEmail,
  renderVerificationEmail,
  sendEmail,
} from "@parcelis/email";
import {
  getNotificationEmailJobReference,
  notificationEmailDeliveryJobSchema,
  notificationEmailOutboxPayloadSchema,
  notificationEmailReferenceDeliveryJobSchema,
  outboxEventTypes,
  type NotificationEmailOutboxJob,
} from "@parcelis/jobs";
import { UnrecoverableError, type Job } from "bullmq";
import { isDeepStrictEqual } from "node:util";

const permanentEmailErrorCodes = new Set([
  "EAUTH",
  "ENOAUTH",
  "EOAUTH2",
  "EENVELOPE",
  "EMAXRECIPIENTS",
  "ECONFIG",
  "EREQUIRETLS",
  "EFILEACCESS",
  "EURLACCESS",
  "EFETCH",
]);

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPlainTextAsHtml(text: string) {
  return `<pre style="font-family:inherit;white-space:pre-wrap;margin:0">${escapeHtml(text)}</pre>`;
}

export type ProcessNotificationEmailJobDependencies = {
  send: typeof sendEmail;
  getEmailConfig: (organizationId: number) => ReturnType<typeof getOrganizationEmailConfig>;
  markDeliveryFailed?: (input: { error: string; outboxEventId: number }) => Promise<void>;
  markDeliveryRetrying?: (input: { error: string; outboxEventId: number }) => Promise<void>;
  markDeliverySending?: (input: {
    outboxEventId: number;
  }) => Promise<{ status: string; providerMessageId?: string | null } | void>;
  markDeliverySent?: (input: { messageId: string; outboxEventId: number }) => Promise<void>;
  rememberAccepted: (messageId: string) => Promise<void>;
  rememberAcceptedDelivery?: (input: { messageId: string; outboxEventId: number }) => Promise<void>;
};

function getErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function getResponseCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("responseCode" in error)) return undefined;
  return typeof error.responseCode === "number" ? error.responseCode : undefined;
}

function isPermanentEmailError(error: unknown) {
  if (error instanceof EmailConfigurationError) return true;
  const responseCode = getResponseCode(error);
  if (responseCode !== undefined) return responseCode >= 500;

  return permanentEmailErrorCodes.has(getErrorCode(error) ?? "");
}

export type NotificationEmailJobRetry = {
  attemptsMade: number;
  attempts: number;
};

export async function processNotificationEmailJob(
  data: unknown,
  dependencies: ProcessNotificationEmailJobDependencies,
  retry: NotificationEmailJobRetry = { attemptsMade: 0, attempts: 3 },
) {
  const payload = notificationEmailDeliveryJobSchema.parse(data);
  const delivery = await dependencies.markDeliverySending?.({ outboxEventId: payload.outboxEventId });
  if (delivery?.status === "sent") {
    return { outboxEventId: payload.outboxEventId, skipped: true };
  }

  const acceptedMessageId = delivery?.providerMessageId ?? payload.acceptedMessageId;
  if (acceptedMessageId) {
    await dependencies.markDeliverySent?.({
      outboxEventId: payload.outboxEventId,
      messageId: acceptedMessageId,
    });
    return { messageId: acceptedMessageId, outboxEventId: payload.outboxEventId };
  }

  let result;
  try {
    const emailConfig = await dependencies.getEmailConfig(payload.organizationId);
    const content = payload.template
      ? payload.template.kind === "account-verification"
        ? await renderVerificationEmail(payload.template.url)
        : await renderPasswordResetEmail(payload.template.url)
      : { text: payload.body, html: formatPlainTextAsHtml(payload.body) };
    result = await dependencies.send({
      emailConfig,
      to: payload.email,
      subject: payload.subject,
      ...content,
    });
  } catch (error) {
    const permanent = isPermanentEmailError(error);
    const message = permanent ? "Permanent email delivery failure." : "Temporary email delivery failure.";
    const finalAttempt = retry.attemptsMade + 1 >= retry.attempts;
    if (permanent || finalAttempt) {
      await dependencies.markDeliveryFailed?.({ outboxEventId: payload.outboxEventId, error: message });
      if (permanent) throw new UnrecoverableError(message);
    } else {
      await dependencies.markDeliveryRetrying?.({ outboxEventId: payload.outboxEventId, error: message });
    }
    throw new Error(message);
  }

  const checkpointErrors: unknown[] = [];
  try {
    await dependencies.rememberAccepted(result.messageId);
  } catch (error) {
    checkpointErrors.push(error);
  }

  try {
    await dependencies.rememberAcceptedDelivery?.({
      outboxEventId: payload.outboxEventId,
      messageId: result.messageId,
    });
  } catch (error) {
    checkpointErrors.push(error);
  }

  try {
    await dependencies.markDeliverySent?.({ outboxEventId: payload.outboxEventId, messageId: result.messageId });
  } catch (error) {
    if (checkpointErrors.length > 0)
      throw new AggregateError([...checkpointErrors, error], "Could not record accepted email delivery.");
    throw error;
  }

  return {
    messageId: result.messageId,
    outboxEventId: payload.outboxEventId,
  } satisfies { messageId: string; outboxEventId: NotificationEmailOutboxJob["outboxEventId"] };
}

export async function processQueuedNotificationEmail(prisma: PrismaClient, job: Job) {
  const reference = notificationEmailReferenceDeliveryJobSchema.safeParse(job.data);
  const legacy = reference.success ? undefined : notificationEmailDeliveryJobSchema.safeParse(job.data);
  const queued = reference.data ?? legacy?.data;
  if (!queued) throw new UnrecoverableError("Invalid notification email job.");

  try {
    const event = await prisma.outboxEvent.findFirst({
      where: {
        id: queued.outboxEventId,
        organizationId: queued.organizationId,
        eventType: outboxEventTypes.notificationEmail,
        schemaVersion: 1,
      },
      select: { id: true, organizationId: true, createdAt: true, payload: true },
    });
    const email = notificationEmailOutboxPayloadSchema.safeParse(event?.payload);
    if (!event || !email.success || email.data.organizationId !== event.organizationId) {
      throw new UnrecoverableError("Notification email outbox event is missing or invalid.");
    }

    const jobReference = getNotificationEmailJobReference(event);
    const { acceptedMessageId } = queued;
    const checkpoint = acceptedMessageId ? { acceptedMessageId } : {};
    const payload = { ...email.data, outboxEventId: event.id, ...checkpoint };
    const matchesEvent = reference.success
      ? Date.parse(reference.data.outboxEventCreatedAt) === Date.parse(jobReference.outboxEventCreatedAt)
      : isDeepStrictEqual(legacy?.data, payload);
    if (!matchesEvent) throw new UnrecoverableError("Notification email job refers to a different outbox event.");
    if (!reference.success) await job.updateData({ ...jobReference, ...checkpoint });

    return await processNotificationEmailJob(
      payload,
      {
        send: sendEmail,
        getEmailConfig: (organizationId) => getOrganizationEmailConfig(prisma, organizationId),
        rememberAccepted: (acceptedMessageId) => job.updateData({ ...jobReference, acceptedMessageId }),
        rememberAcceptedDelivery: ({ outboxEventId, messageId }) =>
          markNotificationDeliveryAccepted(prisma, { outboxEventId, providerMessageId: messageId }),
        markDeliverySending: ({ outboxEventId }) => markNotificationDeliverySending(prisma, { outboxEventId }),
        markDeliverySent: async ({ outboxEventId, messageId }) => {
          await markNotificationDeliverySent(prisma, { outboxEventId, providerMessageId: messageId });
        },
        markDeliveryFailed: async (input) => {
          await markNotificationDeliveryFailed(prisma, input);
        },
        markDeliveryRetrying: async (input) => {
          await markNotificationDeliveryRetrying(prisma, input);
        },
      },
      { attemptsMade: job.attemptsMade, attempts: job.opts.attempts ?? 1 },
    );
  } catch (error) {
    if (error instanceof UnrecoverableError) throw error;
    throw new Error("Notification email delivery could not be completed.");
  }
}
