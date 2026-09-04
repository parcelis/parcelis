import nodemailer, { type Transporter } from "nodemailer";
import { getEmailConfig, type EmailConfig } from "./config.js";

let environmentTransporter: Transporter | undefined;

export function createEmailTransporter(config: EmailConfig) {
  return nodemailer.createTransport(
    {
      auth: config.user && config.password ? { pass: config.password, user: config.user } : undefined,
      host: config.host,
      port: config.port,
      requireTLS: config.requireTLS,
      secure: config.secure,
    },
    { from: config.from },
  );

}

export function getEmailTransporter() {
  if (!environmentTransporter) {
    environmentTransporter = createEmailTransporter(getEmailConfig());
  }

  return environmentTransporter;
}

export async function verifyEmailTransport() {
  await getEmailTransporter().verify();
}
