import { EmailConfigurationError, verifyEmailTransport } from "@parcelis/email";

export async function processEmailHealthJob(verify = verifyEmailTransport, host = process.env.SMTP_HOST) {
  if (!host?.trim()) return { status: "unknown" as const };
  try {
    await verify(2_000);
    return { status: "operational" as const };
  } catch (error) {
    if (error instanceof EmailConfigurationError) return { status: "unknown" as const };
    return { status: "down" as const };
  }
}
