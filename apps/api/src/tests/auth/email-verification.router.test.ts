import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { TRPCError } from "@trpc/server";
import { getEmailTransporter, resetEmailTransporter } from "@parcelis/email";
import { hashEmailVerificationToken, hashPassword, hashPasswordResetToken } from "../../modules/auth";
import { resetRateLimits } from "../../modules/login-rate-limit";
import type { PrismaService } from "../../modules/prisma.service";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

type User = {
  accountStatus: "active" | "disabled" | "pending";
  defaultOrganizationId: number | null;
  email: string;
  id: number;
  name: string;
  passwordHash: string;
  phone: string | null;
  role: "administrator" | "property_manager";
};

type VerificationToken = {
  expiresAt: Date;
  id: number;
  tokenHash: string;
  usedAt: Date | null;
  userId: number;
};

type PasswordResetToken = {
  expiresAt: Date;
  id: number;
  tokenHash: string;
  usedAt: Date | null;
  userId: number;
};

type OrganizationMembership = {
  organizationId: number;
  role?: string;
  userId: number;
};

type OutboxEvent = {
  availableAt: Date;
  eventType: string;
  id: number;
  idempotencyKey: string;
  organizationId: number;
  payload: unknown;
  schemaVersion: number;
};

type NotificationDelivery = {
  channel: "email";
  destination: string;
  id: number;
  idempotencyKey: string;
  organizationId: number;
  outboxEventId: number;
  recipientId: number;
  recipientType: string;
  status: "queued";
  subject: string;
};

test.beforeEach(() => {
  resetRateLimits();
});

