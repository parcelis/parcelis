import assert from "node:assert/strict";
import test from "node:test";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

function createCaller(prisma: unknown) {
  return appRouter.createCaller({
    prisma,
    session: { user: { id: 1, role: "administrator" } },
    organization: { organizationId: 7 },
  } as unknown as Context);
}

test("authorized retry records one immediate activation request for a due lease", async () => {
  let payload: unknown;
  let idempotencyKey = "";
  const tx = {
    lease: {
      findFirst: async ({ where }: { where: { id: number; organizationId: number } }) => {
        assert.deepEqual(where, { id: 9, organizationId: 7 });
        return {
          id: 9,
          status: "scheduled",
          startsOn: new Date(Date.now() - 2 * 86_400_000),
          organization: { timeZone: "UTC" },
        };
      },
    },
    outboxEvent: {
      createMany: async ({ data }: { data: { payload: unknown; idempotencyKey: string } }) => {
        payload = data.payload;
        idempotencyKey = data.idempotencyKey;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({
        id: 41,
        status: "pending",
        eventType: "lease.activate",
        schemaVersion: 1,
        payload,
      }),
    },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });
  assert.deepEqual(await caller.leases.retryActivation({ id: 9 }), { id: 41, status: "pending" });
  assert.match(idempotencyKey, /^lease:9:activate:retry:\d+$/);
  const retryMinute = Number(idempotencyKey.split(":").at(-1));
  assert.deepEqual(payload, {
    organizationId: 7,
    leaseId: 9,
    activateAt: new Date(retryMinute * 60_000).toISOString(),
  });
});

test("retry rejects a lease whose local start date has not arrived", async () => {
  const tx = {
    lease: {
      findFirst: async () => ({
        id: 9,
        status: "scheduled",
        startsOn: new Date(Date.now() + 2 * 86_400_000),
        organization: { timeZone: "UTC" },
      }),
    },
    outboxEvent: { createMany: async () => assert.fail("Future lease must not be queued") },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });
  await assert.rejects(caller.leases.retryActivation({ id: 9 }), { code: "BAD_REQUEST" });
});

test("authorized retry records an expiration job for an overdue fixed-term lease", async () => {
  let payload: unknown;
  const tx = {
    lease: {
      findFirst: async () => ({
        id: 9,
        status: "active",
        termType: "fixed",
        continueMonthToMonthAfterEnd: false,
        endsOn: new Date(Date.now() - 2 * 86_400_000),
        organization: { timeZone: "UTC" },
      }),
    },
    outboxEvent: {
      createMany: async ({ data }: { data: { eventType: string; payload: unknown; idempotencyKey: string } }) => {
        assert.equal(data.eventType, "lease.expire");
        assert.match(data.idempotencyKey, /^lease:9:expire:retry:\d+$/);
        payload = data.payload;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({
        id: 42,
        status: "pending",
        eventType: "lease.expire",
        schemaVersion: 1,
        payload,
      }),
    },
  };
  const caller = createCaller({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });
  assert.deepEqual(await caller.leases.retryExpiration({ id: 9 }), { id: 42, status: "pending" });
  assert.deepEqual(payload, { organizationId: 7, leaseId: 9 });
});

test("lease activity is read only within the active organization", async () => {
  const prisma = {
    lease: {
      findFirst: async ({ where }: { where: { id: number; organizationId: number } }) => {
        assert.deepEqual(where, { id: 9, organizationId: 7 });
        return { id: 9, status: "active", startsOn: new Date("2026-10-01") };
      },
    },
    activityEvent: {
      findMany: async ({ where }: { where: { organizationId: number; subjectType: string; subjectId: number } }) => {
        assert.deepEqual(where, { organizationId: 7, subjectType: "lease", subjectId: 9 });
        return [{ id: 4, action: "lease.activated" }];
      },
    },
  };
  const caller = createCaller(prisma);
  assert.deepEqual(await caller.leases.lifecycleEvents({ id: 9 }), [{ id: 4, action: "lease.activated" }]);
});

test("the general activity list excludes lease events", async () => {
  const caller = createCaller({
    activityEvent: {
      findMany: async ({ where }: { where: { subjectType: unknown } }) => {
        assert.deepEqual(where.subjectType, { not: "lease" });
        return [];
      },
    },
  });
  assert.deepEqual(await caller.activityEvents.list({}), []);
});

for (const status of ["active", "notice"] as const) {
  test(`${status} lease does not infer a start when activation is outside the latest 20 events`, async () => {
    const events = Array.from({ length: 20 }, (_, index) => ({
      id: 100 - index,
      action: "lease.expiration_failed",
      metadata: { message: "Needs attention" },
      createdAt: new Date("2026-10-10T12:00:00Z"),
      actorLabel: null,
    }));
    const caller = createCaller({
      lease: {
        findFirst: async () => ({ id: 9, status, startsOn: new Date("2026-10-01") }),
      },
      activityEvent: {
        findMany: async ({ take }: { take: number }) => {
          assert.equal(take, 20);
          return events;
        },
        findFirst: async ({ where }: { where: unknown }) => {
          assert.deepEqual(where, {
            organizationId: 7,
            subjectType: "lease",
            subjectId: 9,
            action: "lease.activated",
          });
          return { id: 1 };
        },
      },
    });
    assert.deepEqual(await caller.leases.lifecycleEvents({ id: 9 }), events);
  });

  test(`${status} lease with no activation log has an inferred start without a fabricated timestamp`, async () => {
    const finalized = {
      id: 4,
      action: "lease.finalized",
      metadata: {},
      createdAt: new Date("2026-09-20T12:00:00Z"),
      actorLabel: null,
    };
    const caller = createCaller({
      lease: {
        findFirst: async () => ({ id: 9, status, startsOn: new Date("2026-10-01") }),
      },
      activityEvent: {
        findMany: async () => [finalized],
        findFirst: async () => null,
      },
    });
    assert.deepEqual(await caller.leases.lifecycleEvents({ id: 9 }), [
      finalized,
      {
        id: -1,
        action: "lease.activated",
        metadata: { startsOn: "2026-10-01" },
        createdAt: null,
        actorLabel: null,
      },
    ]);
  });
}

for (const status of ["draft", "scheduled", "ended"] as const) {
  test(`${status} lease does not get an inferred start`, async () => {
    const caller = createCaller({
      lease: {
        findFirst: async () => ({ id: 9, status, startsOn: new Date("2026-10-01") }),
      },
      activityEvent: { findMany: async () => [] },
    });
    assert.deepEqual(await caller.leases.lifecycleEvents({ id: 9 }), []);
  });
}
