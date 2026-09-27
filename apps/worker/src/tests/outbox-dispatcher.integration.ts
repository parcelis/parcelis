import { createOutboxTestSchema, validateOutboxTestDatabaseUrl } from "../../../../scripts/outbox-test-database.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { claimAvailableOutboxEvents, PrismaClient, PrismaPg, recordOutboxEvent, type OutboxEvent } from "@parcelis/db";
import type { Queue } from "bullmq";
import { dispatchOutboxEvent } from "../outbox-dispatcher.js";

const databaseUrl = process.env.OUTBOX_TEST_DATABASE_URL;

if (databaseUrl) {
  validateOutboxTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);
}

test(
  "a retry after Redis accepts a job uses the same job ID if dispatch marking fails",
  { skip: !databaseUrl },
  async () => {
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createOutboxTestSchema(admin, databaseUrl!).catch(async (error) => {
      await admin.$disconnect();
      throw error;
    });
    let prisma: PrismaClient | undefined;
    const testId = randomUUID();

    try {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
      });
      const organization = await prisma.organization.create({
        data: { name: `Outbox dispatch recovery ${testId}`, slug: `outbox-dispatch-recovery-${testId}` },
      });

      const recordedEvent = await prisma.$transaction((tx) =>
        recordOutboxEvent(tx, {
          organizationId: organization.id,
          eventType: "lease.activate",
          schemaVersion: 1,
          payload: { organizationId: organization.id, leaseId: 1 },
          idempotencyKey: `dispatch-recovery:${testId}`,
          availableAt: new Date(0),
        }),
      );

      const initialClaim = await claimAvailableOutboxEvents(prisma, {
        lockDurationMs: 10,
        claimToken: `initial-dispatcher-${testId}`,
      });
      assert.equal(initialClaim.length, 1);
      assert.ok(initialClaim[0]);
      assert.equal(initialClaim[0].id, recordedEvent.id);

      let shouldFailDispatchUpdate = true;
      const dispatchPrisma = new Proxy(prisma, {
        get(target, property) {
          const delegate = Reflect.get(target, property, target);
          if (property !== "outboxEvent") {
            return typeof delegate === "function" ? delegate.bind(target) : delegate;
          }

          return new Proxy(delegate, {
            get(outboxDelegate, method) {
              const operation = Reflect.get(outboxDelegate, method, outboxDelegate);
              if (method !== "updateMany" || typeof operation !== "function") {
                return typeof operation === "function" ? operation.bind(outboxDelegate) : operation;
              }

              return async (args: { data?: { status?: string } }) => {
                if (args.data?.status === "dispatched" && shouldFailDispatchUpdate) {
                  shouldFailDispatchUpdate = false;
                  throw new Error("Database unavailable after queue accepted the job.");
                }

                return operation.call(outboxDelegate, args);
              };
            },
          });
        },
      });

      const jobIds: string[] = [];
      const queue = {
        add: async (_name: string, _data: unknown, options: { jobId: string }) => {
          jobIds.push(options.jobId);
          return {};
        },
      } as unknown as Queue;
      const originalConsoleError = console.error;
      console.error = () => {};

      let recoveredClaim: OutboxEvent[] = [];
      try {
        await dispatchOutboxEvent(dispatchPrisma, new Map([["leasing-notifications", queue]]), initialClaim[0]);

        const unmarkedEvent = await prisma.outboxEvent.findUniqueOrThrow({
          where: { id: initialClaim[0].id },
        });
        assert.equal(unmarkedEvent.status, "processing");

        const lockedUntil = initialClaim[0].lockedUntil;
        assert.ok(lockedUntil);
        recoveredClaim = await claimAvailableOutboxEvents(prisma, {
          now: lockedUntil,
          claimToken: `replacement-dispatcher-${testId}`,
        });
      } finally {
        console.error = originalConsoleError;
      }

      assert.equal(recoveredClaim.length, 1);
      assert.ok(recoveredClaim[0]);
      assert.equal(recoveredClaim[0].id, recordedEvent.id);
      await dispatchOutboxEvent(dispatchPrisma, new Map([["leasing-notifications", queue]]), recoveredClaim[0]);

      const storedEvent = await prisma.outboxEvent.findFirstOrThrow({ where: { id: recordedEvent.id } });
      assert.deepEqual(jobIds, [`outbox-event-${storedEvent.id}`, `outbox-event-${storedEvent.id}`]);
      assert.equal(storedEvent.status, "dispatched");
      assert.equal(storedEvent.attemptCount, 2);
    } finally {
      try {
        await prisma?.$disconnect();
      } finally {
        try {
          await isolated.cleanup();
        } finally {
          await admin.$disconnect();
        }
      }
    }
  },
);
