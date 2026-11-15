import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { updateOrganizationInputSchema } from "@parcelis/schemas";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

const input = { name: "Example Organization", slug: "example-organization", address: null, phone: null };
const fixtureEmail = (label: string) => `${label}-${randomUUID()}@fixture.test`;
const existingEmail = fixtureEmail("existing");

function fixture(role = "owner", email: string | null = existingEmail) {
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
    organization: { organizationId: organization.id, role, organization: { ...organization } },
  } as unknown as Context;
  const freshCaller = () =>
    appRouter.createCaller({
      ...ctx,
      organization: {
        ...ctx.organization!,
        organization: { ...ctx.organization!.organization, ...organization },
      },
    });
  return { caller: appRouter.createCaller(ctx), freshCaller, ctx, organization, writes: () => writes };
}

for (const role of ["owner", "administrator"]) {
  test(`${role} saves the trimmed contact email in the active organization`, async () => {
    const contactEmail = fixtureEmail("contact");
    const { caller, freshCaller, organization } = fixture(role);
    const result = await caller.organizations.update({ ...input, email: `  ${contactEmail.toUpperCase()}  ` });
    const normalizedEmail = contactEmail.toLowerCase();
    assert.equal(result.email, normalizedEmail);
    assert.equal(organization.email, normalizedEmail);
    assert.equal((await caller.organizations.active()).email, existingEmail);
    assert.equal((await freshCaller().organizations.active()).email, normalizedEmail);
  });
}

test("a contact email can be cleared without changing other contact details", async () => {
  const { caller, freshCaller, organization } = fixture();
  await caller.organizations.update({ ...input, phone: "123456789", email: null });
  assert.equal(organization.email, null);
  assert.equal(organization.phone, "123456789");
  assert.equal((await caller.organizations.active()).email, existingEmail);
  assert.equal((await freshCaller().organizations.active()).email, null);
});

test("updates that omit email preserve the saved address", async () => {
  const { caller, organization } = fixture();
  const result = await caller.organizations.update(input);
  assert.equal(result.email, existingEmail);
  assert.equal(organization.email, existingEmail);
});

test("invalid email addresses are rejected before writing organization settings", async () => {
  const { caller, writes } = fixture();
  const invalidEmails = [
    "not-an-email",
    "",
    "   ",
    "person@",
    `${fixtureEmail("invalid-one")},${fixtureEmail("invalid-two")}`,
    "a".repeat(321),
  ];
  for (const email of invalidEmails) {
    await assert.rejects(caller.organizations.update({ ...input, email }), { code: "BAD_REQUEST" });
  }
  assert.equal(writes(), 0);
});

test("members can read the saved contact email and see null when it is absent", async () => {
  const contactEmail = fixtureEmail("contact");
  for (const email of [contactEmail, null]) {
    const { caller } = fixture("member", email);
    assert.equal((await caller.organizations.active()).email, email);
  }
});

test("members cannot change the contact email", async () => {
  const { caller, writes } = fixture("member");
  const updatedEmail = fixtureEmail("other");
  await assert.rejects(caller.organizations.update({ ...input, email: updatedEmail }), { code: "FORBIDDEN" });
  assert.equal(writes(), 0);
});

test("contact details require a session and an active organization", async () => {
  const memberEmail = fixtureEmail("contact");
  for (const [change, code] of [
    [{ session: null }, "UNAUTHORIZED"],
    [{ organization: null }, "FORBIDDEN"],
  ] as const) {
    const { ctx, writes } = fixture();
    const caller = appRouter.createCaller({ ...ctx, ...change } as Context);
    await assert.rejects(caller.organizations.active(), { code });
    await assert.rejects(caller.organizations.update({ ...input, email: memberEmail }), { code });
    assert.equal(writes(), 0);
  }
});

test("the shared settings contract accepts optional, nullable, and trimmed contact emails", () => {
  const permittedEmail = fixtureEmail("trimmed");
  assert.equal(updateOrganizationInputSchema.parse(input).email, undefined);
  assert.equal(updateOrganizationInputSchema.parse({ ...input, email: null }).email, null);
  assert.equal(
    updateOrganizationInputSchema.parse({ ...input, email: ` ${permittedEmail.toUpperCase()} ` }).email,
    permittedEmail.toLowerCase(),
  );
  for (const email of [fixtureEmail("ops"), fixtureEmail("tag")]) {
    assert.equal(updateOrganizationInputSchema.parse({ ...input, email: ` ${email} ` }).email, email);
  }
});
