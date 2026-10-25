import { verifyEmailTransport } from "@parcelis/email";

export async function processEmailHealthJob(verify = verifyEmailTransport, host = process.env.SMTP_HOST) {
  if (!host?.trim()) return { status: "unknown" as const };
  try {
    await verify(2_000);
    return { status: "operational" as const };
  } catch {
    return { status: "down" as const };
  }
}
