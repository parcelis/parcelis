import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { PrismaClient } from "@parcelis/db";
import type { EmailConfig } from "@parcelis/email";

const encryptionAlgorithm = "aes-256-gcm";
const initializationVectorLength = 12;
const authenticationTagLength = 16;

function getEncryptionKey() {
  const value = process.env.EMAIL_SETTINGS_ENCRYPTION_KEY;
  if (!value) throw new Error("EMAIL_SETTINGS_ENCRYPTION_KEY must be configured before using saved SMTP credentials.");

  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("EMAIL_SETTINGS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }

  return key;
}

// Email settings to validate if environment variable for encryption key is configured
export function isEmailSettingsEncryptionConfigured() {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptEmailSettingsPassword(password: string) {
  const initializationVector = randomBytes(initializationVectorLength);
  const cipher = createCipheriv(encryptionAlgorithm, getEncryptionKey(), initializationVector);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return Buffer.concat([initializationVector, authenticationTag, encrypted]).toString("base64");
}

export function decryptEmailSettingsPassword(passwordCipher: string) {
  const value = Buffer.from(passwordCipher, "base64");
  const initializationVector = value.subarray(0, initializationVectorLength);
  const authenticationTag = value.subarray(initializationVectorLength, initializationVectorLength + authenticationTagLength);
  const encrypted = value.subarray(initializationVectorLength + authenticationTagLength);
  const decipher = createDecipheriv(encryptionAlgorithm, getEncryptionKey(), initializationVector);
  decipher.setAuthTag(authenticationTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export async function getOrganizationEmailConfig(prisma: PrismaClient, organizationId: number): Promise<EmailConfig | undefined> {
  const settings = await prisma.organizationEmailSettings.findUnique({
    where: { organizationId },
    select: {
      host: true,
      securityType: true,
      port: true,
      fromEmail: true,
      requireSignIn: true,
      username: true,
      passwordCipher: true,
    },
  });
  if (!settings) return undefined;

  const security =
    settings.securityType === "tls"
      ? { secure: true }
      : settings.securityType === "starttls"
        ? { requireTLS: true, secure: false }
        : settings.securityType === "none"
          ? { secure: false }
          : null;
  if (!security) throw new Error("Organization email settings have an invalid security type.");

  if (!settings.requireSignIn) return { from: settings.fromEmail, host: settings.host, port: settings.port, ...security };
  if (!settings.username || !settings.passwordCipher) {
    throw new Error("Organization email settings require a username and password.");
  }

  return {
    from: settings.fromEmail,
    host: settings.host,
    password: decryptEmailSettingsPassword(settings.passwordCipher),
    port: settings.port,
    user: settings.username,
    ...security,
  };
}
