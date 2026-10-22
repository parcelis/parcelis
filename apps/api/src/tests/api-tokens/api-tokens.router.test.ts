import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";
import type { Prisma, PrismaClient } from "@parcelis/db";
import { hashApiToken } from "../../modules/api-tokens";
import { resetRateLimits } from "../../modules/login-rate-limit";
import { createContext } from "../../router/context";
import { createTestSessionCookie } from "../auth/session-cookie";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createFetchContext } from "../../router/fetch-context";

beforeEach(resetRateLimits);

function createOwnerCaller(prisma: unknown) {
  return appRouter.createCaller({
    prisma,
    req: { headers: {} },
    session: {
      userId: 1,
      user: {
        id: 1,
        name: "Test owner",
        role: "property_manager",
      },
    },
    organization: {
      organizationId: 7,
      role: "owner",
    },
  } as unknown as Context);
}

test("API-token management requires sign-in", async () => {
  const caller = appRouter.createCaller({
    prisma: {},
    req: { headers: {} },
    session: null,
    organization: null,
  } as unknown as Context);

  await assert.rejects(caller.apiTokens.list({}), { code: "UNAUTHORIZED" });
  await assert.rejects(caller.apiTokens.create({ name: "Bruno" }), { code: "UNAUTHORIZED" });
  await assert.rejects(caller.apiTokens.revoke({ id: "cjld2cjxh0000qzrmn831i7rn" }), { code: "UNAUTHORIZED" });
});

test("ordinary organization members cannot manage API tokens", async () => {
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

  await assert.rejects(caller.apiTokens.list({}), { code: "FORBIDDEN" });
  await assert.rejects(caller.apiTokens.create({ name: "Bruno" }), { code: "FORBIDDEN" });
  await assert.rejects(caller.apiTokens.revoke({ id: "cjld2cjxh0000qzrmn831i7rn" }), { code: "FORBIDDEN" });
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

test("creation returns the secret and stores only its hash", async () => {
  let storedData: Prisma.ApiTokenUncheckedCreateInput | undefined;

  const caller = appRouter.createCaller({
    prisma: {
      apiToken: {
        create: async ({ data }: { data: Prisma.ApiTokenUncheckedCreateInput }) => {
          storedData = data;

          return {
            ...data,
            id: "cjld2cjxh0000qzrmn831i7rn",
            createdAt: new Date("2026-10-20T12:00:00.000Z"),
            lastUsedAt: null,
            revokedAt: null,
            revokedByLabel: null,
          };
        },
      },
    },
    req: { headers: {} },
    session: {
      userId: 1,
      user: {
        id: 1,
        name: "Test owner",
        role: "property_manager",
      },
    },
    organization: {
      organizationId: 7,
      role: "owner",
    },
  } as unknown as Context);

  const input = {
    name: "Bruno",
    organizationId: 999,
    createdById: 999,
  };
  const result = await caller.apiTokens.create(input);

  assert.ok(storedData);
  assert.equal(storedData.organizationId, 7);
  assert.equal(storedData.createdById, 1);
  assert.equal(storedData.createdByLabel, "Test owner");
  assert.equal(storedData.tokenHash, hashApiToken(result.token));
  assert.equal(storedData.tokenPrefix, result.token.slice(0, 19));
  assert.equal(Object.values(storedData).includes(result.token), false);
  assert.equal("tokenHash" in result.metadata, false);
});

test("owners can revoke a token in the selected organization", async () => {
  const record = {
    id: "cjld2cjxh0000qzrmn831i7rn",
    name: "Bruno",
    tokenPrefix: "pcls_api_0123456789",
    createdByLabel: "Test owner",
    createdAt: new Date("2026-10-20T12:00:00.000Z"),
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null as Date | null,
    revokedByLabel: null as string | null,
  };

  const transactionClient = {
    apiToken: {
      updateMany: async (query: Prisma.ApiTokenUpdateManyArgs) => {
        assert.deepEqual(query.where, {
          id: record.id,
          organizationId: 7,
          revokedAt: null,
        });

        assert.equal(query.data.revokedById, 1);
        assert.equal(query.data.revokedByLabel, "Test owner");
        assert.ok(query.data.revokedAt instanceof Date);

        record.revokedAt = query.data.revokedAt;
        record.revokedByLabel = "Test owner";

        return { count: 1 };
      },
      findFirst: async (query: Prisma.ApiTokenFindFirstArgs) => {
        assert.deepEqual(query.where, {
          id: record.id,
          organizationId: 7,
        });

        return record;
      },
    },
  };

  const caller = createOwnerCaller({
    $transaction: async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transactionClient as unknown as Prisma.TransactionClient),
  });

  const result = await caller.apiTokens.revoke({ id: record.id });

  assert.ok(record.revokedAt);
  assert.equal(result.revokedAt, record.revokedAt.toISOString());
  assert.equal(result.revokedByLabel, "Test owner");
});

test("repeated revocation preserves the original details", async () => {
  const originalRevokedAt = new Date("2026-10-20T13:00:00.000Z");

  const record = {
    id: "cjld2cjxh0000qzrmn831i7rn",
    name: "Bruno",
    tokenPrefix: "pcls_api_0123456789",
    createdByLabel: "Test owner",
    createdAt: new Date("2026-10-20T12:00:00.000Z"),
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: originalRevokedAt,
    revokedByLabel: "Original administrator",
  };

  const transactionClient = {
    apiToken: {
      updateMany: async (query: Prisma.ApiTokenUpdateManyArgs) => {
        assert.deepEqual(query.where, {
          id: record.id,
          organizationId: 7,
          revokedAt: null,
        });

        return { count: 0 };
      },
      findFirst: async () => record,
    },
  };

  const caller = createOwnerCaller({
    $transaction: async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transactionClient as unknown as Prisma.TransactionClient),
  });

  const first = await caller.apiTokens.revoke({ id: record.id });
  const second = await caller.apiTokens.revoke({ id: record.id });

  assert.deepEqual(second, first);
  assert.equal(second.revokedAt, originalRevokedAt.toISOString());
  assert.equal(second.revokedByLabel, "Original administrator");
});