function createPrisma() {
  const users: User[] = [];
  const tokens: VerificationToken[] = [];
  const passwordResetTokens: PasswordResetToken[] = [];
  const sessions: Array<{ userId: number }> = [];
  const organizationMemberships: OrganizationMembership[] = [];
  const outboxEvents: OutboxEvent[] = [];
  const notificationDeliveries: NotificationDelivery[] = [];
  const transactions: Promise<unknown>[] = [];
  let nextUserId = 1;
  let nextTokenId = 1;
  let nextOrganizationId = 1;
  let nextOutboxEventId = 1;
  let nextNotificationDeliveryId = 1;

  const prisma: PrismaService = {
    user: {
      create: async ({ data }: { data: Omit<User, "id"> }) => {
        const user = { ...data, id: nextUserId++ };
        users.push(user);
        return user;
      },
      findUnique: async ({ where }: { where: { email?: string; id?: number } }) =>
        users.find(
          (user) =>
            (where.email === undefined || user.email === where.email) &&
            (where.id === undefined || user.id === where.id),
        ) ?? null,
      update: async ({ where, data }: { where: { id: number }; data: Partial<User> }) => {
        const user = users.find((candidate) => candidate.id === where.id);
        if (!user) throw new Error("User not found.");
        Object.assign(user, data);
        return user;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: number; accountStatus: User["accountStatus"] };
        data: Partial<User>;
      }) => {
        const user = users.find(
          (candidate) => candidate.id === where.id && candidate.accountStatus === where.accountStatus,
        );
        if (!user) return { count: 0 };
        Object.assign(user, data);
        return { count: 1 };
      },
    },
    organization: {
      create: async () => ({ id: nextOrganizationId++ }),
    },
    organizationMembership: {
      create: async ({ data }: { data: OrganizationMembership }) => {
        organizationMemberships.push(data);
        return data;
      },
      findUnique: async ({ where }: { where: { userId_organizationId: { organizationId: number; userId: number } } }) =>
        organizationMemberships.find(
          (membership) =>
            membership.userId === where.userId_organizationId.userId &&
            membership.organizationId === where.userId_organizationId.organizationId,
        ) ?? null,
    },
    organizationEmailSettings: {
      findUnique: async () => null,
    },
    emailVerificationToken: {
      create: async ({ data }: { data: Omit<VerificationToken, "id" | "usedAt"> }) => {
        const token = { ...data, id: nextTokenId++, usedAt: null };
        tokens.push(token);
        return token;
      },
      deleteMany: async ({
        where,
      }: {
        where: {
          OR?: Array<{ expiresAt?: { lte: Date }; usedAt?: { not: null } }>;
          userId: number;
        };
      }) => {
        const matches = (token: VerificationToken) =>
          token.userId === where.userId &&
          (!where.OR ||
            where.OR.some(
              (condition) =>
                (condition.expiresAt?.lte !== undefined && token.expiresAt <= condition.expiresAt.lte) ||
                (condition.usedAt?.not !== undefined && token.usedAt !== null),
            ));
        const removed = tokens.filter(matches).length;
        for (let index = tokens.length - 1; index >= 0; index -= 1) {
          const token = tokens[index];
          if (token && matches(token)) tokens.splice(index, 1);
        }
        return { count: removed };
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const token = tokens.find((candidate) => candidate.tokenHash === where.tokenHash);
        if (!token) return null;
        const user = users.find((candidate) => candidate.id === token.userId);
        return user ? { ...token, user: { accountStatus: user.accountStatus } } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { expiresAt: { gt: Date }; id: number; usedAt: null };
        data: { usedAt: Date };
      }) => {
        const token = tokens.find(
          (candidate) =>
            candidate.id === where.id && candidate.usedAt === null && candidate.expiresAt > where.expiresAt.gt,
        );
        if (!token) return { count: 0 };
        token.usedAt = data.usedAt;
        return { count: 1 };
      },
    },
    passwordResetToken: {
      create: async ({ data }: { data: Omit<PasswordResetToken, "id" | "usedAt"> }) => {
        const token = { ...data, id: nextTokenId++, usedAt: null };
        passwordResetTokens.push(token);
        return token;
      },
      deleteMany: async ({ where }: { where: { userId: number } }) => {
        const removed = passwordResetTokens.filter((token) => token.userId === where.userId).length;
        for (let index = passwordResetTokens.length - 1; index >= 0; index -= 1) {
          const token = passwordResetTokens[index];
          if (token && token.userId === where.userId) {
            passwordResetTokens.splice(index, 1);
          }
        }
        return { count: removed };
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const token = passwordResetTokens.find((candidate) => candidate.tokenHash === where.tokenHash);
        if (!token) return null;
        const user = users.find((candidate) => candidate.id === token.userId);
        return user ? { ...token, user: { accountStatus: user.accountStatus } } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { expiresAt: { gt: Date }; id: number; usedAt: null };
        data: { usedAt: Date };
      }) => {
        const token = passwordResetTokens.find(
          (candidate) =>
            candidate.id === where.id && candidate.usedAt === null && candidate.expiresAt > where.expiresAt.gt,
        );
        if (!token) return { count: 0 };
        token.usedAt = data.usedAt;
        return { count: 1 };
      },
    },
    session: {
      create: async ({ data }: { data: { userId: number } }) => {
        sessions.push({ userId: data.userId });
        return {};
      },
      updateMany: async () => ({ count: 1 }),
    },
    outboxEvent: {
      createMany: async ({ data }: { data: Omit<OutboxEvent, "id"> }) => {
        const duplicate = outboxEvents.some(
          (event) => event.organizationId === data.organizationId && event.idempotencyKey === data.idempotencyKey,
        );
        if (!duplicate) {
          outboxEvents.push({ ...data, id: nextOutboxEventId++ });
          return { count: 1 };
        }
        return { count: 0 };
      },
      findUniqueOrThrow: async ({
        where,
      }: {
        where: { organizationId_idempotencyKey: { idempotencyKey: string; organizationId: number } };
      }) => {
        const event = outboxEvents.find(
          (candidate) =>
            candidate.organizationId === where.organizationId_idempotencyKey.organizationId &&
            candidate.idempotencyKey === where.organizationId_idempotencyKey.idempotencyKey,
        );
        if (!event) throw new Error("Outbox event not found.");
        return event;
      },
    },
    notificationDelivery: {
      createMany: async ({ data }: { data: Omit<NotificationDelivery, "id"> }) => {
        const duplicate = notificationDeliveries.some((delivery) => delivery.outboxEventId === data.outboxEventId);
        if (!duplicate) {
          notificationDeliveries.push({ ...data, id: nextNotificationDeliveryId++ });
          return { count: 1 };
        }
        return { count: 0 };
      },
      findUniqueOrThrow: async ({ where }: { where: { outboxEventId: number } }) => {
        const delivery = notificationDeliveries.find((candidate) => candidate.outboxEventId === where.outboxEventId);
        if (!delivery) throw new Error("Notification delivery not found.");
        return delivery;
      },
    },
    $transaction: <T>(callback: (tx: PrismaService) => Promise<T>) => {
      const transaction = callback(prisma);
      transactions.push(transaction);
      return transaction;
    },
  } as unknown as PrismaService;

  return {
    organizationMemberships,
    outboxEvents,
    passwordResetTokens,
    prisma,
    sessions,
    tokens,
    users,
    waitForTransaction: async () => {
      const transaction = transactions.at(-1);
      assert.ok(transaction, "Expected a background transaction");
      await transaction;
    },
  };
}

