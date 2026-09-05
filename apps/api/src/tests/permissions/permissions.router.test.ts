import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";
import type { PrismaService } from "../../modules/prisma.service";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

function createDeniedCaller() {
  const user = {
    id: 1,
    name: "Restricted User",
    email: "restricted@example.com",
    phone: null,
    profileImageObjectKey: null,
    role: "property_manager" as const,
    accountStatus: "active" as const,
    defaultOrganizationId: 1,
  };
  const prisma = {
    rolePermission: { findUnique: async () => null },
    note: {
      findFirstOrThrow: async () => ({
        propertyId: 1,
        unitId: null,
        tenantId: null,
        maintenanceTicketId: null,
        applicationId: null,
        invoiceId: null,
      }),
    },
  } as unknown as PrismaService;
  const context = {
    prisma,
    req: {},
    res: {},
    session: {
      id: 1,
      userId: user.id,
      tokenHash: "test",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
      lastSeenAt: new Date(),
      activeOrganizationId: 1,
      user,
    },
    organization: {
      id: 1,
      userId: user.id,
      organizationId: 1,
      role: "member" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      organization: {
        id: 1,
        name: "Test Organization",
        slug: "test-organization",
        seedKey: null,
        avatarObjectKey: null,
        darkAvatarObjectKey: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        region: null,
        postalCode: null,
        phone: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
  } as unknown as Context;

  return appRouter.createCaller(context);
}

async function expectForbidden(operation: () => Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) => error instanceof TRPCError && error.code === "FORBIDDEN");
}

test("API denies resource reads when view permission is missing", async () => {
  const caller = createDeniedCaller();
  await Promise.all([
    expectForbidden(() => caller.properties.list()),
    expectForbidden(() => caller.tenants.list()),
    expectForbidden(() => caller.applications.list()),
    expectForbidden(() => caller.maintenance.list()),
    expectForbidden(() => caller.units.list({})),
    expectForbidden(() => caller.users.list()),
  ]);
});

test("API denies archive operations when archive permission is missing", async () => {
  const caller = createDeniedCaller();
  await Promise.all([
    expectForbidden(() => caller.leases.archive({ id: 1 })),
    expectForbidden(() => caller.leases.reactivate({ id: 1 })),
    expectForbidden(() => caller.properties.archive({ id: 1 })),
    expectForbidden(() => caller.properties.inactivate({ id: 1 })),
    expectForbidden(() => caller.properties.reactivate({ id: 1 })),
    expectForbidden(() => caller.tenants.archive({ id: 1 })),
    expectForbidden(() => caller.tenants.reactivate({ id: 1 })),
    expectForbidden(() => caller.applications.archive({ id: 1 })),
    expectForbidden(() => caller.applications.reactivate({ id: 1 })),
    expectForbidden(() => caller.maintenance.archive({ id: 1 })),
  ]);
});

test("API denies lease creation when create permission is missing", async () => {
  const caller = createDeniedCaller();
  await expectForbidden(() =>
    caller.leases.create({
      propertyId: 1,
      unitId: 1,
      tenantIds: [1],
      monthlyRentCents: 100_000,
      startsOn: new Date("2026-01-01"),
      endsOn: null,
      status: "draft",
      generateInvoices: false,
    }),
  );
});

test("API denies user creation when create permission is missing", async () => {
  const caller = createDeniedCaller();
  await expectForbidden(() =>
    caller.users.create({
      name: "New User",
      email: "new-user@example.com",
      phone: null,
      password: "test-password",
      role: "property_manager",
    }),
  );
});

test("API denies user changes when the matching permission is missing", async () => {
  const caller = createDeniedCaller();
  await Promise.all([
    expectForbidden(() =>
      caller.users.update({
        id: 1,
        name: "Restricted User",
        email: "restricted@example.com",
        phone: null,
        role: "property_manager",
      }),
    ),
    expectForbidden(() => caller.users.updateAccountStatus({ id: 1, accountStatus: "disabled" })),
    expectForbidden(() => caller.users.delete({ id: 1 })),
  ]);
});

test("API denies every supported note subject when note view permission is missing", async () => {
  const caller = createDeniedCaller();
  await Promise.all([
    expectForbidden(() => caller.notes.list({ propertyId: 1, limit: 10 })),
    expectForbidden(() => caller.notes.list({ unitId: 1, limit: 10 })),
    expectForbidden(() => caller.notes.list({ tenantId: 1, limit: 10 })),
    expectForbidden(() => caller.notes.list({ applicationId: 1, limit: 10 })),
    expectForbidden(() => caller.notes.list({ maintenanceTicketId: 1, limit: 10 })),
    expectForbidden(() => caller.notes.list({ invoiceId: 1, limit: 10 })),
  ]);
});

test("API denies note create, edit, and delete when the matching permission is missing", async () => {
  const caller = createDeniedCaller();
  await Promise.all([
    expectForbidden(() => caller.notes.create({ propertyId: 1, body: "Restricted" })),
    expectForbidden(() => caller.notes.update({ id: 1, body: "Restricted" })),
    expectForbidden(() => caller.notes.delete({ id: 1 })),
  ]);
});

test("API denies lease deletion when delete permission is missing", async () => {
  await expectForbidden(() => createDeniedCaller().leases.delete({ id: 1 }));
});
