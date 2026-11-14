import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import {
  createIsolatedTestSchema,
  validateOutboxTestDatabaseUrl,
} from "../../../../../scripts/outbox-test-database.mjs";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

const databaseUrl = process.env.API_TOKEN_TEST_DATABASE_URL;
if (databaseUrl) validateOutboxTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);

const applicantInput = { firstName: "Alex", lastName: "Smith", email: "alex@example.com" };
const rejectedIncomeCents = 12_345;

test(
  "application API writes atomically lock the organization currency",
  { skip: !databaseUrl, timeout: 60_000 },
  async (t) => {
    const previousFlag = process.env.FEATURE_FLAG_APPLICATIONS_ENABLED;
    process.env.FEATURE_FLAG_APPLICATIONS_ENABLED = "true";
    t.after(() => {
      if (previousFlag === undefined) delete process.env.FEATURE_FLAG_APPLICATIONS_ENABLED;
      else process.env.FEATURE_FLAG_APPLICATIONS_ENABLED = previousFlag;
    });
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "application_currency_test").catch(
      async (error) => {
        await admin.$disconnect();
        throw error;
      },
    );
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

    // Reject a valid input at the database write, after the lock and applicant changes.
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${isolated.schema}".reject_application_income() RETURNS trigger AS $$
      BEGIN
        IF NEW."annualIncomeCents" = ${rejectedIncomeCents} THEN
          RAISE EXCEPTION 'Currency test rejects income';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER reject_application_income BEFORE INSERT OR UPDATE
      ON "${isolated.schema}"."Application" FOR EACH ROW
      EXECUTE FUNCTION "${isolated.schema}".reject_application_income()
    `);

    async function fixture(slug: string, role = "administrator") {
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
      const status = await prisma.applicationStatus.create({
        data: { organizationId: organization.id, label: "New" },
      });
      const caller = appRouter.createCaller({
        prisma,
        req: { headers: {} },
        transport: "trpc",
        session: { userId: 1, user: { id: 1, name: "Test user", role } },
        organization: { organizationId: organization.id, organization, role },
      } as unknown as Context);
      const input = { propertyId: property.id, statusId: status.id, annualIncomeCents: 0, applicant: applicantInput };
      const lockTime = async () =>
        (await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } })).currencyLockedAt;
      const existingApplication = async () => {
        const applicant = await prisma.applicant.create({
          data: { organizationId: organization.id, ...applicantInput },
        });
        return prisma.application.create({
          data: {
            organizationId: organization.id,
            propertyId: property.id,
            statusId: status.id,
            applicantId: applicant.id,
            annualIncomeCents: 100,
          },
        });
      };
      return { organization, caller, input, lockTime, existingApplication };
    }

    await t.test("creation locks zero income in only the active organization", async () => {
      const own = await fixture("application-create");
      const other = await fixture("application-other");
      const saved = await own.caller.applications.create(own.input);
      assert.equal(saved.annualIncomeCents, 0);
      assert.ok(await own.lockTime());
      assert.equal(await other.lockTime(), null);
      assert.equal(
        (await prisma.organization.findUniqueOrThrow({ where: { id: own.organization.id } })).currencyCode,
        "USD",
      );
    });

    await t.test("updating existing income to zero establishes the lock", async () => {
      const own = await fixture("application-update");
      const application = await own.existingApplication();
      await own.caller.applications.update({ ...own.input, id: application.id });
      assert.ok(await own.lockTime());
      assert.equal(
        (await prisma.application.findUniqueOrThrow({ where: { id: application.id } })).annualIncomeCents,
        0,
      );
    });

    await t.test("later creates and updates preserve an established timestamp", async () => {
      const own = await fixture("application-locked");
      const timestamp = new Date("2020-01-01T00:00:00Z");
      await prisma.organization.update({ where: { id: own.organization.id }, data: { currencyLockedAt: timestamp } });
      const application = await own.caller.applications.create(own.input);
      assert.equal((await own.lockTime())?.getTime(), timestamp.getTime());
      await own.caller.applications.update({ ...own.input, id: application.id, annualIncomeCents: 200 });
      assert.equal((await own.lockTime())?.getTime(), timestamp.getTime());
      await own.caller.applications.archive({ id: application.id });
      await own.caller.applications.delete({ id: application.id });
      assert.equal((await own.lockTime())?.getTime(), timestamp.getTime());
    });

    await t.test("failed creation rolls back the applicant, application, and lock", async () => {
      const own = await fixture("application-create-failure");
      await assert.rejects(
        own.caller.applications.create({ ...own.input, annualIncomeCents: rejectedIncomeCents }),
        /Currency test rejects income/,
      );
      assert.equal(await own.lockTime(), null);
      assert.equal(await prisma.applicant.count({ where: { organizationId: own.organization.id } }), 0);
      assert.equal(await prisma.application.count({ where: { organizationId: own.organization.id } }), 0);
      await own.caller.applications.create(own.input);
      assert.ok(await own.lockTime());
    });

    await t.test("failed updates roll back applicant edits, income, and the lock", async () => {
      const own = await fixture("application-update-failure");
      const application = await own.existingApplication();
      await assert.rejects(
        own.caller.applications.update({
          ...own.input,
          id: application.id,
          annualIncomeCents: rejectedIncomeCents,
          applicant: { ...applicantInput, firstName: "Changed" },
        }),
        /Currency test rejects income/,
      );
      assert.equal(await own.lockTime(), null);
      assert.equal(
        (await prisma.application.findUniqueOrThrow({ where: { id: application.id } })).annualIncomeCents,
        100,
      );
      assert.equal(
        (await prisma.applicant.findUniqueOrThrow({ where: { id: application.applicantId } })).firstName,
        "Alex",
      );
    });

    await t.test("shared-applicant updates roll back copies on failure and lock on success", async () => {
      const own = await fixture("application-shared");
      const application = await own.existingApplication();
      const { id: _id, ...sharedData } = application;
      const sibling = await prisma.application.create({ data: sharedData });
      const update = { ...own.input, id: application.id, applicant: { ...applicantInput, firstName: "Changed" } };
      await assert.rejects(
        own.caller.applications.update({ ...update, annualIncomeCents: rejectedIncomeCents }),
        /Currency test rejects income/,
      );
      assert.equal(await own.lockTime(), null);
      assert.equal(await prisma.applicant.count({ where: { organizationId: own.organization.id } }), 1);
      assert.equal(
        (await prisma.application.findUniqueOrThrow({ where: { id: application.id } })).applicantId,
        application.applicantId,
      );
      const saved = await own.caller.applications.update(update);
      assert.ok(await own.lockTime());
      assert.notEqual(saved.applicantId, sibling.applicantId);
      assert.equal(
        (await prisma.applicant.findUniqueOrThrow({ where: { id: sibling.applicantId } })).firstName,
        "Alex",
      );
    });

    await t.test("foreign property, status, and application IDs cannot establish a lock", async () => {
      const own = await fixture("application-own");
      const foreign = await fixture("application-foreign");
      const application = await own.existingApplication();
      const foreignApplication = await foreign.existingApplication();
      for (const replacement of [{ propertyId: foreign.input.propertyId }, { statusId: foreign.input.statusId }]) {
        await assert.rejects(own.caller.applications.create({ ...own.input, ...replacement }), { code: "BAD_REQUEST" });
        await assert.rejects(own.caller.applications.update({ ...own.input, id: application.id, ...replacement }), {
          code: "BAD_REQUEST",
        });
      }
      await assert.rejects(own.caller.applications.update({ ...own.input, id: foreignApplication.id }));
      assert.equal(await own.lockTime(), null);
      assert.equal(await foreign.lockTime(), null);
    });

    await t.test("disabled applications reject income writes without locking", async () => {
      const own = await fixture("application-disabled");
      const application = await own.existingApplication();
      process.env.FEATURE_FLAG_APPLICATIONS_ENABLED = "false";
      try {
        await assert.rejects(own.caller.applications.create(own.input), { code: "FORBIDDEN" });
        await assert.rejects(own.caller.applications.update({ ...own.input, id: application.id }), {
          code: "FORBIDDEN",
        });
      } finally {
        process.env.FEATURE_FLAG_APPLICATIONS_ENABLED = "true";
      }
      assert.equal(await own.lockTime(), null);
    });

    await t.test("missing permissions reject income writes without locking", async () => {
      const own = await fixture("application-denied", "property_manager");
      const application = await own.existingApplication();
      await assert.rejects(own.caller.applications.create(own.input), { code: "FORBIDDEN" });
      await assert.rejects(own.caller.applications.update({ ...own.input, id: application.id }), { code: "FORBIDDEN" });
      assert.equal(await own.lockTime(), null);
    });
  },
);
