import { render, toPlainText } from "react-email";
import { sendEmail } from "./service.js";
import type { EmailConfig } from "./config.js";
import { AccountVerificationEmail } from "./templates/account-verification.js";

export type SendVerificationEmailInput = {
  emailConfig?: EmailConfig;
  to: string;
  verificationUrl: string;
};

export async function renderVerificationEmail(verificationUrl: string) {
  const html = await render(<AccountVerificationEmail verificationUrl={verificationUrl} />);
  const text = toPlainText(html);

  return { html, text };
}

export async function sendVerificationEmail(input: SendVerificationEmailInput) {
  const { html, text } = await renderVerificationEmail(input.verificationUrl);

  return sendEmail({
    html,
    subject: "Verify your Parcelis email",
    text,
    to: input.to,
    emailConfig: input.emailConfig,
  });
}
