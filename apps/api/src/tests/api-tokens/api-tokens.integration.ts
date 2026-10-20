import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import {
  createIsolatedTestSchema,
  validateOutboxTestDatabaseUrl as validateTestDatabaseUrl,
} from "../../../../../scripts/outbox-test-database.mjs";

const databaseUrl = process.env.API_TOKEN_TEST_DATABASE_URL;

if (databaseUrl) {
  validateTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);
}

test("PostgreSQL enforces API-token persistence rules", { skip: !databaseUrl }, async (t) => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });

  const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "api_tokens_test").catch(async (error) => {
    await admin.$disconnect();
    throw error;
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
  });

  t.after(async () => {
    try {
      await prisma.$disconnect();
    } finally {
      try {
        await isolated.cleanup();
      } finally {
        await admin.$disconnect();
      }
    }
  });

  const organization = await prisma.organization.create({
    data: {
      name: "API token test",
      slug: "api-token-test",
    },
  });

  const data = {
    organizationId: organization.id,
    name: "First token",
    tokenHash: "a".repeat(64),
    tokenPrefix: "pcls_api_0123456789",
    createdByLabel: "Test administrator",
  };

  const originalToken = await prisma.apiToken.create({ data });

  await assert.rejects(
    () =>
      prisma.apiToken.create({
        data: { ...data, name: "Second token" },
      }),
    { code: "P2002" },
  );
  await t.test("deleting the creator preserves the token", async () => {
    const creator = await prisma.user.create({
      data: {
        name: "Token creator",
        email: "token-creator@example.test",
        passwordHash: "unused-test-password-hash",
      },
    });

    const token = await prisma.apiToken.create({
      data: {
        organizationId: organization.id,
        name: "Organization integration",
        tokenHash: "b".repeat(64),
        tokenPrefix: "pcls_api_abcdefghij",
        createdById: creator.id,
        createdByLabel: creator.name,
      },
    });

    await prisma.user.delete({
      where: { id: creator.id },
    });

    const retained = await prisma.apiToken.findUnique({
      where: { id: token.id },
    });

    assert.ok(retained);
    assert.equal(retained.createdById, null);
    assert.equal(retained.createdByLabel, "Token creator");
    assert.equal(retained.organizationId, organization.id);
  });
  await t.test("deleting an organization removes its tokens", async () => {
    const temporaryOrganization = await prisma.organization.create({
      data: {
        name: "Organization deletion test",
        slug: "organization-deletion-test",
      },
    });

    const token = await prisma.apiToken.create({
      data: {
        organizationId: temporaryOrganization.id,
        name: "Temporary integration",
        tokenHash: "c".repeat(64),
        tokenPrefix: "pcls_api_klmnopqrst",
        createdByLabel: "Test administrator",
      },
    });

    await prisma.organization.delete({
      where: { id: temporaryOrganization.id },
    });

    const deleted = await prisma.apiToken.findUnique({
      where: { id: token.id },
    });

    assert.equal(deleted, null);

    const unrelatedToken = await prisma.apiToken.findUnique({
      where: { id: originalToken.id },
    });

    assert.ok(unrelatedToken);
    assert.equal(unrelatedToken.organizationId, organization.id);
  });
  await t.test("deleting the revoker preserves revocation details", async () => {
    const revoker = await prisma.user.create({
      data: {
        name: "Token revoker",
        email: "token-revoker@example.test",
        passwordHash: "unused-test-password-hash",
      },
    });

    const revokedAt = new Date("2026-10-20T12:00:00.000Z");

    const token = await prisma.apiToken.create({
      data: {
        organizationId: organization.id,
        name: "Revoked integration",
        tokenHash: "d".repeat(64),
        tokenPrefix: "pcls_api_uvwxyz0123",
        createdByLabel: "Test administrator",
        revokedAt,
        revokedById: revoker.id,
        revokedByLabel: revoker.name,
      },
    });

    await prisma.user.delete({
      where: { id: revoker.id },
    });

    const retained = await prisma.apiToken.findUnique({
      where: { id: token.id },
    });

    assert.ok(retained);
    assert.equal(retained.revokedById, null);
    assert.equal(retained.revokedByLabel, "Token revoker");
    assert.equal(retained.revokedAt?.toISOString(), revokedAt.toISOString());
  });
});
