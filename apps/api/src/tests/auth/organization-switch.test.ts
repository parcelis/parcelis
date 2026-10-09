import assert from "node:assert/strict";
import test from "node:test";
import { appRouter } from "../../router/app.router";

for (const member of [true, false]) {
  test("organization switching enforces membership and stores the user preference: " + member, async () => {
    let saved: unknown;
    const user = { id: 7, role: "property_manager", defaultOrganizationId: 3 };
    const caller = appRouter.createCaller({
      prisma: {
        organizationMembership: { findUnique: async () => (member ? { organizationId: 4 } : null) },
        user: {
          update: async (query: unknown) => {
            saved = query;
            return user;
          },
        },
      },
      session: { userId: user.id, user },
      organization: { organizationId: 3, role: "owner", organization: { id: 3 } },
    } as never);
    if (member) {
      assert.deepEqual(await caller.organizations.switch({ organizationId: 4 }), { organizationId: 4 });
      assert.deepEqual(saved, { where: { id: 7 }, data: { defaultOrganizationId: 4 } });
    } else {
      await assert.rejects(caller.organizations.switch({ organizationId: 4 }), { code: "FORBIDDEN" });
      assert.equal(saved, undefined);
    }
  });
}