function createCaller(prisma: PrismaService) {
  return appRouter.createCaller({ prisma, req: { ip: "127.0.0.1" }, res: { cookie: () => {} } } as unknown as Context);
}

function createAdministratorCaller(prisma: PrismaService) {
  const user = {
    id: 99,
    name: "Administrator",
    email: "administrator@example.com",
    phone: null,
    profileImageObjectKey: null,
    role: "administrator" as const,
    accountStatus: "active" as const,
    defaultOrganizationId: 1,
  };
  return appRouter.createCaller({
    prisma,
    req: { ip: "127.0.0.1" },
    res: {},
    session: { id: 1, userId: user.id, user },
    organization: { organizationId: 1, role: "administrator", organization: { id: 1 } },
  } as unknown as Context);
}

function mockEmailDelivery() {
  const messages: Array<{ html?: string; to?: string }> = [];
  let resolveSent: (() => void) | undefined;
  const sent = new Promise<void>((resolve) => {
    resolveSent = resolve;
  });
  const previousEnvironment = Object.fromEntries(
    ["EMAIL_FROM", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD"].map((name) => [
      name,
      process.env[name],
    ]),
  );
  process.env.EMAIL_FROM = "Parcelis <no-reply@example.com>";
  process.env.SMTP_HOST = "localhost";
  process.env.SMTP_PORT = "1";
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_USER = "test";
  process.env.SMTP_PASSWORD = "test";
  mock.method(getEmailTransporter(), "sendMail", async (message: unknown) => {
    messages.push(message as { html?: string; to?: string });
    resolveSent?.();
    return { messageId: "test" } as never;
  });
  return {
    messages,
    sent,
    restore() {
      for (const [name, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    },
  };
}

test("registration creates a pending account and one verification token without a session", async (t) => {
  const emailDelivery = mockEmailDelivery();
  t.after(() => {
    mock.restoreAll();
    emailDelivery.restore();
    resetEmailTransporter();
  });
  const state = createPrisma();
  const caller = createCaller(state.prisma);

  await caller.auth.register({ email: "new@example.com", password: "password-for-new-user" });

  assert.equal(state.users[0]?.accountStatus, "pending");
  assert.equal(state.tokens.length, 1);
  assert.notEqual(state.tokens[0]?.tokenHash, "new@example.com");
  assert.equal(state.sessions.length, 0);
  assert.equal(emailDelivery.messages.length, 0);
  assert.equal(state.outboxEvents.length, 1);
  assert.equal(state.outboxEvents[0]?.eventType, "notification.email");
  assert.match(state.outboxEvents[0]?.idempotencyKey ?? "", /auth\.register/);
  const payload = state.outboxEvents[0]?.payload as { body: string; email: string };
  assert.equal(payload.email, "new@example.com");
  assert.match(payload.body, /mode=verify/);
});

test("verification activates a pending account and consumes its token", async () => {
  const state = createPrisma();
  const passwordHash = await hashPassword("password-for-new-user");
  const user = await state.prisma.user.create({
    data: {
      name: "Pending User",
      email: "pending@example.com",
      phone: null,
      passwordHash,
      role: "property_manager",
      accountStatus: "pending",
      defaultOrganizationId: null,
    },
  });
  const token = "a".repeat(43);
  await state.prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash: hashEmailVerificationToken(token), expiresAt: new Date(Date.now() + 60_000) },
  });

  await createCaller(state.prisma).auth.verifyEmail({ token });

  assert.equal(state.users[0]?.accountStatus, "active");
  assert.equal(state.tokens.length, 0);
  await assert.rejects(
    createCaller(state.prisma).auth.verifyEmail({ token }),
    (error: unknown) => error instanceof TRPCError && error.code === "BAD_REQUEST",
  );
});

