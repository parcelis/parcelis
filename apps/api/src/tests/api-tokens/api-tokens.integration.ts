import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import {
  createIsolatedTestSchema,
  validateOutboxTestDatabaseUrl as validateTestDatabaseUrl,
} from "../../../../../scripts/outbox-test-database.mjs";
import { appRouter } from "../../router/app.router";
import { createContext } from "../../router/context";
import { createTestSessionCookie } from "../auth/session-cookie";
import { hashApiToken } from "../../modules/api-tokens";

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

  const owner = await prisma.user.create({
    data: {
      name: "Token owner",
      email: "api-token-owner@example.test",
      passwordHash: "unused-test-password-hash",
      defaultOrganizationId: organization.id,
    },
  });

  await prisma.organizationMembership.create({
    data: {
      userId: owner.id,
      organizationId: organization.id,
      role: "owner",
    },
  });

  const ownerContext = await createContext(prisma)({
    req: {
      headers: {
        cookie: await createTestSessionCookie(String(owner.id)),
      },
    },
  });

  const ownerCaller = appRouter.createCaller(ownerContext);

  const administrator = await prisma.user.create({
    data: {
      name: "Platform administrator",
      email: "api-token-administrator@example.test",
      passwordHash: "unused-test-password-hash",
      role: "administrator",
      defaultOrganizationId: organization.id,
    },
  });

  const administratorContext = await createContext(prisma)({
    req: {
      headers: {
        cookie: await createTestSessionCookie(String(administrator.id)),
      },
    },
  });

  const administratorCaller = appRouter.createCaller(administratorContext);

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

  await t.test("management creates and lists a persisted token", async () => {
    const startedAt = Date.now();
    const created = await ownerCaller.apiTokens.create({
      name: "Database integration",
    });
    const completedAt = Date.now();

    const stored = await prisma.apiToken.findUnique({
      where: { id: created.metadata.id },
    });

    assert.ok(stored);
    assert.equal(stored.organizationId, organization.id);
    assert.equal(stored.createdById, owner.id);
    assert.equal(stored.tokenHash, hashApiToken(created.token));
    assert.ok(stored.expiresAt);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    assert.ok(stored.expiresAt.getTime() >= startedAt + sevenDaysMs);
    assert.ok(stored.expiresAt.getTime() <= completedAt + sevenDaysMs);
    assert.equal(created.metadata.expiresAt, stored.expiresAt.toISOString());

    const listed = await ownerCaller.apiTokens.list({});

    assert.deepEqual(
      listed.items.find((token) => token.id === stored.id),
      created.metadata,
    );
  });
  await t.test("revocation persists and preserves its original actor", async () => {
    const created = await ownerCaller.apiTokens.create({
      name: "Revocation integration",
    });

    const revoked = await ownerCaller.apiTokens.revoke({
      id: created.metadata.id,
    });

    assert.ok(revoked.revokedAt);
    assert.equal(revoked.revokedByLabel, owner.name);

    const repeated = await administratorCaller.apiTokens.revoke({
      id: created.metadata.id,
    });

    assert.deepEqual(repeated, revoked);

    const stored = await prisma.apiToken.findUnique({
      where: { id: created.metadata.id },
    });

    assert.ok(stored);
    assert.equal(stored.revokedById, owner.id);
    assert.equal(stored.revokedAt?.toISOString(), revoked.revokedAt);
    assert.equal(stored.tokenHash, hashApiToken(created.token));
  });

  await t.test("management cannot access another organization's token", async () => {
    const otherOrganization = await prisma.organization.create({
      data: {
        name: "Other organization",
        slug: "other-api-token-organization",
      },
    });

    const foreignToken = await prisma.apiToken.create({
      data: {
        organizationId: otherOrganization.id,
        name: "Other organization's integration",
        tokenHash: "e".repeat(64),
        tokenPrefix: "pcls_api_foreign123",
        createdByLabel: "Other owner",
      },
    });

    for (const caller of [ownerCaller, administratorCaller]) {
      const listed = await caller.apiTokens.list({});

      assert.equal(
        listed.items.some((token) => token.id === foreignToken.id),
        false,
      );

      await assert.rejects(caller.apiTokens.list({ cursor: foreignToken.id }), { code: "NOT_FOUND" });

      await assert.rejects(caller.apiTokens.revoke({ id: foreignToken.id }), { code: "NOT_FOUND" });
    }

    const unchanged = await prisma.apiToken.findUnique({
      where: { id: foreignToken.id },
    });

    assert.ok(unchanged);
    assert.equal(unchanged.revokedAt, null);
    assert.equal(unchanged.revokedById, null);
    assert.equal(unchanged.tokenHash, foreignToken.tokenHash);
  });

  await t.test("concurrent revocations return the same persisted actor and timestamp", async () => {
    const created = await ownerCaller.apiTokens.create({ name: "Concurrent revocation" });
    const [ownerResult, administratorResult] = await Promise.all([
      ownerCaller.apiTokens.revoke({ id: created.metadata.id }),
      administratorCaller.apiTokens.revoke({ id: created.metadata.id }),
    ]);

    assert.deepEqual(ownerResult, administratorResult);

    const stored = await prisma.apiToken.findUniqueOrThrow({ where: { id: created.metadata.id } });
    assert.ok(stored.revokedAt);
    assert.equal(stored.revokedAt.toISOString(), ownerResult.revokedAt);
    assert.ok(stored.revokedById === owner.id || stored.revokedById === administrator.id);
    const expectedName = stored.revokedById === owner.id ? owner.name : administrator.name;
    assert.equal(stored.revokedByLabel, expectedName);
    assert.equal(ownerResult.revokedByLabel, expectedName);
  });

  await t.test("pagination handles equal timestamps and includes expired and revoked records", async () => {
    const paginationOrganization = await prisma.organization.create({
      data: { name: "Pagination organization", slug: "api-token-pagination" },
    });
    await prisma.organizationMembership.create({
      data: { userId: owner.id, organizationId: paginationOrganization.id, role: "owner" },
    });
    const records = [1, 2, 3].map((index) => ({
      id: `c${String(index).padStart(24, "0")}`,
      organizationId: paginationOrganization.id,
      name: `Pagination ${index}`,
      tokenHash: hashApiToken(`pagination-fixture-${index}`),
      tokenPrefix: "pcls_api_pagination",
      createdByLabel: owner.name,
      createdAt: new Date("2026-01-01T12:00:00.000Z"),
      expiresAt: index === 1 ? new Date("2026-01-02T12:00:00.000Z") : null,
      revokedAt: index === 2 ? new Date("2026-01-03T12:00:00.000Z") : null,
    }));
    await prisma.apiToken.createMany({ data: records });

    const context = await createContext(prisma)({
      req: {
        headers: {
          cookie: await createTestSessionCookie(String(owner.id)),
          "x-parcelis-organization-slug": paginationOrganization.slug,
        },
      },
    });
    const caller = appRouter.createCaller(context);
    const first = await caller.apiTokens.list({ limit: 2 });
    assert.deepEqual(
      first.items.map((token) => token.id),
      [records[2]!.id, records[1]!.id],
    );
    assert.equal(first.nextCursor, records[1]!.id);
    assert.equal(first.items[1]?.revokedAt, "2026-01-03T12:00:00.000Z");
    assert.ok(first.nextCursor);

    await prisma.apiToken.create({
      data: {
        ...records[2]!,
        id: `c${String(4).padStart(24, "0")}`,
        name: "Inserted before cursor",
        tokenHash: hashApiToken("pagination-fixture-4"),
      },
    });

    const second = await caller.apiTokens.list({ limit: 2, cursor: first.nextCursor });
    assert.deepEqual(
      second.items.map((token) => token.id),
      [records[0]!.id],
    );
    assert.equal(second.items[0]?.expiresAt, "2026-01-02T12:00:00.000Z");
    assert.equal(second.nextCursor, null);
    const ids = [...first.items, ...second.items].map((token) => token.id);
    assert.equal(new Set(ids).size, 3);
  });

  await t.test("organization administrators can create, list, and revoke tokens", async () => {
    const organizationAdministrator = await prisma.user.create({
      data: {
        name: "Organization administrator",
        email: "api-token-org-admin@example.test",
        passwordHash: "unused-test-password-hash",
        defaultOrganizationId: organization.id,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        userId: organizationAdministrator.id,
        organizationId: organization.id,
        role: "administrator",
      },
    });
    const context = await createContext(prisma)({
      req: { headers: { cookie: await createTestSessionCookie(String(organizationAdministrator.id)) } },
    });
    const caller = appRouter.createCaller(context);
    const created = await caller.apiTokens.create({ name: "No expiration", expiration: "never" });
    assert.equal(created.metadata.expiresAt, null);
    const listed = await caller.apiTokens.list({});
    assert.ok(listed.items.some((token) => token.id === created.metadata.id));
    const revoked = await caller.apiTokens.revoke({ id: created.metadata.id });
    assert.ok(revoked.revokedAt);
    assert.equal(revoked.revokedByLabel, organizationAdministrator.name);
  });

  await t.test("separate tokens may share a name and secrets are returned only during creation", async () => {
    const first = await ownerCaller.apiTokens.create({ name: "Shared integration" });
    const second = await ownerCaller.apiTokens.create({ name: "Shared integration" });
    assert.notEqual(first.token, second.token);
    assert.notEqual(first.metadata.id, second.metadata.id);

    const rows = await prisma.apiToken.findMany({
      where: { id: { in: [first.metadata.id, second.metadata.id] } },
    });
    assert.equal(rows.length, 2);
    assert.deepEqual(
      new Set(rows.map((row) => row.tokenHash)),
      new Set([hashApiToken(first.token), hashApiToken(second.token)]),
    );

    const listed = await ownerCaller.apiTokens.list({});
    const revoked = await ownerCaller.apiTokens.revoke({ id: first.metadata.id });
    const responses = JSON.stringify({ listed, revoked });
    for (const credential of [first.token, second.token, hashApiToken(first.token), hashApiToken(second.token)]) {
      assert.equal(responses.includes(credential), false);
    }
    for (const metadata of [...listed.items, revoked]) {
      assert.equal("token" in metadata, false);
      assert.equal("tokenHash" in metadata, false);
    }
    const active = await prisma.apiToken.findUniqueOrThrow({ where: { id: second.metadata.id } });
    assert.equal(active.revokedAt, null);
  });
});
