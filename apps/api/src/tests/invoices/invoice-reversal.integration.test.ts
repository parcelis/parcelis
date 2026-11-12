import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Prisma, PrismaClient, PrismaPg } from "@parcelis/db";
import { TRPCError } from "@trpc/server";
import { createIsolatedTestSchema } from "../../../../../scripts/outbox-test-database.mjs";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

const databaseUrl = process.env.INVOICE_REVERSAL_INTEGRATION_TEST === "1" ? process.env.DATABASE_URL : undefined;
if (process.env.INVOICE_REVERSAL_INTEGRATION_TEST === "1" && !databaseUrl) {
  throw new Error("Invoice reversal integration tests require DATABASE_URL when enabled.");
}
if (databaseUrl && !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Invoice reversal integration tests require local PostgreSQL.");
}

test(
  "payment reversal preserves history and handles concurrent writes",
  { skip: !databaseUrl, timeout: 60_000 },
  async (t) => {
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "invoice_reversal_test").catch(
      async (error) => {
        await admin.$disconnect();
        throw error;
      },
    );
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
    });
    try {
      const migration = await readFile(
        new URL(
          "../../../../../packages/db/prisma/migrations/20261104000000_require_complete_payment_reversal/migration.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await prisma.$executeRawUnsafe(
        migration.replace('ALTER TABLE "InvoicePayment"', `ALTER TABLE "${isolated.schema}"."InvoicePayment"`),
      );
      const paymentTable = Prisma.raw(`"${isolated.schema}"."InvoicePayment"`);
      const organization = await prisma.organization.create({ data: { name: "Invoice test", slug: isolated.schema } });
      const other = await prisma.organization.create({ data: { name: "Other", slug: `${isolated.schema}-other` } });
      const property = await prisma.property.create({
        data: {
          organizationId: organization.id,
          name: "Test",
          line1: "1 Test Street",
          city: "Test",
          region: "IL",
          postalCode: "60000",
          unitCount: 1,
        },
      });
      const unit = await prisma.unit.create({ data: { propertyId: property.id, name: "1A", marketRateCents: 10_000 } });
      const tenant = await prisma.tenant.create({
        data: { organizationId: organization.id, firstName: "Test", lastName: "Tenant", email: "tenant@example.test" },
      });
      const lease = await prisma.lease.create({
        data: { organizationId: organization.id, propertyId: property.id, unitId: unit.id, allowPartialPayments: true },
      });
      await prisma.leaseTenant.create({
        data: { organizationId: organization.id, leaseId: lease.id, tenantId: tenant.id },
      });
      let month = 0;
      const createInvoice = () => {
        const dueOn = new Date(Date.UTC(2030, month++, 1));
        return prisma.invoice.create({
          data: {
            organizationId: organization.id,
            propertyId: property.id,
            leaseId: lease.id,
            tenantId: tenant.id,
            dueOn,
            periodStartsOn: dueOn,
            periodEndsOn: dueOn,
            amountCents: 10_000,
            balanceCents: 10_000,
            recipients: { create: { tenantId: tenant.id } },
          },
        });
      };
      const createCaller = (client: unknown, organizationId = organization.id, role = "administrator") =>
        appRouter.createCaller({
          prisma: client,
          session: { user: { id: 42, name: "Test administrator", role } },
          organization: { organizationId },
        } as unknown as Context);
      const caller = createCaller(prisma);
      const pay = (id: number, amountCents: number) =>
        caller.invoices.recordPayment({
          id,
          amountCents,
          paidByTenantId: tenant.id,
          paidOn: new Date("2029-01-01"),
          paymentMethod: "check",
        });

      const full = await createInvoice();
      await t.test("manual invoices persist initial payments and restore settlement after edits", async () => {
        await prisma.lease.update({ where: { id: lease.id }, data: { status: "active" } });
        for (const paidCents of [5_000, 10_000]) {
          const dueOn = new Date(Date.UTC(2040, paidCents === 5_000 ? 0 : 1, 1));
          const manual = await caller.invoices.createManual({
            propertyId: property.id,
            leaseId: lease.id,
            tenantId: tenant.id,
            dueOn,
            paidCents,
            items: [{ item: "Rent", quantity: 1, rateCents: 10_000 }],
          });
          const payment = await prisma.invoicePayment.findFirstOrThrow({ where: { invoiceId: manual.id } });
          assert.equal(payment.amountCents, paidCents);
          assert.equal(payment.tenantId, tenant.id);
          assert.equal(payment.paymentMethod, "other");
          assert.equal(payment.paidOn.getTime(), dueOn.getTime());
          for (const rateCents of [15_000, paidCents]) {
            await caller.invoices.update({ id: manual.id, dueOn, items: [{ item: "Rent", quantity: 1, rateCents }] });
          }
          const restored = await prisma.invoice.findUniqueOrThrow({ where: { id: manual.id } });
          assert.equal(restored.balanceCents, 0);
          assert.equal(restored.paidOn?.getTime(), dueOn.getTime());
          assert.equal(restored.paidByTenantId, tenant.id);
          assert.equal(restored.paymentMethod, "other");
        }
      });
      await t.test("legacy settlement backfill preserves dates and does not duplicate payment history", async () => {
        const legacy = await createInvoice();
        const paidOn = new Date("2028-04-12");
        await prisma.invoice.update({ where: { id: legacy.id }, data: { balanceCents: 0, status: "paid", paidOn } });
        const migration = await readFile(
          new URL(
            "../../../../../packages/db/prisma/migrations/20261111000000_backfill_manual_invoice_payments/migration.sql",
            import.meta.url,
          ),
          "utf8",
        );
        const sql = migration
          .replaceAll('"InvoicePayment"', `"${isolated.schema}"."InvoicePayment"`)
          .replaceAll('"Invoice"', `"${isolated.schema}"."Invoice"`);
        await prisma.$executeRawUnsafe(sql);
        await prisma.$executeRawUnsafe(sql);
        assert.equal(await prisma.invoicePayment.count({ where: { invoiceId: legacy.id } }), 1);
        for (const rateCents of [15_000, 10_000]) {
          await caller.invoices.update({
            id: legacy.id,
            dueOn: legacy.dueOn,
            items: [{ item: "Rent", quantity: 1, rateCents }],
          });
        }
        const restored = await prisma.invoice.findUniqueOrThrow({ where: { id: legacy.id } });
        assert.equal(restored.paidOn?.getTime(), paidOn.getTime());
        assert.equal(restored.paidByTenantId, tenant.id);
        assert.equal(restored.paymentMethod, "other");
      });
      const fullPayment = await pay(full.id, 10_000);
      for (let mask = 1; mask < 15; mask++) {
        await assert.rejects(
          prisma.$executeRaw`UPDATE ${paymentTable} SET
            "reversedAt" = ${mask & 1 ? new Date() : null},
            "reversedById" = ${mask & 2 ? "42" : null},
            "reversedByName" = ${mask & 4 ? "Test administrator" : null},
            "reversalReason" = ${mask & 8 ? "Correction" : null}
            WHERE "id" = ${fullPayment.id}`,
          {
            code: "P2010",
            message: /violates check constraint "InvoicePayment_complete_reversal"/,
          },
        );
      }
      await assert.rejects(caller.invoices.reversePayment({ id: fullPayment.id, reason: "  " }), {
        code: "BAD_REQUEST",
      });
      await assert.rejects(
        createCaller(prisma, other.id).invoices.reversePayment({ id: fullPayment.id, reason: "Wrong account" }),
        (error: unknown) =>
          error instanceof TRPCError &&
          error.cause instanceof Prisma.PrismaClientKnownRequestError &&
          error.cause.code === "P2025",
      );
      await assert.rejects(
        createCaller(prisma, organization.id, "property_manager").invoices.reversePayment({
          id: fullPayment.id,
          reason: "Wrong account",
        }),
        { code: "FORBIDDEN" },
      );
      assert.deepEqual(await caller.invoices.reversePayment({ id: fullPayment.id, reason: "  Entered twice  " }), {
        id: fullPayment.id,
      });
      const saved = await prisma.invoicePayment.findUniqueOrThrow({ where: { id: fullPayment.id } });
      assert.equal(saved.amountCents, 10_000);
      assert.ok(saved.reversedAt);
      assert.equal(saved.reversedById, "42");
      assert.equal(saved.reversedByName, "Test administrator");
      assert.equal(saved.reversalReason, "Entered twice");
      const notes = await caller.notes.list({ invoiceId: full.id, limit: 10 });
      assert.equal(notes.length, 1);
      assert.equal(notes[0]?.body, "Payment of $100.00 reversed by Test administrator.\nReason: Entered twice");
      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: full.id } });
      assert.equal(invoice.balanceCents, 10_000);
      assert.equal(invoice.status, "open");
      assert.equal(invoice.paidOn, null);
      assert.equal(invoice.paidByTenantId, null);
      assert.equal(invoice.paymentMethod, null);
      await caller.invoices.reversePayment({ id: fullPayment.id, reason: "A retry" });
      assert.equal((await caller.notes.list({ invoiceId: full.id, limit: 10 })).length, 1);
      assert.equal(
        (await prisma.invoicePayment.findUniqueOrThrow({ where: { id: fullPayment.id } })).reversalReason,
        "Entered twice",
      );
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: full.id } })).balanceCents, 10_000);
      assert.equal(
        await prisma.activityEvent.count({
          where: { subjectType: "invoice", subjectId: full.id, action: "invoice.payment_reversed" },
        }),
        1,
      );
      const event = await prisma.activityEvent.findFirstOrThrow({
        where: { subjectType: "invoice", subjectId: full.id, action: "invoice.payment_reversed" },
      });
      assert.equal(event.actorId, "42");
      assert.equal(event.actorLabel, "Test administrator");
      assert.deepEqual(event.metadata, { paymentId: fullPayment.id, amountCents: 10_000, reason: "Entered twice" });
      await assert.rejects(caller.invoices.delete({ id: full.id }), { code: "BAD_REQUEST" });

      await prisma.rolePermission.createMany({
        data: [
          { role: "property_manager", resource: "invoices", canView: true, canDelete: true },
          { role: "property_manager", resource: "invoice_notes", canView: true },
        ],
      });
      const restricted = createCaller(prisma, organization.id, "property_manager");
      assert.equal((await restricted.notes.list({ invoiceId: full.id, limit: 10 }))[0]?.body, notes[0]?.body);
      const staffInvoice = await createInvoice();
      const staffPayment = await pay(staffInvoice.id, 2_500);
      await restricted.invoices.reversePayment({ id: staffPayment.id, reason: "Staff correction" });
      assert.match(
        (await restricted.notes.list({ invoiceId: staffInvoice.id, limit: 10 }))[0]!.body,
        /Staff correction/,
      );

      const failedInvoice = await createInvoice();
      const failedPayment = await pay(failedInvoice.id, 2_500);
      const failingClient = prisma.$extends({
        query: {
          note: {
            async create() {
              throw new Error("Note storage failed");
            },
          },
        },
      });
      await assert.rejects(
        createCaller(failingClient).invoices.reversePayment({ id: failedPayment.id, reason: "Correction" }),
        /Note storage failed/,
      );
      assert.equal(
        (await prisma.invoicePayment.findUniqueOrThrow({ where: { id: failedPayment.id } })).reversedAt,
        null,
      );
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: failedInvoice.id } })).balanceCents, 7_500);
      assert.equal(await prisma.note.count({ where: { invoiceId: failedInvoice.id } }), 0);

      const partial = await createInvoice();
      const first = await pay(partial.id, 2_500);
      const second = await pay(partial.id, 2_500);
      await caller.invoices.reversePayment({ id: first.id, reason: "Wrong amount" });
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: partial.id } })).balanceCents, 7_500);
      assert.equal((await prisma.invoicePayment.findUniqueOrThrow({ where: { id: second.id } })).reversedAt, null);

      const voidInvoice = await createInvoice();
      const voidPayment = await pay(voidInvoice.id, 2_500);
      await prisma.invoice.update({ where: { id: voidInvoice.id }, data: { status: "void" } });
      await assert.rejects(caller.invoices.reversePayment({ id: voidPayment.id, reason: "Correction" }), {
        code: "CONFLICT",
      });
      assert.equal((await prisma.invoicePayment.findUniqueOrThrow({ where: { id: voidPayment.id } })).reversedAt, null);

      const simultaneous = await createInvoice();
      const duplicate = await pay(simultaneous.id, 2_500);
      const reversals = await Promise.allSettled([
        caller.invoices.reversePayment({ id: duplicate.id, reason: "Duplicate" }),
        caller.invoices.reversePayment({ id: duplicate.id, reason: "Duplicate" }),
      ]);
      assert.ok(reversals.some((result) => result.status === "fulfilled"));
      for (const result of reversals) {
        if (result.status === "rejected") assert.equal(result.reason.code, "CONFLICT");
      }
      await caller.invoices.reversePayment({ id: duplicate.id, reason: "Retry" });
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: simultaneous.id } })).balanceCents, 10_000);
      assert.equal(await prisma.note.count({ where: { invoiceId: simultaneous.id } }), 1);
      assert.equal(
        await prisma.activityEvent.count({
          where: { subjectType: "invoice", subjectId: simultaneous.id, action: "invoice.payment_reversed" },
        }),
        1,
      );

      const racing = await createInvoice();
      const edited = await createInvoice();
      const editedPayment = await pay(edited.id, 10_000);
      const settled = await prisma.invoice.findUniqueOrThrow({ where: { id: edited.id } });
      const edit = (rateCents: number) =>
        caller.invoices.update({
          id: edited.id,
          dueOn: edited.dueOn,
          items: [{ item: "Rent", quantity: 1, rateCents }],
        });
      await edit(10_000);
      assert.equal(
        (await prisma.invoice.findUniqueOrThrow({ where: { id: edited.id } })).paidOn?.getTime(),
        settled.paidOn?.getTime(),
      );
      await edit(15_000);
      const reopened = await prisma.invoice.findUniqueOrThrow({ where: { id: edited.id } });
      assert.equal(reopened.balanceCents, 5_000);
      assert.notEqual(reopened.status, "paid");
      assert.equal(reopened.paidOn, null);
      assert.equal(reopened.paidByTenantId, null);
      assert.equal(reopened.paymentMethod, null);
      assert.deepEqual(
        await prisma.invoicePayment.findUniqueOrThrow({ where: { id: editedPayment.id } }),
        editedPayment,
      );

      await assert.rejects(edit(9_999), { code: "BAD_REQUEST" });
      await assert.rejects(edit(0), { code: "BAD_REQUEST" });
      const editInput = {
        id: edited.id,
        dueOn: edited.dueOn,
        items: [{ item: "Rent", quantity: 1, rateCents: 15_000 }],
      };
      await assert.rejects(restricted.invoices.update(editInput), { code: "FORBIDDEN" });
      await assert.rejects(
        createCaller(prisma, other.id).invoices.update(editInput),
        (error: unknown) =>
          error instanceof TRPCError &&
          error.cause instanceof Prisma.PrismaClientKnownRequestError &&
          error.cause.code === "P2025",
      );
      assert.deepEqual(await prisma.invoice.findUniqueOrThrow({ where: { id: edited.id } }), reopened);

      const reversedLaterPayment = await pay(edited.id, 5_000);
      await prisma.invoicePayment.update({
        where: { id: reversedLaterPayment.id },
        data: { paidOn: new Date("2029-02-01"), paymentMethod: "cash" },
      });
      await caller.invoices.reversePayment({ id: reversedLaterPayment.id, reason: "Correction before editing" });
      await edit(10_000);
      const resettled = await prisma.invoice.findUniqueOrThrow({ where: { id: edited.id } });
      assert.equal(resettled.balanceCents, 0);
      assert.equal(resettled.status, "paid");
      assert.equal(resettled.paidOn?.getTime(), editedPayment.paidOn.getTime());
      assert.equal(resettled.paidByTenantId, editedPayment.tenantId);
      assert.equal(resettled.paymentMethod, editedPayment.paymentMethod);

      const coTenant = await prisma.tenant.create({
        data: { organizationId: organization.id, firstName: "Joint", lastName: "Tenant", email: "joint@example.test" },
      });
      await prisma.leaseTenant.create({
        data: { organizationId: organization.id, leaseId: lease.id, tenantId: coTenant.id },
      });
      const joint = await createInvoice();
      await prisma.invoiceRecipient.create({
        data: { organizationId: organization.id, invoiceId: joint.id, tenantId: coTenant.id },
      });
      const jointFirst = await pay(joint.id, 4_000);
      const jointSecond = await caller.invoices.recordPayment({
        id: joint.id,
        amountCents: 6_000,
        paidByTenantId: coTenant.id,
        paidOn: new Date("2029-01-02"),
        paymentMethod: "check",
      });
      await caller.invoices.reversePayment({ id: jointFirst.id, reason: "Incorrect payment" });
      await caller.invoices.reversePayment({ id: jointFirst.id, reason: "Retry" });
      const jointBalance = await prisma.invoice.findUniqueOrThrow({ where: { id: joint.id } });
      assert.equal(jointBalance.balanceCents, 4_000);
      assert.equal(jointBalance.paidOn, null);
      assert.equal(jointBalance.paidByTenantId, null);
      assert.equal(jointBalance.paymentMethod, null);
      assert.deepEqual(await prisma.invoicePayment.findUniqueOrThrow({ where: { id: jointSecond.id } }), jointSecond);
      assert.equal(await prisma.invoicePayment.count({ where: { invoiceId: joint.id } }), 2);
      await caller.invoices.update({
        id: joint.id,
        dueOn: joint.dueOn,
        items: [{ item: "Corrected rent", quantity: 1, rateCents: 6_000 }],
      });
      const settledJoint = await prisma.invoice.findUniqueOrThrow({ where: { id: joint.id } });
      assert.equal(settledJoint.balanceCents, 0);
      assert.equal(settledJoint.status, "paid");
      assert.equal(settledJoint.paidOn?.getTime(), jointSecond.paidOn.getTime());
      assert.equal(settledJoint.paidByTenantId, coTenant.id);
      assert.equal(settledJoint.paymentMethod, jointSecond.paymentMethod);

      for (const concurrentAction of ["payment", "reversal", "edit"] as const) {
        await t.test(`invoice edit conflicts with concurrent ${concurrentAction} and can be retried`, async () => {
          const target = await createInvoice();
          const initialPayment = await pay(target.id, 2_500);
          let selected!: () => void;
          let resume!: () => void;
          const selectionComplete = new Promise<void>((resolve) => {
            selected = resolve;
          });
          const allowEdit = new Promise<void>((resolve) => {
            resume = resolve;
          });
          const blockedEditClient = prisma.$extends({
            query: {
              invoice: {
                async findFirstOrThrow({ args, query }) {
                  const result = await query(args);
                  selected();
                  await allowEdit;
                  return result;
                },
              },
            },
          });
          const input = {
            id: target.id,
            dueOn: target.dueOn,
            items: [{ item: "Updated rent", quantity: 1, rateCents: 15_000 }],
          };
          const pending = createCaller(blockedEditClient).invoices.update(input);
          const rejected = assert.rejects(pending, { code: "CONFLICT" });
          await selectionComplete;
          try {
            if (concurrentAction === "payment") await pay(target.id, 2_500);
            else if (concurrentAction === "reversal") {
              await caller.invoices.reversePayment({ id: initialPayment.id, reason: "Correction" });
            } else {
              await caller.invoices.update({
                ...input,
                items: [{ item: "Other edit", quantity: 1, rateCents: 12_000 }],
              });
            }
          } finally {
            resume();
          }
          await rejected;
          const afterConflict = await prisma.invoice.findUniqueOrThrow({ where: { id: target.id } });
          assert.equal(afterConflict.amountCents, concurrentAction === "edit" ? 12_000 : 10_000);
          assert.equal(
            await prisma.activityEvent.count({
              where: { subjectType: "invoice", subjectId: target.id, action: "invoice.updated" },
            }),
            concurrentAction === "edit" ? 1 : 0,
          );
          await caller.invoices.update(input);
          await caller.invoices.update(input);
          const final = await prisma.invoice.findUniqueOrThrow({ where: { id: target.id } });
          const payments = await prisma.invoicePayment.findMany({ where: { invoiceId: target.id } });
          const netPaid = payments
            .filter((payment) => !payment.reversedAt)
            .reduce((sum, payment) => sum + payment.amountCents, 0);
          assert.equal(final.amountCents, 15_000);
          assert.equal(final.balanceCents, 15_000 - netPaid);
          assert.equal(netPaid, concurrentAction === "payment" ? 5_000 : concurrentAction === "reversal" ? 0 : 2_500);
          assert.equal(final.status, "open");
          assert.equal(final.paidOn, null);
          assert.equal(final.paidByTenantId, null);
          assert.equal(final.paymentMethod, null);
          assert.equal(payments.length, concurrentAction === "payment" ? 2 : 1);
        });
      }

      const original = await pay(racing.id, 2_500);
      let selected!: () => void;
      let resume!: () => void;
      const selectionComplete = new Promise<void>((resolve) => {
        selected = resolve;
      });
      const allowReversal = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const blockedClient = prisma.$extends({
        query: {
          invoicePayment: {
            async findFirstOrThrow({ args, query }) {
              const result = await query(args);
              selected();
              await allowReversal;
              return result;
            },
          },
        },
      });
      const reversing = createCaller(blockedClient).invoices.reversePayment({ id: original.id, reason: "Duplicate" });
      await selectionComplete;
      try {
        await pay(racing.id, 2_500);
      } finally {
        resume();
      }
      await assert.rejects(reversing, { code: "CONFLICT" });
      assert.equal((await prisma.invoicePayment.findUniqueOrThrow({ where: { id: original.id } })).reversedAt, null);
      await caller.invoices.reversePayment({ id: original.id, reason: "Duplicate" });
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: racing.id } })).balanceCents, 7_500);
    } finally {
      await prisma.$disconnect();
      try {
        await isolated.cleanup();
      } finally {
        await admin.$disconnect();
      }
    }
  },
);
