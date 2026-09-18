import { render, toPlainText } from "react-email";
import type { EmailConfig } from "./config.js";
import { sendEmail } from "./service.js";
import { SmtpTestEmail } from "./templates/smtp-test.js";

export type SendSmtpTestEmailInput = {
  emailConfig: EmailConfig;
  to: string;
};

export async function sendSmtpTestEmail(input: SendSmtpTestEmailInput) {
  const html = await render(<SmtpTestEmail />);
  const text = toPlainText(html);

  return sendEmail({
    emailConfig: input.emailConfig,
    html,
    subject: "Parcelis SMTP test",
    text,
    to: input.to,
  });
}
