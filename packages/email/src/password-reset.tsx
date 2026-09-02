import { render, toPlainText } from "react-email";
import { sendEmail } from "./service.js";
import { PasswordResetEmail } from "./templates/password-reset.js";

export type SendPasswordResetEmailInput = {
  resetUrl: string;
  to: string;
};

export async function sendPasswordResetEmail(input: SendPasswordResetEmailInput) {
  const html = await render(<PasswordResetEmail resetUrl={input.resetUrl} />);
  const text = toPlainText(html);

  return sendEmail({
    html,
    subject: "Reset your Parcelis password",
    text,
    to: input.to,
  });
}