test("pending accounts cannot sign in", async () => {
  const state = createPrisma();
  const password = "password-for-new-user";
  await state.prisma.user.create({
    data: {
      name: "Pending User",
      email: "pending-login@example.com",
      phone: null,
      passwordHash: await hashPassword(password),
      role: "property_manager",
      accountStatus: "pending",
      defaultOrganizationId: null,
    },
  });

  await assert.rejects(
    createCaller(state.prisma).auth.login({ email: "pending-login@example.com", password }),
    (error: unknown) => error instanceof TRPCError && error.message === "Please verify your email before signing in.",
  );
  assert.equal(state.sessions.length, 0);
});

test("active accounts can sign in", async () => {
  const state = createPrisma();
  const password = "password-for-active-user";
  await state.prisma.user.create({
    data: {
      name: "Active User",
      email: "active-login@example.com",
      phone: null,
      passwordHash: await hashPassword(password),
      role: "property_manager",
      accountStatus: "active",
      defaultOrganizationId: null,
    },
  });

  await createCaller(state.prisma).auth.login({ email: "active-login@example.com", password });

  assert.equal(state.sessions.length, 1);
});

test("invalid and expired verification tokens are rejected", async () => {
  const state = createPrisma();
  const user = await state.prisma.user.create({
    data: {
      name: "Pending User",
      email: "expired@example.com",
      phone: null,
      passwordHash: await hashPassword("password-for-new-user"),
      role: "property_manager",
      accountStatus: "pending",
      defaultOrganizationId: null,
    },
  });
  const expiredToken = "b".repeat(43);
  await state.prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashEmailVerificationToken(expiredToken),
      expiresAt: new Date(Date.now() - 60_000),
    },
  });

  await assert.rejects(
    createCaller(state.prisma).auth.verifyEmail({ token: "c".repeat(43) }),
    (error: unknown) => error instanceof TRPCError && error.code === "BAD_REQUEST",
  );
  await assert.rejects(
    createCaller(state.prisma).auth.verifyEmail({ token: expiredToken }),
    (error: unknown) => error instanceof TRPCError && error.code === "BAD_REQUEST",
  );
  assert.equal(state.users[0]?.accountStatus, "pending");
  assert.equal(state.tokens[0]?.usedAt, null);
});

test("resending verification preserves prior tokens for pending accounts", async (t) => {
  const emailDelivery = mockEmailDelivery();
  t.after(() => {
    mock.restoreAll();
    emailDelivery.restore();
    resetEmailTransporter();
  });
  const state = createPrisma();
  const user = await state.prisma.user.create({
    data: {
      name: "Pending User",
      email: "resend@example.com",
      phone: null,
      passwordHash: await hashPassword("password-for-new-user"),
      role: "property_manager",
      accountStatus: "pending",
      defaultOrganizationId: 1,
    },
  });
  await state.prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash: "old-token", expiresAt: new Date(Date.now() + 60_000) },
  });

  await createCaller(state.prisma).auth.requestEmailVerification({ email: user.email });
  await state.waitForTransaction();
  assert.equal(state.tokens.length, 2);
  assert.ok(state.tokens.some((token) => token.tokenHash === "old-token"));
  assert.ok(state.tokens.some((token) => token.tokenHash !== "old-token"));
  assert.equal(emailDelivery.messages.length, 0);
  assert.equal(state.outboxEvents.length, 1);
  assert.equal(state.outboxEvents[0]?.eventType, "notification.email");
  assert.equal(state.outboxEvents[0]?.organizationId, 1);
  assert.equal(state.outboxEvents[0]?.schemaVersion, 1);
  assert.match(state.outboxEvents[0]?.idempotencyKey ?? "", /auth\.request-email-verification/);
  const payload = state.outboxEvents[0]?.payload as { body: string; email: string };
  assert.equal(payload.email, user.email);
  assert.match(payload.body, /mode=verify/);
});

