import type { EmailConfig } from "./config.js";
import { createEmailTransporter, getEmailTransporter } from "./transport.js";

export type SendEmailInput = {
  html: string;
  subject: string;
  text: string;
  to: string;
  emailConfig?: EmailConfig;
};

export async function sendEmail(input: SendEmailInput) {
  const { emailConfig, ...message } = input;
  const result = await (emailConfig ? createEmailTransporter(emailConfig) : getEmailTransporter()).sendMail(message);

  return { messageId: result.messageId };
}
