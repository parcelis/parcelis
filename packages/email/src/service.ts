import { getEmailTransporter } from "./transport";

export type SendEmailInput = {
  html: string;
  subject: string;
  text: string;
  to: string;
};

export async function sendEmail(input: SendEmailInput) {
  const result = await getEmailTransporter().sendMail(input);

  return { messageId: result.messageId };
}
