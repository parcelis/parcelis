import nodemailer, { type Transporter } from "nodemailer";
import type { SMTPTransportGetSocket } from "nodemailer/lib/smtp-transport";
import { Socket } from "node:net";
import { getEmailConfig, type EmailConfig } from "./config.js";

let environmentTransporter: Transporter | undefined;

export function createEmailTransporter(config: EmailConfig, timeoutMs?: number, getSocket?: SMTPTransportGetSocket) {
  return nodemailer.createTransport(
    {
      auth: config.user && config.password ? { pass: config.password, user: config.user } : undefined,
      host: config.host,
      ignoreTLS: config.ignoreTLS,
      port: config.port,
      requireTLS: config.requireTLS,
      secure: config.secure,
      getSocket,
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
  const config = getEmailConfig();
  const socket = new Socket();
  let finished = false;
  const transporter = createEmailTransporter(config, timeoutMs, (_options, callback) => {
    if (finished) return callback(new Error("SMTP verification timed out."));
    const onError = (error: Error) => {
      if (!finished) callback(error);
    };
    socket.once("error", onError);
    socket.connect(config.port, config.host, () => {
      socket.removeListener("error", onError);
      if (!finished) callback(null, { connection: socket });
    });
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      transporter.verify(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("SMTP verification timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    finished = true;
    clearTimeout(timer);
    socket.destroy();
    transporter.close();
  }
}