test("revocation rejects a token outside the selected organization", async () => {
  const id = "cjld2cjxh0000qzrmn831i7rn";

  const transactionClient = {
    apiToken: {
      updateMany: async (query: Prisma.ApiTokenUpdateManyArgs) => {
        assert.deepEqual(query.where, {
          id,
          organizationId: 7,
          revokedAt: null,
        });

        return { count: 0 };
      },
      findFirst: async (query: Prisma.ApiTokenFindFirstArgs) => {
        assert.deepEqual(query.where, {
          id,
          organizationId: 7,
        });

        return null;
      },
    },
  };

  const caller = createOwnerCaller({
    $transaction: async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transactionClient as unknown as Prisma.TransactionClient),
  });

  await assert.rejects(caller.apiTokens.revoke({ id }), {
    code: "NOT_FOUND",
  });
});

test("creation stops writing after the rate limit is reached", async () => {
  let writes = 0;

  const caller = createOwnerCaller({
    apiToken: {
      create: async ({ data }: { data: Prisma.ApiTokenUncheckedCreateInput }) => {
        writes++;

        return {
          ...data,
          id: "cjld2cjxh0000qzrmn831i7rn",
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
          revokedByLabel: null,
        };
      },
    },
  });

  for (let attempt = 0; attempt < 10; attempt++) {
    await caller.apiTokens.create({
      name: `Integration ${attempt + 1}`,
    });
  }

  await assert.rejects(caller.apiTokens.create({ name: "One too many" }), { code: "TOO_MANY_REQUESTS" });

  assert.equal(writes, 10);
});

