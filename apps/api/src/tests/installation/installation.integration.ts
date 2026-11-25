import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { initializeInstallationIdentity, PrismaClient, PrismaPg } from "@parcelis/db";
import {
  createIsolatedTestSchema,
  validateOutboxTestDatabaseUrl,
} from "../../../../../scripts/outbox-test-database.mjs";
import { authRouter } from "../../router/auth.router";
import type { Context } from "../../router/context";
import { resetRateLimits } from "../../modules/login-rate-limit";

const databaseUrl = process.env.INSTALLATION_TEST_DATABASE_URL;
if (databaseUrl) validateOutboxTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);

test(
  "account setup commits one installation identity and preserves it across clients",
  {
    skip: !databaseUrl,
    timeout: 90_000,
  },
  async (t) => {
    resetRateLimits();
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "installation_test").catch(async (error) => {
      await admin.$disconnect();
      throw error;
    });
    const connect = () =>
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
      });
    const first = connect();
    const second = connect();
    t.after(async () => {
      await Promise.all([first.$disconnect(), second.$disconnect()]);
      try {
        await isolated.cleanup();
      } finally {
        await admin.$disconnect();
        resetRateLimits();
      }
    });
    const register = (prisma: PrismaClient, email: string) =>
      authRouter
        .createCaller({ prisma, req: { headers: {}, ip: "127.0.0.1" } } as Context)
        .register({ email, password: randomUUID() });
    assert.equal(await first.installation.count(), 0);
    const failing = first.$extends({
      query: {
        installation: {
          async upsert({ args, query }) {
            await query(args);
            throw new Error("Setup failed");
          },
        },
      },
    });
    await assert.rejects(register(failing as unknown as PrismaClient, "failed-setup@example.test"), /Setup failed/);
    assert.equal(await first.user.count(), 0);
    assert.equal(await first.organization.count(), 0);
    assert.equal(await first.outboxEvent.count(), 0);
    assert.equal(await first.installation.count(), 0);

    const accounts = await Promise.all([
      register(first, "first-account@example.test"),
      register(second, "second-account@example.test"),
    ]);
    assert.equal(await first.user.count(), 2);
    assert.equal(await first.installation.count(), 1);
    const identity = await first.installation.findUniqueOrThrow({ where: { id: "installation" } });
    assert.match(identity.installationId, /^[0-9a-f-]{36}$/);
    assert.ok(!JSON.stringify(accounts).includes(identity.installationId));
    assert.deepEqual(await initializeInstallationIdentity(second), identity);

    const restarted = connect();
    try {
      await register(restarted, "later-account@example.test");
      assert.deepEqual(await initializeInstallationIdentity(restarted), identity);
      assert.equal(await restarted.installation.count(), 1);
    } finally {
      await restarted.$disconnect();
    }
  },
);
