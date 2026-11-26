import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import { parcelisAccountsOrigin } from "@parcelis/schemas";
import webPackage from "../../../../web/package.json" with { type: "json" };
import {
  createIsolatedTestSchema,
  validateOutboxTestDatabaseUrl,
} from "../../../../../scripts/outbox-test-database.mjs";
import type { Context } from "../../router/context";
import { installationLicenseRouter } from "../../router/installation-license.router";
import { accountsLicenseSigner } from "./installation-license-fixture";

const databaseUrl = process.env.INSTALLATION_TEST_DATABASE_URL;
if (databaseUrl) validateOutboxTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);

test(
  "activation retries reuse the credential and refresh applies only verified plan changes",
  {
    skip: !databaseUrl,
    timeout: 90_000,
  },
  async (t) => {
    const previousUrl = process.env.NEXTAUTH_URL;
    process.env.NEXTAUTH_URL = "https://rentals.example.com";
    t.after(() => {
      if (previousUrl === undefined) delete process.env.NEXTAUTH_URL;
      else process.env.NEXTAUTH_URL = previousUrl;
    });
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "installation_license").catch(
      async (error) => {
        await admin.$disconnect();
        throw error;
      },
    );
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
    });
    t.after(async () => {
      await db.$disconnect();
      try {
        await isolated.cleanup();
      } finally {
        await admin.$disconnect();
      }
    });

    const adminCaller = (userId: number, prisma: unknown = db) =>
      installationLicenseRouter.createCaller({
        prisma,
        session: { userId, user: { id: userId, role: "administrator" } },
        organization: { organizationId: 1, role: "administrator" },
      } as unknown as Context);
    const caller = adminCaller(1);
    const readAgain = () =>
      installationLicenseRouter
        .createCaller({
          prisma: db,
          session: { userId: 2, user: { id: 2, role: "property_manager" } },
          organization: { organizationId: 2, role: "owner" },
        } as unknown as Context)
        .status();

    const signer = accountsLicenseSigner();
    let stage: "timeout" | "activation" | "upgrade" | "tampered" | "revoked" | "unlink-failed" | "unlink" = "timeout";
    const activationRequests: { id: string; credential: string; url?: string; version?: string }[] = [];
    const refreshRequests: { path: string; authorization: string | null; body: unknown }[] = [];
    const unlinkRequests: { path: string; authorization: string | null }[] = [];
    t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
      const { origin, pathname } = new URL(url);
      assert.equal(origin, parcelisAccountsOrigin);
      if (pathname === "/.well-known/parcelis-license-keys.json") return Response.json(signer.keys);
      if (pathname.endsWith("/unlink")) {
        unlinkRequests.push({ path: pathname, authorization: new Headers(init?.headers).get("authorization") });
        return new Response(null, { status: stage === "unlink" ? 204 : 503 });
      }
      const body = JSON.parse(String(init?.body));
      if (pathname === "/api/installations/activate") {
        activationRequests.push({ id: body.id, credential: body.credential, url: body.url, version: body.version });
        if (stage === "timeout") throw new Error("Response lost");
        return Response.json(signer.issue(body.id, "free"));
      }

      refreshRequests.push({ path: pathname, authorization: new Headers(init?.headers).get("authorization"), body });
      if (stage === "revoked") return Response.json({ error: "license_inactive" }, { status: 403 });
      const snapshot = signer.issue(pathname.split("/")[3]!, "enterprise");
      return Response.json(stage === "tampered" ? { ...snapshot, tier: "free" } : snapshot);
    });

    const activation = { code: `plc_${"A".repeat(32)}`, name: "Local", environment: "development" } as const;
    assert.deepEqual(await caller.status(), { state: "unlinked", tier: "free", lastSyncedAt: null });
    await assert.rejects(caller.activate(activation), { code: "BAD_GATEWAY" });
    assert.equal((await caller.status()).state, "unlinked");

    stage = "activation";
    const activated = await caller.activate(activation);
    assert.equal(activated.state, "active");
    assert.equal(activated.tier, "free");
    const { id, credential, url, version } = activationRequests[0]!;
    assert.equal(activationRequests[1]?.id, id);
    assert.ok(activationRequests[1]?.credential === credential, "Activation retry reuses the stored credential");
    assert.equal(url, "https://rentals.example.com/");
    assert.equal(version, webPackage.version);
    assert.match(credential, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(await readAgain(), activated);

    stage = "upgrade";
    const upgraded = await caller.refresh();
    assert.equal(upgraded.tier, "enterprise");
    assert.equal(refreshRequests[0]?.path, `/api/installations/${id}/refresh`);
    assert.ok(refreshRequests[0]?.authorization === `Bearer ${credential}`, "Refresh uses the stored credential");
    assert.deepEqual(refreshRequests[0]?.body, { url, version: webPackage.version });
    assert.deepEqual(await readAgain(), upgraded);

    stage = "tampered";
    await assert.rejects(caller.refresh(), { code: "BAD_GATEWAY" });
    assert.deepEqual(refreshRequests[1]?.body, { url, version: webPackage.version });
    assert.deepEqual(await readAgain(), upgraded);

    stage = "revoked";
    const revoked = await caller.refresh();
    assert.equal(revoked.state, "inactive");
    assert.equal(revoked.tier, "free");
    assert.deepEqual(await readAgain(), revoked);

    const otherAdmin = adminCaller(3);
    stage = "unlink-failed";
    await assert.rejects(otherAdmin.unlink(), { code: "BAD_GATEWAY" });
    assert.deepEqual(await readAgain(), revoked);

    stage = "unlink";
    const unlinked = { state: "unlinked", tier: "free", lastSyncedAt: null };
    assert.deepEqual(await otherAdmin.unlink(), unlinked);
    assert.deepEqual(await otherAdmin.unlink(), unlinked);
    assert.equal(unlinkRequests.length, 2);
    for (const request of unlinkRequests) {
      assert.equal(request.path, `/api/installations/${id}/unlink`);
      assert.ok(request.authorization === `Bearer ${credential}`, "Unlink uses the registered credential");
    }
    assert.deepEqual(await readAgain(), unlinked);
    assert.equal((await db.installation.findUniqueOrThrow({ where: { id: "installation" } })).installationId, id);

    const relinked = await otherAdmin.activate({ ...activation, code: `plc_${"B".repeat(32)}` });
    assert.equal(relinked.state, "active");
    const newRegistration = activationRequests.at(-1)!;
    assert.notEqual(newRegistration.id, id);
    assert.ok(newRegistration.credential !== credential, "A new registration uses a different credential");

    const latestRegistrationId = randomUUID();
    const latestCredential = randomBytes(32).toString("base64url");
    const racingDb = db.$extends({
      query: {
        installationLicense: {
          async updateMany({ args, query }) {
            if (args.data.operationId && args.data.operationUntil) {
              await db.installationLicense.update({
                where: { installationId: id },
                data: { registrationId: latestRegistrationId, credential: latestCredential },
              });
            }
            return query(args);
          },
        },
      },
    });
    stage = "upgrade";
    assert.equal((await adminCaller(4, racingDb).refresh()).tier, "enterprise");
    const latestRefresh = refreshRequests.at(-1);
    assert.equal(latestRefresh?.path, `/api/installations/${latestRegistrationId}/refresh`);
    assert.ok(latestRefresh?.authorization === `Bearer ${latestCredential}`);
  },
);
