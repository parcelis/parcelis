import assert from "node:assert/strict";
import test from "node:test";
import { appRouter } from "../../router/app.router";

for (const member of [true, false]) {
  test("organization switching enforces membership without changing the login default: " + member, async () => {
    let userUpdated = false;
    const user = { id: 7, role: "property_manager", defaultOrganizationId: 3 };
    const caller = appRouter.createCaller({
      prisma: {
        organizationMembership: { findUnique: async () => (member ? { organizationId: 4 } : null) },
        user: {
          update: async (query: unknown) => {
            userUpdated = true;
            return user;
          },
        },
      },
      session: { userId: user.id, user },
      organization: { organizationId: 3, role: "owner", organization: { id: 3 } },
    } as never);
    if (member) {
      assert.deepEqual(await caller.organizations.switch({ organizationId: 4 }), { organizationId: 4 });
    } else {
      await assert.rejects(caller.organizations.switch({ organizationId: 4 }), { code: "FORBIDDEN" });
    }
    assert.equal(userUpdated, false);
    assert.equal(user.defaultOrganizationId, 3);
  });
}
