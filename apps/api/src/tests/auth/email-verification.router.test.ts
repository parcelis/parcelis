import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { TRPCError } from "@trpc/server";
import { getEmailTransporter } from "@parcelis/email";
import { hashEmailVerificationToken, hashPassword } from "../../modules/auth";
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

function createPrisma() {
  const users: User[] = [];
  const tokens: VerificationToken[] = [];
  const sessions: Array<{ userId: number }> = [];
  let nextUserId = 1;
  let nextTokenId = 1;

  const prisma: PrismaService = {
    user: {
      create: async ({ data }: { data: Omit<User, "id"> }) => {
        const user = { ...data, id: nextUserId++ };
        users.push(user);
        return user;
      },
      findUnique: async ({ where }: { where: { email?: string; id?: number } }) =>
        users.find((user) => user.email === where.email || user.id === where.id) ?? null,
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
      create: async () => ({ id: 1 }),
    },
    organizationMembership: {
      create: async () => ({}),
    },
    emailVerificationToken: {
      create: async ({ data }: { data: Omit<VerificationToken, "id" | "usedAt"> }) => {
        const token = { ...data, id: nextTokenId++, usedAt: null };
        tokens.push(token);
        return token;
      },
      deleteMany: async ({ where }: { where: { userId: number } }) => {
        const removed = tokens.filter((token) => token.userId === where.userId).length;
        for (let index = tokens.length - 1; index >= 0; index -= 1) {
          if (tokens[index]?.userId === where.userId) tokens.splice(index, 1);
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
    session: {
      create: async ({ data }: { data: { userId: number } }) => {
        sessions.push({ userId: data.userId });
        return {};
      },
    },
    $transaction: async <T>(callback: (tx: PrismaService) => Promise<T>) => callback(prisma),
  } as unknown as PrismaService;

  return { prisma, sessions, tokens, users };
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
  process.env.EMAIL_FROM = "Parcelis <no-reply@example.com>";
  process.env.SMTP_HOST = "localhost";
  process.env.SMTP_PORT = "1";
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_USER = "test";
  process.env.SMTP_PASSWORD = "test";
  return mock.method(getEmailTransporter(), "sendMail", async () => ({ messageId: "test" }) as never);
}

test("registration creates a pending account and one verification token without a session", async (t) => {
  mockEmailDelivery();
  t.after(() => mock.restoreAll());
  const state = createPrisma();
  const caller = createCaller(state.prisma);

  await caller.auth.register({ email: "new@example.com", password: "password-for-new-user" });

  assert.equal(state.users[0]?.accountStatus, "pending");
  assert.equal(state.tokens.length, 1);
  assert.notEqual(state.tokens[0]?.tokenHash, "new@example.com");
  assert.equal(state.sessions.length, 0);
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
  assert.ok(state.tokens[0]?.usedAt);
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

test("resending verification replaces prior tokens for pending accounts", async (t) => {
  mockEmailDelivery();
  t.after(() => mock.restoreAll());
  const state = createPrisma();
  const user = await state.prisma.user.create({
    data: {
      name: "Pending User",
      email: "resend@example.com",
      phone: null,
      passwordHash: await hashPassword("password-for-new-user"),
      role: "property_manager",
      accountStatus: "pending",
      defaultOrganizationId: null,
    },
  });
  await state.prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash: "old-token", expiresAt: new Date(Date.now() + 60_000) },
  });

  await createCaller(state.prisma).auth.requestEmailVerification({ email: user.email });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(state.tokens.length, 1);
  assert.notEqual(state.tokens[0]?.tokenHash, "old-token");
});

test("resending verification does not reveal whether an account exists", async (t) => {
  mockEmailDelivery();
  t.after(() => mock.restoreAll());
  const state = createPrisma();

  const response = await createCaller(state.prisma).auth.requestEmailVerification({ email: "missing@example.com" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(response, { success: true });
  assert.equal(state.tokens.length, 0);
});

test("authorized user creation creates a pending account and verification token", async (t) => {
  mockEmailDelivery();
  t.after(() => mock.restoreAll());
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
});
