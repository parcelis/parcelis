import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

const installationId = randomUUID();
const session = { userId: 1, user: { id: 1, role: "property_manager" } };

function createCaller(role: "owner" | "administrator" | "member" | null, signedIn = true, hasId = true) {
  return appRouter.createCaller({
    prisma: {
      installation: {
        findUnique: async () => (hasId ? { installationId } : null),
      },
    },
    req: { headers: {} },
    session: signedIn ? session : null,
    organization: role ? { organizationId: 7, role } : null,
  } as unknown as Context);
}

test("organization owners and administrators can read the installation ID", async () => {
  for (const role of ["owner", "administrator"] as const) {
    assert.deepEqual(await createCaller(role).organizations.installationIdentity(), { installationId });
  }

  assert.deepEqual(await createCaller("owner", true, false).organizations.installationIdentity(), {
    installationId: null,
  });
});

test("reading the installation ID requires a session and organization administrator access", async () => {
  await assert.rejects(createCaller(null, false).organizations.installationIdentity(), { code: "UNAUTHORIZED" });
  await assert.rejects(createCaller(null).organizations.installationIdentity(), { code: "FORBIDDEN" });
  await assert.rejects(createCaller("member").organizations.installationIdentity(), { code: "FORBIDDEN" });
});
