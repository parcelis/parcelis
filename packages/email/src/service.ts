import type { EmailConfig } from "./config.js";
import { createEmailTransporter, getEmailTransporter } from "./transport.js";

export type SendEmailInput = {
  html: string;
  subject: string;
  text: string;
  to: string;
  attachments?: Array<{ content: Buffer; contentType: string; filename: string }>;
  emailConfig?: EmailConfig;
};

export async function sendEmail(input: SendEmailInput) {
  const { emailConfig, ...message } = input;
  const result = await (emailConfig ? createEmailTransporter(emailConfig) : getEmailTransporter()).sendMail(message);

  if (result.rejected?.length || (Array.isArray(result.accepted) && result.accepted.length === 0)) {
    throw new Error("The mail server did not accept the message.");
  }

  return { messageId: result.messageId };
}
