import { EmailConfigurationError, type getOrganizationEmailConfig, type sendEmail } from "@parcelis/email";
import { notificationEmailDeliveryJobSchema, type NotificationEmailOutboxJob } from "@parcelis/jobs";
import { UnrecoverableError } from "bullmq";

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
  rememberAccepted: (input: NotificationEmailOutboxJob & { acceptedMessageId: string }) => Promise<void>;
  rememberAcceptedDelivery?: (input: { messageId: string; outboxEventId: number }) => Promise<void>;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

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
    result = await dependencies.send({
      emailConfig,
      to: payload.email,
      subject: payload.subject,
      text: payload.body,
      html: formatPlainTextAsHtml(payload.body),
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const finalAttempt = retry.attemptsMade + 1 >= retry.attempts;
    if (isPermanentEmailError(error) || finalAttempt) {
      await dependencies.markDeliveryFailed?.({ outboxEventId: payload.outboxEventId, error: message });
      if (isPermanentEmailError(error)) throw new UnrecoverableError(message);
    } else {
      await dependencies.markDeliveryRetrying?.({ outboxEventId: payload.outboxEventId, error: message });
    }
    throw error;
  }

  const checkpointErrors: unknown[] = [];
  try {
    await dependencies.rememberAccepted({ ...payload, acceptedMessageId: result.messageId });
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
