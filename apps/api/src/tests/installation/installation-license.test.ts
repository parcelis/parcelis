import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  syncAccountsLicense,
  unlinkAccountsInstallation,
  verifyAccountsLicense,
} from "../../modules/parcelis-accounts-license";
import type { Context } from "../../router/context";
import { installationLicenseRouter } from "../../router/installation-license.router";
import { accountsLicenseSigner } from "./installation-license-fixture";

const activation = { code: `plc_${"A".repeat(32)}`, name: "Test", environment: "development" } as const;

test("only a valid Accounts license for this installation determines the tier", () => {
  const signer = accountsLicenseSigner();
  const installationId = randomUUID();
  const snapshot = signer.issue(installationId, "enterprise");
  assert.equal(verifyAccountsLicense(snapshot, signer.keys, installationId).tier, "enterprise");
  assert.throws(() => verifyAccountsLicense({ ...snapshot, tier: "free" }, signer.keys, installationId));
  assert.throws(() => verifyAccountsLicense(snapshot, signer.keys, randomUUID()));
  assert.throws(() => verifyAccountsLicense(snapshot, accountsLicenseSigner().keys, installationId));
  assert.throws(() => verifyAccountsLicense(snapshot, signer.keys, installationId, Date.parse(snapshot.validUntil)));
});

test("activation does not redeem a code when signing keys are unavailable", async () => {
  const methods: string[] = [];
  const accounts = async (_request: RequestInfo | URL, init?: RequestInit) => {
    methods.push(init?.method ?? "GET");
    return new Response(null, { status: 404 });
  };
  await assert.rejects(syncAccountsLicense(randomUUID(), "fixture", activation, accounts), {
    code: "BAD_GATEWAY",
    message: "Parcelis Portal signing keys are unavailable. Try again later.",
  });
  assert.deepEqual(methods, ["GET"]);
});

test("refresh gives signing key discovery its own timeout", async () => {
  const signer = accountsLicenseSigner();
  const installationId = randomUUID();
  const signals: (AbortSignal | null | undefined)[] = [];
  const accounts = async (_request: RequestInfo | URL, init?: RequestInit) => {
    signals.push(init?.signal);
    return Response.json(init?.method === "POST" ? signer.issue(installationId, "enterprise") : signer.keys);
  };

  assert.equal((await syncAccountsLicense(installationId, "fixture", undefined, accounts)).kind, "verified");
  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal instanceof AbortSignal));
  assert.notEqual(signals[0], signals[1]);
});

test("refresh reports a non-JSON Portal error as a failed request", async () => {
  const accounts = async () => new Response("<html>Service unavailable</html>", { status: 503 });
  await assert.rejects(syncAccountsLicense(randomUUID(), "fixture", undefined, accounts), {
    code: "BAD_GATEWAY",
    message: "Parcelis Portal couldn’t complete this request. Try again.",
  });
});

test("unlink reports that the deployed portal lacks the endpoint", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 404 }));
  await assert.rejects(unlinkAccountsInstallation(randomUUID(), "fixture"), {
    code: "BAD_GATEWAY",
    message: "Unlinking isn’t available in the deployed version of Parcelis Portal.",
  });
});

test("license access requires organization access and mutations require an installation administrator", async () => {
  function caller(session: unknown, role?: string) {
    return installationLicenseRouter.createCaller({
      session,
      organization: role ? { role } : null,
      prisma: { installation: { findUnique: async () => null } },
    } as unknown as Context);
  }

  const session = { userId: 1, user: { id: 1, role: "property_manager" } };
  await assert.rejects(caller(null).status(), { code: "UNAUTHORIZED" });
  await assert.rejects(caller(session).status(), { code: "FORBIDDEN" });
  await assert.rejects(caller(session, "member").status(), { code: "FORBIDDEN" });
  assert.equal((await caller(session, "owner").status()).tier, "free");
  await assert.rejects(caller(session, "owner").activate(activation), { code: "FORBIDDEN" });
  await assert.rejects(caller(session, "owner").refresh(), { code: "FORBIDDEN" });
  await assert.rejects(caller(session, "owner").unlink(), { code: "FORBIDDEN" });
});
