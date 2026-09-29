import assert from "node:assert/strict";
import test from "node:test";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

function createCaller(prisma: unknown, role: string) {
  return appRouter.createCaller({
    prisma,
    session: { user: { id: 1, role } },
    organization: { organizationId: 7 },
  } as unknown as Context);
}

test("only application administrators can list failed outbox events", async () => {
  let queried = false;
  const caller = createCaller(
    {
      outboxEvent: {
        findMany: async ({ where, take }: { where: unknown; take: number }) => {
          queried = true;
          assert.deepEqual(where, { organizationId: 7, status: "failed" });
          assert.equal(take, 50);
          return [];
        },
      },
    },
    "administrator",
  );

  assert.deepEqual(await caller.outboxEvents.failed({}), []);
  assert.equal(queried, true);

  const unauthorizedCaller = createCaller({}, "property_manager");
  await assert.rejects(unauthorizedCaller.outboxEvents.failed({}), { code: "FORBIDDEN" });
});

test("only application administrators can replay a failed event in the active organization", async () => {
  const startedAt = Date.now();
  let updated = false;
  const caller = createCaller(
    {
      outboxEvent: {
        updateMany: async ({ where, data }: { where: unknown; data: Record<string, unknown> }) => {
          assert.deepEqual(where, { id: 21, organizationId: 7, status: "failed" });
          assert.equal(data.status, "pending");
          assert.equal(data.failedAt, null);
          assert.equal(data.lockedUntil, null);
          assert.equal(data.claimToken, null);
          assert.ok(data.availableAt instanceof Date);
          assert.ok(data.availableAt.getTime() >= startedAt);
          assert.ok(data.availableAt.getTime() <= Date.now());
          updated = true;
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({ id: 21, organizationId: 7, status: "pending" }),
      },
    },
    "administrator",
  );

  const result = await caller.outboxEvents.replay({ id: 21 });
  assert.deepEqual(result, { id: 21, organizationId: 7, status: "pending" });
  assert.equal(updated, true);

  const unauthorizedCaller = createCaller({}, "property_manager");
  await assert.rejects(unauthorizedCaller.outboxEvents.replay({ id: 21 }), { code: "FORBIDDEN" });
});

test("replay returns NOT_FOUND when no failed event belongs to the active organization", async () => {
  const caller = createCaller(
    {
      outboxEvent: {
        updateMany: async ({ where }: { where: unknown }) => {
          assert.deepEqual(where, { id: 21, organizationId: 7, status: "failed" });
          return { count: 0 };
        },
        findUniqueOrThrow: async () => assert.fail("Unmatched events must not be retrieved"),
      },
    },
    "administrator",
  );
  await assert.rejects(caller.outboxEvents.replay({ id: 21 }), { code: "NOT_FOUND" });
});

for (const kind of ["password-reset", "email-verification"]) {
  test(`failed-event listing and replay do not expose ${kind} bearer links`, async () => {
    const token = `secret-${kind}-token`;
    const link = `https://parcelis.example.com/auth?token=${token}`;
    const payload = {
      organizationId: 7,
      recipientId: 12,
      recipientType: "user",
      email: "person@example.com",
      subject: kind,
      body: `Follow this link: ${link}`,
    };
    const event: Record<string, unknown> = {
      id: 21,
      organizationId: 7,
      status: "failed",
      eventType: "notification.email",
      schemaVersion: 1,
      payload,
      idempotencyKey: `${kind}:12:token:123`,
      attemptCount: 3,
      lastAttemptAt: new Date(),
      failedAt: new Date(),
      lastError: `Invalid payload: ${JSON.stringify(payload)}`,
      createdAt: new Date(),
    };
    const caller = createCaller(
      {
        outboxEvent: {
          findMany: async ({ select }: { select: Record<string, boolean> }) => {
            assert.equal(select.payload, undefined);
            assert.equal(select.lastError, undefined);
            return [Object.fromEntries(Object.keys(select).map((key) => [key, event[key]]))];
          },
          updateMany: async ({ data }: { data: Record<string, unknown> }) => {
            Object.assign(event, data);
            return { count: 1 };
          },
          findUniqueOrThrow: async () => event,
        },
      },
      "administrator",
    );

    const failed = await caller.outboxEvents.failed({});
    assert.equal(failed[0]?.id, 21);
    assert.equal(failed[0]?.attemptCount, 3);
    const replayed = await caller.outboxEvents.replay({ id: 21 });
    assert.deepEqual(replayed, { id: 21, organizationId: 7, status: "pending" });
    for (const response of [failed, replayed]) {
      assert.equal(JSON.stringify(response).includes(token), false);
      assert.equal(JSON.stringify(response).includes("person@example.com"), false);
    }
    assert.deepEqual(event.payload, payload);
    assert.equal(event.status, "pending");
  });
}
