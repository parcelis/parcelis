import assert from "node:assert/strict";
import test from "node:test";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";
import type { Prisma } from "@parcelis/db";

test("listing API tokens requires sign-in", async () => {
  const caller = appRouter.createCaller({
    prisma: {},
    req: { headers: {} },
    session: null,
    organization: null,
  } as unknown as Context);

  await assert.rejects(caller.apiTokens.list({}), {
    code: "UNAUTHORIZED",
  });
});

test("ordinary organization members cannot list API tokens", async () => {
  const caller = appRouter.createCaller({
    prisma: {},
    req: { headers: {} },
    session: {
      userId: 1,
      user: {
        id: 1,
        role: "property_manager",
      },
    },
    organization: {
      organizationId: 7,
      role: "member",
    },
  } as unknown as Context);

  await assert.rejects(caller.apiTokens.list({}), {
    code: "FORBIDDEN",
  });
});

test("owners can list tokens from the selected organization", async () => {
  let queried = false;

  const caller = appRouter.createCaller({
    prisma: {
      apiToken: {
        findMany: async (query: Prisma.ApiTokenFindManyArgs) => {
          queried = true;

          assert.deepEqual(query.where, { organizationId: 7 });
          assert.equal(query.select?.tokenHash, undefined);

          return [];
        },
      },
    },
    req: { headers: {} },
    session: {
      userId: 1,
      user: {
        id: 1,
        role: "property_manager",
      },
    },
    organization: {
      organizationId: 7,
      role: "owner",
    },
  } as unknown as Context);

  const result = await caller.apiTokens.list({});

  assert.equal(queried, true);
  assert.deepEqual(result, {
    items: [],
    nextCursor: null,
  });
});

test("listing tokens returns safe metadata with serialized dates", async () => {
  const token = {
    id: "cjld2cjxh0000qzrmn831i7rn",
    name: "Bruno",
    tokenPrefix: "pcls_api_0123456789",
    createdByLabel: "Test owner",
    createdAt: new Date("2026-10-20T12:00:00.000Z"),
    expiresAt: new Date("2026-10-27T12:00:00.000Z"),
    lastUsedAt: null,
    revokedAt: null,
    revokedByLabel: null,
    tokenHash: "a".repeat(64),
  };

  const caller = appRouter.createCaller({
    prisma: {
      apiToken: {
        findMany: async () => [token],
      },
    },
    req: { headers: {} },
    session: {
      userId: 1,
      user: {
        id: 1,
        role: "property_manager",
      },
    },
    organization: {
      organizationId: 7,
      role: "owner",
    },
  } as unknown as Context);

  const result = await caller.apiTokens.list({});

  assert.deepEqual(result, {
    items: [
      {
        id: token.id,
        name: "Bruno",
        tokenPrefix: "pcls_api_0123456789",
        createdByLabel: "Test owner",
        createdAt: "2026-10-20T12:00:00.000Z",
        expiresAt: "2026-10-27T12:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
        revokedByLabel: null,
      },
    ],
    nextCursor: null,
  });
});

test("listing tokens returns a cursor when another page exists", async () => {
  const firstToken = {
    id: "cjld2cjxh0000qzrmn831i7rn",
    name: "First token",
    tokenPrefix: "pcls_api_0123456789",
    createdByLabel: "Test owner",
    createdAt: new Date("2026-10-20T12:00:00.000Z"),
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    revokedByLabel: null,
  };

  const secondToken = {
    ...firstToken,
    id: "cjld2cjxh0000qzrmn831i7rm",
    name: "Second token",
  };

  const caller = appRouter.createCaller({
    prisma: {
      apiToken: {
        findMany: async (query: Prisma.ApiTokenFindManyArgs) => {
          assert.equal(query.take, 2);
          return [firstToken, secondToken];
        },
      },
    },
    req: { headers: {} },
    session: {
      userId: 1,
      user: {
        id: 1,
        role: "property_manager",
      },
    },
    organization: {
      organizationId: 7,
      role: "owner",
    },
  } as unknown as Context);

  const result = await caller.apiTokens.list({ limit: 1 });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.id, firstToken.id);
  assert.equal(result.nextCursor, firstToken.id);
});

test("listing rejects a cursor that does not belong to the organization", async () => {
  const cursor = "cjld2cjxh0000qzrmn831i7rn";

  const caller = appRouter.createCaller({
    prisma: {
      apiToken: {
        findFirst: async (query: Prisma.ApiTokenFindFirstArgs) => {
          assert.deepEqual(query.where, {
            id: cursor,
            organizationId: 7,
          });

          return null;
        },
        findMany: async () => {
          assert.fail("An invalid cursor must be rejected before listing tokens.");
        },
      },
    },
    req: { headers: {} },
    session: {
      userId: 1,
      user: {
        id: 1,
        role: "property_manager",
      },
    },
    organization: {
      organizationId: 7,
      role: "owner",
    },
  } as unknown as Context);

  await assert.rejects(caller.apiTokens.list({ cursor }), {
    code: "NOT_FOUND",
  });
});

test("listing continues after a valid cursor and handles the end of the list", async () => {
  const cursor = "cjld2cjxh0000qzrmn831i7rn";

  const caller = appRouter.createCaller({
    prisma: {
      apiToken: {
        findFirst: async (query: Prisma.ApiTokenFindFirstArgs) => {
          assert.deepEqual(query.where, {
            id: cursor,
            organizationId: 7,
          });

          return { id: cursor };
        },
        findMany: async (query: Prisma.ApiTokenFindManyArgs) => {
          assert.deepEqual(query.where, { organizationId: 7 });
          assert.deepEqual(query.cursor, { id: cursor });
          assert.equal(query.skip, 1);

          return [];
        },
      },
    },
    req: { headers: {} },
    session: {
      userId: 1,
      user: {
        id: 1,
        role: "property_manager",
      },
    },
    organization: {
      organizationId: 7,
      role: "owner",
    },
  } as unknown as Context);

  const result = await caller.apiTokens.list({ cursor });

  assert.deepEqual(result, {
    items: [],
    nextCursor: null,
  });
});