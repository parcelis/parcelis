import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import {
  createIsolatedTestSchema,
  validateOutboxTestDatabaseUrl,
} from "../../../../../scripts/outbox-test-database.mjs";
import { hashApiToken } from "../../modules/api-tokens";
import { appRouter } from "../../router/app.router";
import { createContext } from "../../router/context";
import { handleRestRequest } from "../../router/rest-handler";
import { createTestSessionCookie } from "../auth/session-cookie";

const databaseUrl = process.env.API_TOKEN_TEST_DATABASE_URL;
if (databaseUrl) validateOutboxTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);

test(
  "token migration preserves browser access and supports application rollback",
  { skip: !databaseUrl },
  async (t) => {
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "token_release_test").catch(async (error) => {
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

    // Rehearse the additive migration against populated tables in an isolated schema.
    await prisma.$executeRawUnsafe(`DROP TABLE "${isolated.schema}"."ApiToken"`);
    const organization = await prisma.organization.create({
      data: { name: "Release rehearsal", slug: "release-rehearsal" },
    });
    const owner = await prisma.user.create({
      data: {
        name: "Release owner",
        email: "release-owner@example.test",
        passwordHash: "unused",
        defaultOrganizationId: organization.id,
        organizationMemberships: { create: { organizationId: organization.id, role: "owner" } },
      },
    });
    const property = await prisma.property.create({
      data: {
        organizationId: organization.id,
        name: "Existing property",
        unitCount: 0,
        line1: "100 Main",
        city: "Madison",
        region: "WI",
        postalCode: "53703",
      },
    });
    await prisma.rolePermission.create({
      data: { role: "property_manager", resource: "properties", canView: true },
    });
    const cookie = await createTestSessionCookie(String(owner.id));
    const browserRequest = () => new Request("http://localhost/api/v1/properties", { headers: { cookie } });
    assert.equal((await handleRestRequest(prisma, browserRequest())).status, 200);

    const migration = await readFile(
      new URL(
        "../../../../../packages/db/prisma/migrations/20261020023756_add_api_tokens/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${isolated.schema}"`);
      for (const statement of migration
        .split(";")
        .map((sql) => sql.trim())
        .filter(Boolean)) {
        await tx.$executeRawUnsafe(statement);
      }
    });
    assert.equal(await prisma.apiToken.count(), 0);
    assert.equal((await prisma.property.findUniqueOrThrow({ where: { id: property.id } })).name, property.name);
    assert.equal((await handleRestRequest(prisma, browserRequest())).status, 200);

    const caller = appRouter.createCaller(await createContext(prisma)({ req: { headers: { cookie } } }));
    const first = await caller.apiTokens.create({ name: "Primary integration", expiration: "never" });
    const second = await caller.apiTokens.create({ name: "Replacement integration", expiration: "never" });
    const credentials = [first, second];
    const tokenRequest = (token: string) =>
      new Request("http://localhost/api/v1/properties", { headers: { authorization: `Bearer ${token}` } });
    for (const credential of credentials) {
      const response = await handleRestRequest(prisma, tokenRequest(credential.token));
      assert.equal(response.status, 200);
      assert.deepEqual(
        (await response.json()).data.map((row: { id: number }) => row.id),
        [property.id],
      );
      const record = await prisma.apiToken.findUniqueOrThrow({ where: { id: credential.metadata.id } });
      assert.equal(record.tokenHash, hashApiToken(credential.token));
      assert.equal(JSON.stringify(record).includes(credential.token), false);
    }
    const metadata = JSON.stringify(await caller.apiTokens.list({}));
    for (const { token } of credentials) {
      assert.equal(metadata.includes(token), false);
      assert.equal(metadata.includes(hashApiToken(token)), false);
    }

    await t.test(
      "previous application rejects bearer-only calls but preserves the schema and browser session",
      {
        skip: !process.env.API_TOKEN_ROLLBACK_API_ROOT,
      },
      async () => {
        const source = resolve(process.env.API_TOKEN_ROLLBACK_API_ROOT!, "src/app/api/v1/[...path]/route.ts");
        const previous = (await import(pathToFileURL(source).href)) as { GET(request: Request): Promise<Response> };
        const shared = globalThis as typeof globalThis & { parcelisPrisma?: PrismaClient };
        const original = shared.parcelisPrisma;
        shared.parcelisPrisma = prisma;
        try {
          assert.equal((await previous.GET(browserRequest())).status, 200);
          assert.equal((await previous.GET(tokenRequest(first.token))).status, 401);
          assert.equal((await previous.GET(tokenRequest(second.token))).status, 401);
          assert.equal(await prisma.apiToken.count(), 2);
          assert.equal(await prisma.organization.count(), 1);
          assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).email, owner.email);
        } finally {
          shared.parcelisPrisma = original;
        }
        assert.equal((await handleRestRequest(prisma, tokenRequest(second.token))).status, 200);
      },
    );

    const authorizedBeforeRevocation = appRouter.createCaller(
      await createContext(prisma)({
        transport: "rest",
        req: { headers: { authorization: `Bearer ${first.token}` } },
      }),
    );
    await Promise.all(Array.from({ length: 4 }, () => caller.apiTokens.revoke({ id: first.metadata.id })));
    assert.deepEqual(
      (await authorizedBeforeRevocation.properties.list()).map((row) => row.id),
      [property.id],
    );
    assert.equal((await handleRestRequest(prisma, tokenRequest(first.token))).status, 401);
    assert.equal((await handleRestRequest(prisma, tokenRequest(second.token))).status, 200);
    await prisma.apiToken.update({ where: { id: second.metadata.id }, data: { expiresAt: new Date(0) } });
    assert.equal((await handleRestRequest(prisma, tokenRequest(second.token))).status, 401);
    assert.equal((await handleRestRequest(prisma, browserRequest())).status, 200);
    const history = JSON.stringify({
      activity: await prisma.activityEvent.findMany(),
      outbox: await prisma.outboxEvent.findMany(),
    });
    for (const { token } of credentials) {
      assert.equal(history.includes(token), false);
      assert.equal(history.includes(hashApiToken(token)), false);
    }
  },
);
