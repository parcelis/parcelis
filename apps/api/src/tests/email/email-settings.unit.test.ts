import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@parcelis/db";
import {
  decryptEmailSettingsPassword,
  encryptEmailSettingsPassword,
  getOrganizationEmailConfig,
} from "../../modules/email-settings";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");

test("encrypts and decrypts SMTP passwords", () => {
  const previousKey = process.env.EMAIL_SETTINGS_ENCRYPTION_KEY;
  process.env.EMAIL_SETTINGS_ENCRYPTION_KEY = encryptionKey;
  try {
    const passwordCipher = encryptEmailSettingsPassword("smtp-password");
    assert.notEqual(passwordCipher, "smtp-password");
    assert.equal(decryptEmailSettingsPassword(passwordCipher), "smtp-password");
  } finally {
    if (previousKey === undefined) delete process.env.EMAIL_SETTINGS_ENCRYPTION_KEY;
    else process.env.EMAIL_SETTINGS_ENCRYPTION_KEY = previousKey;
  }
});

test("resolves only the requested organization's SMTP configuration", async () => {
  const previousKey = process.env.EMAIL_SETTINGS_ENCRYPTION_KEY;
  process.env.EMAIL_SETTINGS_ENCRYPTION_KEY = encryptionKey;
  const passwordCipher = encryptEmailSettingsPassword("smtp-password");
  let requestedOrganizationId: number | undefined;
  const prisma = {
    organizationEmailSettings: {
      findUnique: async ({ where }: { where: { organizationId: number } }) => {
        requestedOrganizationId = where.organizationId;
        return {
          host: "smtp.example.com",
          securityType: "starttls",
          port: 587,
          fromEmail: "notices@example.com",
          requireSignIn: true,
          username: "smtp-user",
          passwordCipher,
        };
      },
    },
  } as unknown as PrismaClient;

  try {
    const config = await getOrganizationEmailConfig(prisma, 42);
    assert.equal(requestedOrganizationId, 42);
    assert.deepEqual(config, {
      from: "notices@example.com",
      host: "smtp.example.com",
      password: "smtp-password",
      port: 587,
      requireTLS: true,
      secure: false,
      user: "smtp-user",
    });
  } finally {
    if (previousKey === undefined) delete process.env.EMAIL_SETTINGS_ENCRYPTION_KEY;
    else process.env.EMAIL_SETTINGS_ENCRYPTION_KEY = previousKey;
  }
});

test("uses environment SMTP when an organization has no saved configuration", async () => {
  const prisma = {
    organizationEmailSettings: { findUnique: async () => null },
  } as unknown as PrismaClient;

  assert.equal(await getOrganizationEmailConfig(prisma, 42), undefined);
});
