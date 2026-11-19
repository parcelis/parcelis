import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { appRouter } from "../../router/app.router";
import { hashPassword, hashPasswordResetToken, verifyPassword } from "../../modules/auth";
import { resetRateLimits } from "../../modules/login-rate-limit";

const fixturePassword = (label: string) => [label, "fixture", randomUUID()].join("-");

test("change password records the time used to invalidate existing JWTs", async () => {
  resetRateLimits();
  const currentPassword = fixturePassword("current");
  let update: { where: { id: number }; data: { passwordHash: string; passwordChangedAt: Date } } | undefined;
  const caller = appRouter.createCaller({
    prisma: {
      user: {
        findUnique: async () => ({ passwordHash: await hashPassword(currentPassword) }),
        update: async (args: typeof update) => {
          update = args;
          return {};
        },
      },
    },
    req: { headers: {}, ip: "127.0.0.1" },
    session: { userId: 7, user: { id: 7 } },
    organization: null,
  } as never);

  const newPassword = fixturePassword("new");

  await caller.auth.changePassword({
    currentPassword,
    newPassword,
    reenterPassword: newPassword,
  });

  assert.equal(update?.where.id, 7);
  assert.ok(update?.data.passwordChangedAt instanceof Date);
  assert.equal(await verifyPassword(update!.data.passwordHash, newPassword), true);
});

test("reset password records the time used to invalidate existing JWTs", async () => {
  const token = "A".repeat(43);
  let passwordUpdate: { passwordHash: string; passwordChangedAt: Date } | undefined;
  let tokenUsedAt: Date | undefined;
  const transaction = {
    passwordResetToken: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: number; usedAt: null; expiresAt: { gt: Date } };
        data: { usedAt: Date };
      }) => {
        assert.equal(where.id, 12);
        assert.equal(where.usedAt, null);
        assert.ok(where.expiresAt.gt instanceof Date);
        tokenUsedAt = data.usedAt;
        return { count: 1 };
      },
    },
    user: {
      updateMany: async ({ data }: { data: typeof passwordUpdate }) => {
        passwordUpdate = data;
        return { count: 1 };
      },
    },
  };
  const caller = appRouter.createCaller({
    prisma: {
      passwordResetToken: {
        findUnique: async ({ where }: { where: { tokenHash: string } }) => {
          assert.equal(where.tokenHash, hashPasswordResetToken(token));
          return {
            id: 12,
            userId: 7,
            expiresAt: new Date(Date.now() + 60_000),
            usedAt: null,
            user: { accountStatus: "active" },
          };
        },
      },
      $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
    },
    req: { headers: {} },
    session: null,
    organization: null,
  } as never);

  const resetPassword = fixturePassword("reset");

  await caller.auth.resetPassword({
    token,
    password: resetPassword,
    reenterPassword: resetPassword,
  });

  assert.ok(tokenUsedAt instanceof Date);
  assert.equal(passwordUpdate?.passwordChangedAt, tokenUsedAt);
  assert.equal(await verifyPassword(passwordUpdate!.passwordHash, resetPassword), true);
});
