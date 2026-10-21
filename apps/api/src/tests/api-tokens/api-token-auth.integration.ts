import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import { S3Client } from "@aws-sdk/client-s3";
import {
  createIsolatedTestSchema,
  validateOutboxTestDatabaseUrl as validateTestDatabaseUrl,
} from "../../../../../scripts/outbox-test-database.mjs";
import { appRouter } from "../../router/app.router";
import { createContext } from "../../router/context";
import { handleRestRequest } from "../../router/rest-handler";
import { updateApiTokenLastUsed } from "../../modules/api-tokens";
import { createTestSessionCookie } from "../auth/session-cookie";

const databaseUrl = process.env.API_TOKEN_TEST_DATABASE_URL;
if (databaseUrl) validateTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);

const propertyInput = {
  name: "Token property",
  propertyType: "Apartment",
  unitCount: 0,
  address: { line1: "100 Main St", city: "Madison", region: "WI", postalCode: "53703" },
};
const unitInput = { name: "Unit 1", marketRateCents: 120000, unitType: "Residential" };
const uploadInput = { contentType: "image/png", fileSize: 10, fileName: "image.png" };

test("REST bearer tokens preserve PostgreSQL organization boundaries", { skip: !databaseUrl }, async (t) => {
  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "token_auth_test").catch(async (error) => {
    await admin.$disconnect();
    throw error;
  });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
  });
  t.after(async () => {
    try {
      await prisma.$disconnect();
    } finally {
      try {
        await isolated.cleanup();
      } finally {
        await admin.$disconnect();
      }
    }
  });
  let storageRequests = 0;
  t.mock.method(S3Client.prototype, "send", async () => {
    storageRequests++;
    return { ContentLength: 10 };
  });
  const organizations = await Promise.all(
    ["one", "two"].map((slug) => prisma.organization.create({ data: { name: slug, slug } })),
  );
  const creator = await prisma.user.create({
    data: {
      email: "platform@example.test",
      name: "Platform admin",
      passwordHash: "unused",
      role: "administrator",
    },
  });
  const fixtures = await Promise.all(
    organizations.map(async (organization) => {
      const context = await createContext(prisma)({
        req: {
          headers: {
            cookie: await createTestSessionCookie(String(creator.id)),
            "x-parcelis-organization-slug": organization.slug,
          },
        },
      });
      const credential = await appRouter
        .createCaller(context)
        .apiTokens.create({ name: `Token ${organization.slug}`, expiration: "never" });
      const [property, tenant, amenity, utility, tag] = await Promise.all([
        prisma.property.create({
          data: {
            organizationId: organization.id,
            name: organization.slug,
            line1: "100 Main",
            city: "Madison",
            region: "WI",
            postalCode: "53703",
            unitCount: 1,
          },
        }),
        prisma.tenant.create({
          data: {
            organizationId: organization.id,
            firstName: "Test",
            lastName: organization.slug,
            email: `${organization.slug}@example.test`,
          },
        }),
        prisma.amenityType.create({ data: { organizationId: organization.id, label: `Amenity ${organization.slug}` } }),
        prisma.utilityType.create({ data: { organizationId: organization.id, label: `Utility ${organization.slug}` } }),
        prisma.tag.create({ data: { organizationId: organization.id, label: `Tag ${organization.slug}` } }),
      ]);
      const unit = await prisma.unit.create({
        data: { propertyId: property.id, name: "Existing unit", marketRateCents: 100 },
      });
      return { organization, credential, property, tenant, amenity, utility, tag, unit };
    }),
  );
  assert.equal(await prisma.organizationMembership.count({ where: { userId: creator.id } }), 0);
  await prisma.user.delete({ where: { id: creator.id } });
  assert.equal(await prisma.apiToken.count({ where: { createdById: null } }), 2);

  async function call(secret: string, method: string, path: string, body?: unknown, expected = 200) {
    const response = await handleRestRequest(
      prisma,
      new Request(`http://localhost/api/v1${path}`, {
        method,
        headers: {
          authorization: `Bearer ${secret}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    const text = await response.text();
    assert.equal(response.status, expected, `${method} ${path}: ${text}`);
    assert.equal(text.includes(secret), false);
    return JSON.parse(text);
  }

  await t.test("each token reads only its organization across all REST families", async () => {
    for (const own of fixtures) {
      const foreign = fixtures.find((row) => row !== own)!;
      const secret = own.credential.token;
      const properties = await call(secret, "GET", "/properties");
      assert.deepEqual(
        properties.data.map((row: { id: number }) => row.id),
        [own.property.id],
      );
      assert.equal((await call(secret, "GET", `/properties/${own.property.id}`)).data.id, own.property.id);
      await call(secret, "GET", `/properties/${foreign.property.id}`, undefined, 404);
      assert.deepEqual(
        (await call(secret, "GET", "/units")).data.map((row: { id: number }) => row.id),
        [own.unit.id],
      );
      assert.equal((await call(secret, "GET", `/units/${own.unit.id}`)).data.id, own.unit.id);
      await call(secret, "GET", `/units/${foreign.unit.id}`, undefined, 404);
      assert.deepEqual((await call(secret, "GET", `/units?propertyId=${foreign.property.id}`)).data, []);
      assert.deepEqual(
        (await call(secret, "GET", "/tags")).data.map((row: { id: number }) => row.id),
        [own.tag.id],
      );
      assert.deepEqual(
        (await call(secret, "GET", "/amenities")).data.map((row: { id: number }) => row.id),
        [own.amenity.id],
      );
      const options = (await call(secret, "GET", "/unit-options")).data;
      assert.deepEqual(
        options.utilities.map((row: { id: number }) => row.id),
        [own.utility.id],
      );
      assert.deepEqual(
        options.amenityTypes.map((row: { id: number }) => row.id),
        [own.amenity.id],
      );
    }
  });

  await t.test("foreign writes, nested IDs, and image references are rejected before storage access", async () => {
    for (const own of fixtures) {
      const foreign = fixtures.find((row) => row !== own)!;
      const secret = own.credential.token;
      const before = storageRequests;
      for (const [method, path, body] of [
        ["PUT", `/properties/${foreign.property.id}`, propertyInput],
        ["DELETE", `/properties/${foreign.property.id}`, undefined],
        ["PATCH", `/properties/${foreign.property.id}/archive`, {}],
        ["POST", `/properties/${foreign.property.id}/inactive`, {}],
        ["POST", `/properties/${foreign.property.id}/reactivate`, {}],
        ["PATCH", `/properties/${foreign.property.id}/notes`, { notes: "forbidden" }],
        ["POST", `/properties/${foreign.property.id}/image-upload-url`, uploadInput],
        ["DELETE", `/properties/${foreign.property.id}/image`, undefined],
        ["POST", `/tenants/${foreign.tenant.id}/image-upload-url`, uploadInput],
        ["DELETE", `/tenants/${foreign.tenant.id}/image`, undefined],
        ["PUT", `/amenities/${foreign.amenity.id}`, { label: "forbidden", sortOrder: 0 }],
        ["POST", "/units", { ...unitInput, propertyId: foreign.property.id }],
        ["PATCH", `/units/${foreign.unit.id}`, unitInput],
        ["DELETE", `/units/${foreign.unit.id}`, undefined],
      ] as const)
        await call(secret, method, path, body, 404);
      for (const [kind, id] of [
        ["properties", foreign.property.id],
        ["tenants", foreign.tenant.id],
      ] as const) {
        await call(
          secret,
          "POST",
          `/${kind}/${id}/image`,
          {
            objectKey: `organizations/${own.organization.id}/${kind}/${id}/images/abcd.png`,
          },
          404,
        );
      }
      for (const [kind, id] of [
        ["properties", own.property.id],
        ["tenants", own.tenant.id],
      ] as const) {
        await call(
          secret,
          "POST",
          `/${kind}/${id}/image`,
          {
            objectKey: `organizations/${foreign.organization.id}/${kind}/${id}/images/abcd.png`,
          },
          400,
        );
      }
      await call(secret, "POST", "/properties", { ...propertyInput, tagIds: [foreign.tag.id] }, 400);
      await call(
        secret,
        "POST",
        "/units",
        { ...unitInput, propertyId: own.property.id, amenityTypeIds: [foreign.amenity.id] },
        400,
      );
      await call(
        secret,
        "POST",
        "/units",
        { ...unitInput, propertyId: own.property.id, utilityTypeIds: [foreign.utility.id] },
        400,
      );
      await call(
        secret,
        "PUT",
        `/properties/${own.property.id}`,
        {
          ...propertyInput,
          units: [{ ...unitInput, id: foreign.unit.id }],
        },
        400,
      );
      assert.equal(storageRequests, before);
      assert.equal(
        (await prisma.property.findUniqueOrThrow({ where: { id: foreign.property.id } })).name,
        foreign.organization.slug,
      );
    }
  });

  await t.test("approved writes succeed within each token's organization", async () => {
    for (const own of fixtures) {
      const secret = own.credential.token;
      const tag = (await call(secret, "POST", "/tags", { label: "Created by token" })).data;
      assert.equal((await prisma.tag.findUniqueOrThrow({ where: { id: tag.id } })).organizationId, own.organization.id);
      await call(secret, "PUT", `/amenities/${own.amenity.id}`, { label: "Updated", sortOrder: 1 });
      const created = (await call(secret, "POST", "/properties", { ...propertyInput, tagIds: [tag.id] })).data;
      await call(secret, "PUT", `/properties/${created.id}`, { ...propertyInput, name: "Updated property" });
      const unit = (await call(secret, "POST", "/units", { ...unitInput, propertyId: created.id })).data;
      await call(secret, "PATCH", `/units/${unit.id}`, { ...unitInput, name: "Updated unit" });
      await call(secret, "DELETE", `/units/${unit.id}`);
      await call(secret, "PATCH", `/properties/${created.id}/archive`, {});
      await call(secret, "POST", `/properties/${created.id}/reactivate`, {});
      await call(secret, "POST", `/properties/${created.id}/inactive`, {});
      await call(secret, "DELETE", `/properties/${created.id}`);
      await call(secret, "PATCH", `/properties/${own.property.id}/notes`, { notes: "Token note" });
      for (const [kind, id] of [
        ["properties", own.property.id],
        ["tenants", own.tenant.id],
      ] as const) {
        const upload = (await call(secret, "POST", `/${kind}/${id}/image-upload-url`, uploadInput)).data;
        assert.ok(upload.objectKey.startsWith(`organizations/${own.organization.id}/${kind}/${id}/images/`));
        await call(secret, "POST", `/${kind}/${id}/image`, { objectKey: upload.objectKey });
        await call(secret, "DELETE", `/${kind}/${id}/image`);
      }
    }
  });

  await t.test("domain history still prevents deletion", async () => {
    const own = fixtures[0]!;
    await call(own.credential.token, "DELETE", `/properties/${own.property.id}`, undefined, 409);
  });

  await t.test("last-used updates are atomic, throttled, and do not update revoked tokens", async () => {
    const id = fixtures[0]!.credential.metadata.id;
    const time = new Date("2030-01-01T00:00:00Z");
    await prisma.apiToken.update({ where: { id }, data: { lastUsedAt: null } });
    await Promise.all(Array.from({ length: 8 }, () => updateApiTokenLastUsed(prisma, id, time)));
    assert.equal((await prisma.apiToken.findUniqueOrThrow({ where: { id } })).lastUsedAt?.getTime(), time.getTime());
    await updateApiTokenLastUsed(prisma, id, new Date(time.getTime() + 299999));
    assert.equal((await prisma.apiToken.findUniqueOrThrow({ where: { id } })).lastUsedAt?.getTime(), time.getTime());
    const boundary = new Date(time.getTime() + 300000);
    await updateApiTokenLastUsed(prisma, id, boundary);
    assert.equal(
      (await prisma.apiToken.findUniqueOrThrow({ where: { id } })).lastUsedAt?.getTime(),
      boundary.getTime(),
    );
    await prisma.apiToken.update({ where: { id }, data: { revokedAt: boundary } });
    await updateApiTokenLastUsed(prisma, id, new Date(boundary.getTime() + 300000));
    assert.equal(
      (await prisma.apiToken.findUniqueOrThrow({ where: { id } })).lastUsedAt?.getTime(),
      boundary.getTime(),
    );
    await call(fixtures[0]!.credential.token, "GET", "/properties", undefined, 401);
  });
});
