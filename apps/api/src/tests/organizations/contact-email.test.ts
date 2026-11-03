import assert from "node:assert/strict";
import test from "node:test";
import { updateOrganizationInputSchema } from "@parcelis/schemas";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

const input = { name: "Example Organization", slug: "example-organization", address: null, phone: null };

function fixture(role = "owner", email: string | null = "existing@example.com") {
  const organization = {
    id: 42,
    name: input.name,
    slug: input.slug,
    email,
    phone: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    region: null,
    postalCode: null,
    avatarObjectKey: null,
    darkAvatarObjectKey: null,
    timeZone: "UTC",
  };
  let writes = 0;
  const ctx = {
    prisma: {
      organization: {
        update: async ({
          where,
          data,
          select,
        }: {
          where: { id: number };
          data: Partial<typeof organization>;
          select: { email: boolean };
        }) => {
          assert.equal(where.id, organization.id);
          assert.equal(select.email, true);
          writes++;
          Object.assign(organization, data);
          return { ...organization };
        },
      },
    },
    session: { userId: 7, user: { id: 7, role: "property_manager", accountStatus: "active" } },
    organization: { organizationId: organization.id, role, organization },
  } as unknown as Context;
  return { caller: appRouter.createCaller(ctx), ctx, organization, writes: () => writes };
}

for (const role of ["owner", "administrator"]) {
  test(`${role} saves the trimmed contact email in the active organization`, async () => {
    const { caller, organization } = fixture(role);
    const result = await caller.organizations.update({ ...input, email: "  Contact@example.com  " });
    assert.equal(result.email, "Contact@example.com");
    assert.equal(organization.email, "Contact@example.com");
    assert.equal((await caller.organizations.active()).email, "Contact@example.com");
  });
}

test("a contact email can be cleared without changing other contact details", async () => {
  const { caller, organization } = fixture();
  await caller.organizations.update({ ...input, phone: "123456789", email: null });
  assert.equal(organization.email, null);
  assert.equal(organization.phone, "123456789");
  assert.equal((await caller.organizations.active()).email, null);
});

test("updates that omit email preserve the saved address", async () => {
  const { caller, organization } = fixture();
  const result = await caller.organizations.update(input);
  assert.equal(result.email, "existing@example.com");
  assert.equal(organization.email, "existing@example.com");
});

test("invalid email addresses are rejected before writing organization settings", async () => {
  const { caller, writes } = fixture();
  for (const email of ["not-an-email", "", "   ", "person@", "one@example.com,two@example.com", "a".repeat(321)]) {
    await assert.rejects(caller.organizations.update({ ...input, email }), { code: "BAD_REQUEST" });
  }
  assert.equal(writes(), 0);
});

test("members can read the saved contact email and see null when it is absent", async () => {
  for (const email of ["contact@example.com", null]) {
    const { caller } = fixture("member", email);
    assert.equal((await caller.organizations.active()).email, email);
  }
});

test("members cannot change the contact email", async () => {
  const { caller, writes } = fixture("member");
  await assert.rejects(caller.organizations.update({ ...input, email: "other@example.com" }), { code: "FORBIDDEN" });
  assert.equal(writes(), 0);
});

test("contact details require a session and an active organization", async () => {
  for (const [change, code] of [
    [{ session: null }, "UNAUTHORIZED"],
    [{ organization: null }, "FORBIDDEN"],
  ] as const) {
    const { ctx, writes } = fixture();
    const caller = appRouter.createCaller({ ...ctx, ...change } as Context);
    await assert.rejects(caller.organizations.active(), { code });
    await assert.rejects(caller.organizations.update({ ...input, email: "contact@example.com" }), { code });
    assert.equal(writes(), 0);
  }
});

test("the shared settings contract accepts optional, nullable, and trimmed contact emails", () => {
  assert.equal(updateOrganizationInputSchema.parse(input).email, undefined);
  assert.equal(updateOrganizationInputSchema.parse({ ...input, email: null }).email, null);
  assert.equal(
    updateOrganizationInputSchema.parse({ ...input, email: " contact@example.com " }).email,
    "contact@example.com",
  );
});
