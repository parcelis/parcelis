import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@parcelis/db";
import { hashSessionToken } from "../../modules/auth";
import type { PrismaService } from "../../modules/prisma.service";
import { getSessionStatus, readSession, renewSession } from "../../modules/session";

const now = new Date("2026-09-30T12:00:00Z");
const minute = 60_000;

function fixture(lastSeenAt = new Date(now.getTime() - minute)) {
  const session = {
    id: 1,
    tokenHash: hashSessionToken("test-token"),
    lastSeenAt,
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * minute),
    revokedAt: null as Date | null,
    user: { accountStatus: "active" },
  };
  let writes = 0;
  function matches(where: Prisma.SessionWhereInput) {
    const expiresAt = where.expiresAt as { gt: Date };
    const lastSeenAt = where.lastSeenAt as { gt: Date } | undefined;
    const throttle = (where.AND as { lastSeenAt: { lte: Date } } | undefined)?.lastSeenAt;
    return (
      (!where.tokenHash || where.tokenHash === session.tokenHash) &&
      session.expiresAt > expiresAt.gt &&
      !session.revokedAt &&
      session.user.accountStatus === "active" &&
      (!lastSeenAt || session.lastSeenAt > lastSeenAt.gt) &&
      (!throttle || session.lastSeenAt <= throttle.lte)
    );
  }
  const prisma = {
    session: {
      findFirst: async ({ where }: { where: Prisma.SessionWhereInput }) => matches(where) ? { ...session } : null,
      updateMany: async ({ where, data }: { where: Prisma.SessionWhereInput; data: { lastSeenAt: Date } }) => {
        if (!matches(where)) return { count: 0 };
        writes++;
        session.lastSeenAt = data.lastSeenAt;
        return { count: 1 };
      },
    },
  };
  let cleared = false;
  const request = { headers: { cookie: "parcelis_session_v2=test-token" } };
  const response = { clearCookie: () => { cleared = true; } };
  return {
    session,
    prisma: prisma as unknown as PrismaService,
    read: () => readSession(prisma as unknown as PrismaService, request as never, response as never),
    writes: () => writes,
    cleared: () => cleared,
  };
}

for (const elapsed of [15 * minute - 1, 15 * minute, 15 * minute + 1]) {
  test(`idle boundary after ${elapsed} milliseconds`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now });
    const state = fixture(new Date(now.getTime() - elapsed));
    assert.equal(Boolean(await state.read()), elapsed < 15 * minute);
    assert.equal(state.cleared(), elapsed >= 15 * minute);
    assert.equal(state.writes(), 0);
  });
}

test("reads never renew; activity is throttled and preserves the absolute cap", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const state = fixture();
  const absolute = state.session.expiresAt;
  await state.read();
  assert.equal(state.writes(), 0);
  const status = await renewSession(state.prisma, 1);
  assert.equal(status?.expiresAt, now.getTime() + 15 * minute);
  await Promise.all([renewSession(state.prisma, 1), renewSession(state.prisma, 1)]);
  assert.equal(state.writes(), 1);
  assert.equal(state.session.expiresAt, absolute);
  state.session.expiresAt = new Date(now.getTime() + minute);
  assert.equal(getSessionStatus(state.session).expiresAt, now.getTime() + minute);
});

test("delayed renewal cannot move the activity timestamp backward", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const state = fixture();
  await renewSession(state.prisma, 1);
  await renewSession(state.prisma, 1, new Date(now.getTime() - 2 * minute));
  assert.equal(state.session.lastSeenAt.getTime(), now.getTime());
  assert.equal(state.writes(), 1);
});

for (const invalid of ["idle", "absolute", "revoked", "disabled"] as const) {
  test(`renewal cannot revive a ${invalid} session, including after validation`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now });
    const state = fixture();
    assert.ok(await state.read());
    if (invalid === "idle") state.session.lastSeenAt = new Date(now.getTime() - 15 * minute);
    if (invalid === "absolute") state.session.expiresAt = now;
    if (invalid === "revoked") state.session.revokedAt = now;
    if (invalid === "disabled") state.session.user.accountStatus = "disabled";
    assert.equal(await renewSession(state.prisma, 1), null);
    assert.equal(state.writes(), 0);
  });
}

test("disabling idle expiration preserves absolute expiration, revocation, and account checks", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const previous = process.env.SESSION_IDLE_TIMEOUT_ENABLED;
  process.env.SESSION_IDLE_TIMEOUT_ENABLED = "false";
  t.after(() => {
    if (previous === undefined) delete process.env.SESSION_IDLE_TIMEOUT_ENABLED;
    else process.env.SESSION_IDLE_TIMEOUT_ENABLED = previous;
  });
  const state = fixture(new Date(now.getTime() - 60 * minute));
  assert.ok(await state.read());
  assert.equal(getSessionStatus(state.session).idleTimeoutEnabled, false);
  assert.equal(getSessionStatus(state.session).expiresAt, state.session.expiresAt.getTime());
  state.session.revokedAt = now;
  assert.equal(await state.read(), null);
  state.session.revokedAt = null;
  state.session.user.accountStatus = "disabled";
  assert.equal(await state.read(), null);
  state.session.user.accountStatus = "active";
  state.session.expiresAt = now;
  assert.equal(await state.read(), null);
});

test("legacy cookies cannot authenticate after rollout", async () => {
  const state = fixture();
  assert.equal(await readSession(state.prisma, { headers: { cookie: "parcelis_session=test-token" } } as never, {} as never), null);
});
