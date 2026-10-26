import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@parcelis/db";
import { TRPCError } from "@trpc/server";
import {
  hashApiToken,
  parseApiTokenAuthorization,
  resolveApiToken,
  updateApiTokenLastUsed,
} from "../../modules/api-tokens";
import { getActivityActor, withActivityActor } from "../../modules/activity-actor";
import { requirePrincipalPermission } from "../../modules/permissions";
import type { Context } from "../../router/context";
import { apiTokenAllowedProcedures, organizationApiProcedure, router } from "../../router/trpc";
import { publicRouter } from "../../router/public.router";

const token = `pcls_api_${"A".repeat(43)}`;
const now = new Date("2026-10-21T12:00:00Z");
const unauthorized = (error: unknown) => error instanceof TRPCError && error.code === "UNAUTHORIZED";

test("Bearer parsing preserves secret casing and distinguishes missing credentials", () => {
  assert.equal(parseApiTokenAuthorization(undefined), null);
  assert.equal(parseApiTokenAuthorization(`bEaReR ${token}`), token);
  assert.equal(parseApiTokenAuthorization(`Bearer pcls_api_${"a".repeat(43)}`), `pcls_api_${"a".repeat(43)}`);
});

for (const header of [
  "",
  "Bearer",
  `Basic ${token}`,
  `Bearer  ${token}`,
  `Bearer ${token} `,
  `Bearer ${token}\n`,
  `Bearer ${token}, Bearer ${token}`,
  `Bearer ${token.slice(0, -1)}`,
  `Bearer ${token}A`,
  `Bearer ${token.replace("pcls_api_", "PCLS_API_")}`,
  [`Bearer ${token}`],
]) {
  test(`rejects malformed Authorization: ${JSON.stringify(header)}`, () => {
    assert.throws(() => parseApiTokenAuthorization(header), unauthorized);
  });
}

for (const [label, row] of [
  ["unknown", null],
  ["revoked", { revokedAt: now, expiresAt: null }],
  ["expired", { revokedAt: null, expiresAt: new Date(now.getTime() - 1) }],
  ["exact expiration", { revokedAt: null, expiresAt: now }],
] as const) {
  test(`lookup rejects ${label} tokens`, async () => {
    const prisma = { apiToken: { findUnique: async () => row } } as unknown as PrismaClient;
    await assert.rejects(resolveApiToken(prisma, token, now), unauthorized);
  });
}

test("lookup hashes credentials, selects safe fields, and accepts unexpired or never-expiring tokens", async () => {
  for (const expiresAt of [null, new Date(now.getTime() + 1)]) {
    const row = { id: "token-id", revokedAt: null, expiresAt };
    const prisma = {
      apiToken: {
        findUnique: async (query: { where: unknown; select: object }) => {
          assert.deepEqual(query.where, { tokenHash: hashApiToken(token) });
          assert.equal("tokenHash" in query.select, false);
          assert.equal("createdById" in query.select, false);
          return row;
        },
      },
    } as unknown as PrismaClient;
    assert.equal(await resolveApiToken(prisma, token, now), row);
  }
});

test("database errors propagate instead of becoming invalid-credential errors", async () => {
  const failure = new Error("database unavailable");
  const prisma = {
    apiToken: {
      findUnique: async () => {
        throw failure;
      },
    },
  } as unknown as PrismaClient;
  await assert.rejects(resolveApiToken(prisma, token, now), (error) => error === failure);
});

test("last-used writes have an atomic five-minute condition", async () => {
  let query: unknown;
  const prisma = {
    apiToken: {
      updateMany: async (input: unknown) => {
        query = input;
      },
    },
  } as unknown as PrismaClient;
  await updateApiTokenLastUsed(prisma, "token-id", now);
  assert.deepEqual(query, {
    where: {
      id: "token-id",
      revokedAt: null,
      OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: new Date(now.getTime() - 300_000) } }],
    },
    data: { lastUsedAt: now },
  });
});

test("every protected REST operation has an explicit token-access classification", () => {
  const paths = Object.keys(publicRouter._def.procedures).filter((path) => path !== "health");
  assert.deepEqual(new Set(paths), apiTokenAllowedProcedures);
});

test("tokens retain feature and action-support checks without consulting user roles", async () => {
  const ctx = { prisma: {}, session: null, principal: { kind: "api-token" } } as unknown as Context;
  await requirePrincipalPermission(ctx, "properties", "view");
  await assert.rejects(
    requirePrincipalPermission(ctx, "property_notes", "archive"),
    (error) => error instanceof TRPCError && error.code === "FORBIDDEN",
  );
  const previous = process.env.FEATURE_FLAG_APPLICATIONS_ENABLED;
  process.env.FEATURE_FLAG_APPLICATIONS_ENABLED = "false";
  try {
    await assert.rejects(
      requirePrincipalPermission(ctx, "applications", "view"),
      (error) => error instanceof TRPCError && error.code === "FORBIDDEN",
    );
  } finally {
    if (previous === undefined) delete process.env.FEATURE_FLAG_APPLICATIONS_ENABLED;
    else process.env.FEATURE_FLAG_APPLICATIONS_ENABLED = previous;
  }
});

test("token activity attribution follows asynchronous calls and stays isolated", async () => {
  assert.equal(getActivityActor(), undefined);
  const actors = await Promise.all(
    [1, 2].map((id) =>
      withActivityActor({ id: `api-token:${id}`, name: `API token: ${id}` }, async () => {
        await Promise.resolve();
        return getActivityActor();
      }),
    ),
  );
  assert.deepEqual(
    actors.map((actor) => actor?.id),
    ["api-token:1", "api-token:2"],
  );
  assert.equal(getActivityActor(), undefined);
});

test("organization middleware attributes token operations and refuses unlisted paths", async () => {
  const routes = router({
    tags: router({ list: organizationApiProcedure.query(() => getActivityActor()) }),
    account: organizationApiProcedure.query(() => "unreachable"),
  });
  const ctx = {
    prisma: { apiToken: { updateMany: async () => ({ count: 0 }) } },
    transport: "rest",
    session: null,
    organization: null,
    principal: {
      kind: "api-token",
      tokenId: "token-id",
      tokenName: "Bruno",
      organizationId: 1,
      organization: { id: 1 },
    },
  } as unknown as Context;
  const caller = routes.createCaller(ctx);
  assert.deepEqual(await caller.tags.list(), { id: "api-token:token-id", name: "API token: Bruno" });
  await assert.rejects(caller.account(), (error) => error instanceof TRPCError && error.code === "FORBIDDEN");
});
