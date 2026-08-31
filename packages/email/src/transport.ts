import nodemailer, { type Transporter } from "nodemailer";
import { getEmailConfig } from "./config";

let transporter: Transporter | undefined;

export function getEmailTransporter() {
  if (transporter) {
    return transporter;
  }

  const config = getEmailConfig();
  transporter = nodemailer.createTransport(
    {
      auth: { pass: config.password, user: config.user },
      host: config.host,
      port: config.port,
      secure: config.secure,
    },
    { from: config.from },
  );

  return transporter;
}
