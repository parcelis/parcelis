import type { getOrganizationEmailConfig, sendEmail } from "@parcelis/email";
import { notificationEmailOutboxJobSchema, type NotificationEmailOutboxJob } from "@parcelis/jobs";

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
  markDeliverySending?: (input: { outboxEventId: number }) => Promise<void>;
  markDeliverySent?: (input: { messageId: string; outboxEventId: number }) => Promise<void>;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function processNotificationEmailJob(
  data: unknown,
  dependencies: ProcessNotificationEmailJobDependencies,
) {
  const payload = notificationEmailOutboxJobSchema.parse(data);
  await dependencies.markDeliverySending?.({ outboxEventId: payload.outboxEventId });

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
    await dependencies.markDeliveryFailed?.({ outboxEventId: payload.outboxEventId, error: getErrorMessage(error) });
    throw error;
  }

  await dependencies.markDeliverySent?.({ outboxEventId: payload.outboxEventId, messageId: result.messageId });

  return {
    messageId: result.messageId,
    outboxEventId: payload.outboxEventId,
  } satisfies { messageId: string; outboxEventId: NotificationEmailOutboxJob["outboxEventId"] };
}
