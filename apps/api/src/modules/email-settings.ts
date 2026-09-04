import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

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
