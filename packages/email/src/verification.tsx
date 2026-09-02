import { render, toPlainText } from "react-email";
import { sendEmail } from "./service.js";
import { VerificationEmail } from "./templates/verification.js";

export type SendVerificationEmailInput = {
  to: string;
  verificationUrl: string;
};

export async function sendVerificationEmail(input: SendVerificationEmailInput) {
  const html = await render(<VerificationEmail verificationUrl={input.verificationUrl} />);
  const text = toPlainText(html);

  return sendEmail({
    html,
    subject: "Verify your Parcelis email",
    text,
    to: input.to,
  });
}
