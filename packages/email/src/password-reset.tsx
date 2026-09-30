import { render, toPlainText } from "react-email";
import { sendEmail } from "./service.js";
import type { EmailConfig } from "./config.js";
import { PasswordResetEmail } from "./templates/password-reset.js";

export type SendPasswordResetEmailInput = {
  resetUrl: string;
  to: string;
  emailConfig?: EmailConfig;
};

export async function renderPasswordResetEmail(resetUrl: string) {
  const html = await render(<PasswordResetEmail resetUrl={resetUrl} />);
  const text = toPlainText(html);

  return { html, text };
}

export async function sendPasswordResetEmail(input: SendPasswordResetEmailInput) {
  const { html, text } = await renderPasswordResetEmail(input.resetUrl);

  return sendEmail({
    html,
    subject: "Reset your Parcelis password",
    text,
    to: input.to,
    emailConfig: input.emailConfig,
  });
}
