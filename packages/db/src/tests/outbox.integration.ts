import { createOutboxTestSchema, validateOutboxTestDatabaseUrl } from "../../../../scripts/outbox-test-database.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { OutboxEventStatus, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { claimAvailableOutboxEvents, recordOutboxEvent } from "../outbox.js";

const databaseUrl = process.env.OUTBOX_TEST_DATABASE_URL;

if (databaseUrl) {
  validateOutboxTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);
}

test("PostgreSQL allows only one concurrent dispatcher to claim an outbox event", { skip: !databaseUrl }, async () => {
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
      data: { name: `Outbox integration ${testId}`, slug: `outbox-integration-${testId}` },
    });

    const event = await prisma.$transaction((tx) =>
      recordOutboxEvent(tx, {
        organizationId: organization.id,
        eventType: "lease.activate",
        schemaVersion: 1,
        payload: { organizationId: organization.id, leaseId: 1 },
        idempotencyKey: `integration:${testId}`,
      }),
    );

    const claims = await Promise.all([
      claimAvailableOutboxEvents(prisma, { claimToken: `dispatcher-one-${testId}` }),
      claimAvailableOutboxEvents(prisma, { claimToken: `dispatcher-two-${testId}` }),
    ]);

    assert.equal(claims[0].length + claims[1].length, 1);

    const claimedEvent = claims.flat()[0];
    assert.ok(claimedEvent);
    assert.equal(claimedEvent.id, event.id);
    assert.equal(claimedEvent.organizationId, organization.id);
    assert.equal(claimedEvent.status, OutboxEventStatus.processing);
    assert.equal(claimedEvent.attemptCount, 1);
    assert.ok(claimedEvent.claimToken);
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
});

test("PostgreSQL makes an event claimable again after a dispatcher lock expires", { skip: !databaseUrl }, async () => {
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
      data: { name: `Outbox recovery ${testId}`, slug: `outbox-recovery-${testId}` },
    });

    const event = await prisma.$transaction((tx) =>
      recordOutboxEvent(tx, {
        organizationId: organization.id,
        eventType: "lease.activate",
        schemaVersion: 1,
        payload: { organizationId: organization.id, leaseId: 1 },
        idempotencyKey: `recovery:${testId}`,
        availableAt: new Date(0),
      }),
    );

    const claimTime = new Date();
    const firstClaim = await claimAvailableOutboxEvents(prisma, {
      now: claimTime,
      lockDurationMs: 10,
      claimToken: `crashed-dispatcher-${testId}`,
    });
    const recoveredClaim = await claimAvailableOutboxEvents(prisma, {
      now: new Date(claimTime.getTime() + 11),
      claimToken: `replacement-dispatcher-${testId}`,
    });

    assert.equal(firstClaim.length, 1);
    assert.ok(firstClaim[0]);
    assert.equal(firstClaim[0].id, event.id);
    assert.equal(recoveredClaim.length, 1);
    assert.ok(recoveredClaim[0]);
    assert.equal(recoveredClaim[0].id, event.id);
    assert.equal(recoveredClaim[0].status, OutboxEventStatus.processing);
    assert.equal(recoveredClaim[0].attemptCount, 2);
    assert.equal(recoveredClaim[0].claimToken, `replacement-dispatcher-${testId}`);
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
});