test("platform administrators can list tokens without organization membership", async () => {
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 1,
        name: "Platform administrator",
        role: "administrator",
        accountStatus: "active",
        passwordChangedAt: null,
        defaultOrganizationId: 3,
      }),
    },
    organization: {
      findFirst: async (query: Prisma.OrganizationFindFirstArgs) => {
        assert.deepEqual(query.where, {
          slug: "selected-organization",
        });

        return {
          id: 7,
          slug: "selected-organization",
        };
      },
    },
    organizationMembership: {
      findFirst: async () => {
        assert.fail("Platform administrators do not require membership.");
      },
    },
    apiToken: {
      findMany: async (query: Prisma.ApiTokenFindManyArgs) => {
        assert.deepEqual(query.where, { organizationId: 7 });
        return [];
      },
    },
  } as unknown as PrismaClient;

  const context = await createContext(prisma)({
    req: {
      headers: {
        cookie: await createTestSessionCookie("1"),
        "x-parcelis-organization-slug": "selected-organization",
      },
    },
  });

  const caller = appRouter.createCaller(context);

  assert.deepEqual(await caller.apiTokens.list({}), {
    items: [],
    nextCursor: null,
  });
});

test("a signed-in user without organization access cannot manage tokens", async () => {
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 1,
        role: "property_manager",
        accountStatus: "active",
        passwordChangedAt: null,
        defaultOrganizationId: 7,
      }),
    },
    organizationMembership: { findFirst: async () => null },
  } as unknown as PrismaClient;
  const context = await createContext(prisma)({
    req: { headers: { cookie: await createTestSessionCookie("1") } },
  });
  const caller = appRouter.createCaller(context);

  await assert.rejects(caller.apiTokens.list({}), { code: "FORBIDDEN" });
  await assert.rejects(caller.apiTokens.create({ name: "Bruno" }), { code: "FORBIDDEN" });
  await assert.rejects(caller.apiTokens.revoke({ id: "cjld2cjxh0000qzrmn831i7rn" }), { code: "FORBIDDEN" });
});

for (const accountStatus of ["pending", "disabled"] as const) {
  test(`${accountStatus} accounts cannot manage API tokens with an existing cookie`, async () => {
    const prisma = {
      user: {
        findUnique: async () => ({
          id: 1,
          role: "administrator",
          accountStatus,
          passwordChangedAt: null,
          defaultOrganizationId: 7,
        }),
      },
    } as unknown as PrismaClient;
    const context = await createContext(prisma)({
      req: { headers: { cookie: await createTestSessionCookie("1") } },
    });
    const caller = appRouter.createCaller(context);

    await assert.rejects(caller.apiTokens.list({}), { code: "UNAUTHORIZED" });
    await assert.rejects(caller.apiTokens.create({ name: "Bruno" }), { code: "UNAUTHORIZED" });
    await assert.rejects(caller.apiTokens.revoke({ id: "cjld2cjxh0000qzrmn831i7rn" }), { code: "UNAUTHORIZED" });
  });
}

test("bearer-only HTTP requests cannot manage API tokens", async () => {
  const requests = [
    new Request("http://localhost/trpc/apiTokens.list?input=%7B%7D", {
      headers: { authorization: `Bearer pcls_api_${"A".repeat(43)}` },
    }),
    ...(
      [
        ["create", { name: "Bruno" }],
        ["revoke", { id: "cjld2cjxh0000qzrmn831i7rn" }],
      ] as const
    ).map(
      ([procedure, input]) =>
        new Request(`http://localhost/trpc/apiTokens.${procedure}`, {
          method: "POST",
          headers: {
            authorization: `Bearer pcls_api_${"A".repeat(43)}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(input),
        }),
    ),
  ];

  for (const request of requests) {
    const response = await fetchRequestHandler({
      endpoint: "/trpc",
      req: request,
      router: appRouter,
      createContext: createFetchContext({} as PrismaClient, request),
    });

    assert.equal(response.status, 401, request.url);
  }
});
