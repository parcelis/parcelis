import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import {
  createIsolatedTestSchema,
  validateOutboxTestDatabaseUrl,
} from "../../../../../scripts/outbox-test-database.mjs";
import { createApiToken, getApiTokenDisplayPrefix, hashApiToken } from "../../modules/api-tokens";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";
import { handleRestRequest } from "../../router/rest-handler";

const databaseUrl = process.env.API_TOKEN_TEST_DATABASE_URL;
if (databaseUrl) validateOutboxTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);

const propertyInput = {
  name: "Currency property",
  propertyType: "Apartment" as const,
  unitCount: 0,
  address: { line1: "100 Main St", city: "Madison", region: "WI", postalCode: "53703" },
};
const unitInput = { name: "1A", marketRateCents: 0, unitType: "Residential" as const };

test(
  "unit API writes atomically lock the organization currency",
  { skip: !databaseUrl, timeout: 60_000 },
  async (t) => {
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "unit_currency_test").catch(async (error) => {
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

    async function fixture(slug: string) {
      const organization = await prisma.organization.create({ data: { name: slug, slug } });
      const property = await prisma.property.create({
        data: {
          organizationId: organization.id,
          name: slug,
          line1: "100 Main St",
          city: "Madison",
          region: "WI",
          postalCode: "53703",
          unitCount: 0,
        },
      });
      const caller = appRouter.createCaller({
        prisma,
        req: { headers: {} },
        transport: "trpc",
        session: { userId: 1, user: { id: 1, name: "Administrator", role: "administrator" } },
        organization: { organizationId: organization.id, organization, role: "administrator" },
      } as unknown as Context);
      const lockTime = async () =>
        (await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } })).currencyLockedAt;
      return { organization, property, caller, lockTime };
    }

    await t.test("unit creation locks a zero rate and a later update preserves the timestamp", async () => {
      const { property, caller, lockTime } = await fixture("unit-create");
      const unit = await caller.units.create({ propertyId: property.id, ...unitInput });
      const first = await lockTime();
      assert.ok(first instanceof Date);
      assert.equal(unit.marketRateCents, 0);
      await caller.units.update({ id: unit.id, ...unitInput, marketRateCents: 10_000 });
      assert.equal((await lockTime())?.getTime(), first.getTime());
    });

    await t.test("updating an existing unit establishes its organization's lock", async () => {
      const { property, caller, lockTime } = await fixture("unit-update");
      const unit = await prisma.unit.create({ data: { propertyId: property.id, name: "1A", marketRateCents: 100 } });
      assert.equal(await lockTime(), null);
      await caller.units.update({ id: unit.id, ...unitInput });
      assert.ok(await lockTime());
      assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).marketRateCents, 0);
    });

    await t.test("property creation locks currency when it creates zero-rate units", async () => {
      const { caller, lockTime } = await fixture("property-create");
      const property = await caller.properties.create({ ...propertyInput, unitCount: 1, units: [unitInput] });
      assert.ok(await lockTime());
      assert.equal(await prisma.unit.count({ where: { propertyId: property.id, marketRateCents: 0 } }), 1);
    });

    await t.test("property updates lock new unit rates and preserve the lock when editing them", async () => {
      const { property, caller, lockTime } = await fixture("property-update");
      await caller.properties.update({ ...propertyInput, id: property.id, unitCount: 1, units: [unitInput] });
      const first = await lockTime();
      assert.ok(first instanceof Date);
      const unit = await prisma.unit.findFirstOrThrow({ where: { propertyId: property.id } });
      await caller.properties.update({
        ...propertyInput,
        id: property.id,
        unitCount: 1,
        units: [{ ...unitInput, id: unit.id }],
      });
      assert.equal((await lockTime())?.getTime(), first.getTime());
    });

    await t.test("a property update that edits an existing unit establishes the lock", async () => {
      const { property, caller, lockTime } = await fixture("property-existing-unit");
      const unit = await prisma.unit.create({ data: { propertyId: property.id, name: "1A", marketRateCents: 100 } });
      await caller.properties.update({
        ...propertyInput,
        id: property.id,
        unitCount: 1,
        units: [{ ...unitInput, id: unit.id }],
      });
      assert.ok(await lockTime());
    });

    await t.test("property-only creation and updates leave a new organization unlocked", async () => {
      const { caller, lockTime } = await fixture("property-only");
      const property = await caller.properties.create(propertyInput);
      await caller.properties.update({ ...propertyInput, id: property.id, name: "Renamed property" });
      assert.equal(await lockTime(), null);
    });

    await t.test("failed unit creation rolls back the currency lock", async () => {
      const { property, caller, lockTime } = await fixture("unit-create-failure");
      await prisma.unit.create({ data: { propertyId: property.id, name: "1A", marketRateCents: 100 } });
      await assert.rejects(caller.units.create({ propertyId: property.id, ...unitInput }));
      assert.equal(await lockTime(), null);
      assert.equal(await prisma.unit.count({ where: { propertyId: property.id } }), 1);
    });

    await t.test("failed unit updates roll back the currency lock and amount changes", async () => {
      const { property, caller, lockTime } = await fixture("unit-update-failure");
      await prisma.unit.create({ data: { propertyId: property.id, name: "1A", marketRateCents: 100 } });
      const unit = await prisma.unit.create({ data: { propertyId: property.id, name: "1B", marketRateCents: 200 } });
      await assert.rejects(caller.units.update({ id: unit.id, ...unitInput }));
      assert.equal(await lockTime(), null);
      const saved = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
      assert.equal(saved.name, "1B");
      assert.equal(saved.marketRateCents, 200);
    });

    await t.test("failed property creation rolls back its units, property, and currency lock", async () => {
      const { caller, organization, lockTime } = await fixture("property-create-failure");
      await assert.rejects(caller.properties.create({ ...propertyInput, unitCount: 2, units: [unitInput, unitInput] }));
      assert.equal(await lockTime(), null);
      assert.equal(await prisma.property.count({ where: { organizationId: organization.id } }), 1);
      assert.equal(await prisma.unit.count({ where: { property: { organizationId: organization.id } } }), 0);
    });

    await t.test("failed property updates roll back their units, metadata, and currency lock", async () => {
      const { caller, property, lockTime } = await fixture("property-update-failure");
      await assert.rejects(
        caller.properties.update({ ...propertyInput, id: property.id, unitCount: 2, units: [unitInput, unitInput] }),
      );
      assert.equal(await lockTime(), null);
      assert.equal((await prisma.property.findUniqueOrThrow({ where: { id: property.id } })).name, property.name);
      assert.equal(await prisma.unit.count({ where: { propertyId: property.id } }), 0);
    });

    await t.test("foreign properties and units are rejected before either organization is locked", async () => {
      const own = await fixture("own");
      const foreign = await fixture("foreign");
      const unit = await prisma.unit.create({
        data: { propertyId: foreign.property.id, name: "1A", marketRateCents: 100 },
      });
      await assert.rejects(own.caller.units.create({ propertyId: foreign.property.id, ...unitInput }));
      await assert.rejects(own.caller.units.update({ id: unit.id, ...unitInput }));
      await assert.rejects(
        own.caller.properties.update({ ...propertyInput, id: foreign.property.id, units: [unitInput] }),
      );
      assert.equal(await own.lockTime(), null);
      assert.equal(await foreign.lockTime(), null);
    });

    await t.test("REST token writes lock the token's organization and preserve the lock", async () => {
      const { organization, property, lockTime } = await fixture("rest");
      const token = createApiToken();
      await prisma.apiToken.create({
        data: {
          organizationId: organization.id,
          name: "Currency test",
          createdByLabel: "Test",
          tokenHash: hashApiToken(token),
          tokenPrefix: getApiTokenDisplayPrefix(token),
        },
      });
      const response = await handleRestRequest(
        prisma,
        new Request("http://localhost/api/v1/units", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ propertyId: property.id, ...unitInput }),
        }),
      );
      assert.equal(response.status, 200);
      const first = await lockTime();
      assert.ok(first instanceof Date);
      const { data: unit } = await response.json();
      const updated = await handleRestRequest(
        prisma,
        new Request(`http://localhost/api/v1/units/${unit.id}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ ...unitInput, marketRateCents: 10_000 }),
        }),
      );
      assert.equal(updated.status, 200);
      assert.equal((await lockTime())?.getTime(), first.getTime());
    });
  },
);
