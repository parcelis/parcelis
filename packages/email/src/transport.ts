import nodemailer, { type Transporter } from "nodemailer";
import { getEmailConfig, type EmailConfig } from "./config.js";

let environmentTransporter: Transporter | undefined;

export function createEmailTransporter(config: EmailConfig, timeoutMs?: number) {
  return nodemailer.createTransport(
    {
      auth: config.user && config.password ? { pass: config.password, user: config.user } : undefined,
      host: config.host,
      ignoreTLS: config.ignoreTLS,
      port: config.port,
      requireTLS: config.requireTLS,
      secure: config.secure,
      ...(timeoutMs === undefined
        ? {}
        : {
            connectionTimeout: timeoutMs,
            greetingTimeout: timeoutMs,
            socketTimeout: timeoutMs,
          }),
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

export function resetEmailTransporter() {
  environmentTransporter = undefined;
}

export async function verifyEmailTransport(timeoutMs = 5_000) {
  const transporter = createEmailTransporter(getEmailConfig(), timeoutMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      transporter.verify(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("SMTP verification timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    transporter.close();
  }
}
