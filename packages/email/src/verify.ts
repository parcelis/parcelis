import { verifyEmailTransport } from "./transport.js";

try {
  await verifyEmailTransport();
  console.log("SMTP connection and authentication verified.");
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown SMTP verification error.";
  console.error(`SMTP verification failed: ${message}`);
  process.exitCode = 1;
}
