import { sendEmail } from "@parcelis/email";
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
};

export async function processNotificationEmailJob(
  data: unknown,
  dependencies: ProcessNotificationEmailJobDependencies = { send: sendEmail },
) {
  const payload = notificationEmailOutboxJobSchema.parse(data);
  const result = await dependencies.send({
    to: payload.email,
    subject: payload.subject,
    text: payload.body,
    html: formatPlainTextAsHtml(payload.body),
  });

  return {
    messageId: result.messageId,
    outboxEventId: payload.outboxEventId,
  } satisfies { messageId: string; outboxEventId: NotificationEmailOutboxJob["outboxEventId"] };
}