test("resending verification removes expired tokens", async (t) => {
  const emailDelivery = mockEmailDelivery();
  t.after(() => {
    mock.restoreAll();
    emailDelivery.restore();
    resetEmailTransporter();
  });
  const state = createPrisma();
  const user = await state.prisma.user.create({
    data: {
      name: "Pending User",
      email: "expired-resend@example.com",
      phone: null,
      passwordHash: await hashPassword("password-for-new-user"),
      role: "property_manager",
      accountStatus: "pending",
      defaultOrganizationId: 1,
    },
  });
  await state.prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash: "expired-token", expiresAt: new Date(Date.now() - 60_000) },
  });

  await createCaller(state.prisma).auth.requestEmailVerification({ email: user.email });
  await state.waitForTransaction();

  assert.equal(state.tokens.length, 1);
  assert.notEqual(state.tokens[0]?.tokenHash, "expired-token");
  assert.equal(emailDelivery.messages.length, 0);
  assert.equal(state.outboxEvents.length, 1);
});

test("resending verification does not reveal whether an account exists", async (t) => {
  const emailDelivery = mockEmailDelivery();
  t.after(() => {
    mock.restoreAll();
    emailDelivery.restore();
    resetEmailTransporter();
  });
  const state = createPrisma();

  const response = await createCaller(state.prisma).auth.requestEmailVerification({ email: "missing@example.com" });
  assert.deepEqual(response, { success: true });
  assert.equal(state.tokens.length, 0);
});

test("requesting email verification without a default organization sends email directly", async (t) => {
  const emailDelivery = mockEmailDelivery();
  t.after(() => {
    mock.restoreAll();
    emailDelivery.restore();
    resetEmailTransporter();
  });
  const state = createPrisma();
  const user = await state.prisma.user.create({
    data: {
      name: "Pending User",
      email: "no-org-verify@example.com",
      phone: null,
      passwordHash: await hashPassword("password-for-new-user"),
      role: "property_manager",
      accountStatus: "pending",
      defaultOrganizationId: null,
    },
  });

  const response = await createCaller(state.prisma).auth.requestEmailVerification({ email: user.email });
  await state.waitForTransaction();
  await emailDelivery.sent;

  assert.deepEqual(response, { success: true });
  assert.equal(state.tokens.length, 1);
  assert.equal(state.outboxEvents.length, 0);
  assert.equal(emailDelivery.messages.length, 1);
  assert.equal(emailDelivery.messages[0]?.to, user.email);
  assert.match(emailDelivery.messages[0]?.html ?? "", /Verify your Parcelis email/);
});

test("requesting password reset for active users creates one token and enqueues notification", async (t) => {
  const emailDelivery = mockEmailDelivery();
  t.after(() => {
    mock.restoreAll();
    emailDelivery.restore();
    resetEmailTransporter();
  });
  const state = createPrisma();
  const user = await state.prisma.user.create({
    data: {
      name: "Active User",
      email: "reset-active@example.com",
      phone: null,
      passwordHash: await hashPassword("password-for-active-user"),
      role: "property_manager",
      accountStatus: "active",
      defaultOrganizationId: 1,
    },
  });
  await state.prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashPasswordResetToken("old-token"),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  const response = await createCaller(state.prisma).auth.requestPasswordReset({ email: user.email });
  await state.waitForTransaction();

  assert.deepEqual(response, { success: true });
  assert.equal(emailDelivery.messages.length, 0);
  assert.equal(state.passwordResetTokens.length, 1);
  assert.notEqual(state.passwordResetTokens[0]?.tokenHash, hashPasswordResetToken("old-token"));
  assert.equal(state.outboxEvents.length, 1);
  assert.equal(state.outboxEvents[0]?.eventType, "notification.email");
  assert.match(state.outboxEvents[0]?.idempotencyKey ?? "", /auth\.request-password-reset/);
  const payload = state.outboxEvents[0]?.payload as { body: string; email: string };
  assert.equal(payload.email, user.email);
  assert.match(payload.body, /mode=reset/);
});

test("requesting password reset without a default organization sends email directly", async (t) => {
  const emailDelivery = mockEmailDelivery();
  t.after(() => {
    mock.restoreAll();
    emailDelivery.restore();
    resetEmailTransporter();
  });
  const state = createPrisma();
  const user = await state.prisma.user.create({
    data: {
      name: "Active User",
      email: "no-org-reset@example.com",
      phone: null,
      passwordHash: await hashPassword("password-for-active-user"),
      role: "property_manager",
      accountStatus: "active",
      defaultOrganizationId: null,
    },
  });

  const response = await createCaller(state.prisma).auth.requestPasswordReset({ email: user.email });
  await state.waitForTransaction();
  await emailDelivery.sent;

  assert.deepEqual(response, { success: true });
  assert.equal(state.passwordResetTokens.length, 1);
  assert.equal(state.outboxEvents.length, 0);
  assert.equal(emailDelivery.messages.length, 1);
  assert.equal(emailDelivery.messages[0]?.to, user.email);
  assert.match(emailDelivery.messages[0]?.html ?? "", /Reset your Parcelis password/);
});

test("requesting password reset does not reveal account existence", async (t) => {
  const emailDelivery = mockEmailDelivery();
  t.after(() => {
    mock.restoreAll();
    emailDelivery.restore();
    resetEmailTransporter();
  });
  const state = createPrisma();

  const response = await createCaller(state.prisma).auth.requestPasswordReset({ email: "missing-reset@example.com" });

  assert.deepEqual(response, { success: true });
  assert.equal(emailDelivery.messages.length, 0);
  assert.equal(state.passwordResetTokens.length, 0);
  assert.equal(state.outboxEvents.length, 0);
});

test("authorized user creation creates a pending account and verification token", async (t) => {
  const emailDelivery = mockEmailDelivery();
  t.after(() => {
    mock.restoreAll();
    emailDelivery.restore();
    resetEmailTransporter();
  });
  const state = createPrisma();

  await createAdministratorCaller(state.prisma).users.create({
    name: "Created User",
    email: "created@example.com",
    phone: null,
    password: "password-for-new-user",
    role: "property_manager",
  });

  assert.equal(state.users[0]?.accountStatus, "pending");
  assert.equal(state.tokens.length, 1);
  assert.equal(emailDelivery.messages.length, 0);
  assert.equal(state.outboxEvents.length, 1);
  assert.equal(state.outboxEvents[0]?.eventType, "notification.email");
  assert.match(state.outboxEvents[0]?.idempotencyKey ?? "", /users\.create/);
  const payload = state.outboxEvents[0]?.payload as { body: string; email: string };
  assert.equal(payload.email, "created@example.com");
  assert.match(payload.body, /mode=verify/);
});

test("pending users cannot have their email changed through profile updates", async () => {
  const state = createPrisma();
  const passwordHash = await hashPassword("password-for-pending-user");
  const user = await state.prisma.user.create({
    data: {
      name: "Pending User",
      email: "pending-profile@example.com",
      passwordHash,
      phone: null,
      role: "property_manager",
      accountStatus: "pending",
      defaultOrganizationId: 1,
    },
  });
  await state.prisma.organizationMembership.create({
    data: { userId: user.id, organizationId: 1 },
  });

  await assert.rejects(
    createAdministratorCaller(state.prisma).users.updateProfile({
      id: user.id,
      name: user.name,
      email: "changed@example.com",
      phone: null,
    }),
    (error: unknown) =>
      error instanceof TRPCError &&
      error.message === "A pending user's email address cannot be changed before verification.",
  );
  assert.equal(state.users[0]?.email, "pending-profile@example.com");
});

test("profile updates require membership in the current organization", async () => {
  const state = createPrisma();
  const user = await state.prisma.user.create({
    data: {
      name: "Other Organization User",
      email: "other-organization@example.com",
      passwordHash: await hashPassword("password-for-other-organization-user"),
      phone: null,
      role: "property_manager",
      accountStatus: "active",
      defaultOrganizationId: 2,
    },
  });
  await state.prisma.organizationMembership.create({
    data: { userId: user.id, organizationId: 2 },
  });

  await assert.rejects(
    createAdministratorCaller(state.prisma).users.updateProfile({
      id: user.id,
      name: user.name,
      phone: null,
    }),
    (error: unknown) => error instanceof TRPCError && error.code === "FORBIDDEN",
  );
});
