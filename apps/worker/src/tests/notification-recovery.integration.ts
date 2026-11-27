import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { createInterface } from "node:readline";
import test from "node:test";
import {
  claimAvailableOutboxEvents,
  PrismaClient,
  PrismaPg,
  recordNotificationDeliveryQueued,
  recordOutboxEvent,
} from "@parcelis/db";
import { getOutboxEventJobId, getRedisConnectionOptions, notificationEmailJobName, queueNames } from "@parcelis/jobs";
import { Queue, QueueEvents, Worker } from "bullmq";
import { createOutboxTestSchema, validateOutboxTestDatabaseUrl } from "../../../../scripts/outbox-test-database.mjs";
import { dispatchOutboxEvent, reconcileDispatchedNotificationJobs } from "../outbox-dispatcher.js";
import { processQueuedNotificationEmail } from "../processors/notification-email.processor.js";

const redisUrl = process.env.OUTBOX_TEST_REDIS_URL;
const databaseUrl = process.env.OUTBOX_TEST_DATABASE_URL;

if (databaseUrl) validateOutboxTestDatabaseUrl(databaseUrl, process.env.DATABASE_URL);

test("restores a dispatched email job lost from Redis without adding a duplicate", { skip: !redisUrl }, async () => {
  const event = {
    id: 24701,
    createdAt: new Date(),
    organizationId: 7,
    eventType: "notification.email",
    schemaVersion: 1,
    payload: {
      organizationId: 7,
      recipientId: 12,
      recipientType: "user",
      email: "person@example.com",
      subject: "Verify your Parcelis email",
      body: "Verification link",
    },
  };
  const prisma = {
    notificationDelivery: {
      findMany: async ({
        where,
      }: {
        where: { id: { gt: number }; status: { in: string[] }; outboxEvent: { is: { status: string } } };
      }) => {
        assert.deepEqual(where.status.in, ["queued", "sending"]);
        assert.equal(where.outboxEvent.is.status, "dispatched");
        return where.id.gt === 0 ? [{ id: 1, status: "queued", providerMessageId: null, outboxEvent: event }] : [];
      },
    },
  } as unknown as PrismaClient;
  const queue = new Queue(`parcelis-notification-recovery-test-${randomUUID()}`, {
    connection: getRedisConnectionOptions({ REDIS_URL: redisUrl }),
  });
  const queues = new Map([[queueNames.accountNotifications, queue]]);
  const jobId = getOutboxEventJobId(event.id);
  const jobData = {
    organizationId: event.organizationId,
    outboxEventId: event.id,
    outboxEventCreatedAt: event.createdAt.toISOString(),
  };
  const addJob = queue.add.bind(queue);
  let addCalls = 0;
  queue.add = ((...args: Parameters<typeof queue.add>) => {
    addCalls++;
    return addJob(...args);
  }) as typeof queue.add;

  try {
    await queue.add(notificationEmailJobName, { ...event.payload, outboxEventId: event.id }, { jobId });
    await reconcileDispatchedNotificationJobs(prisma, queues);
    assert.equal(addCalls, 1);
    const original = await queue.getJob(jobId);
    assert.ok(original);
    assert.deepEqual(original.data, jobData);
    await original.remove();
    assert.equal(await queue.getJob(jobId), undefined);

    await reconcileDispatchedNotificationJobs(prisma, queues);
    const restored = await queue.getJob(jobId);
    assert.ok(restored);
    assert.equal(restored.name, notificationEmailJobName);
    assert.deepEqual(restored.data, jobData);
    assert.equal(addCalls, 2);

    await reconcileDispatchedNotificationJobs(prisma, queues);
    assert.equal(addCalls, 2);
    const waiting = await queue.getJobs(["waiting"]);
    assert.deepEqual(
      waiting.map((job) => job.id),
      [jobId],
    );
  } finally {
    try {
      await queue.obliterate({ force: true });
    } finally {
      await queue.close();
    }
  }
});

test(
  "delivers an account email after an SMTP failure and worker restart without storing its token in Redis",
  { skip: !redisUrl || !databaseUrl, timeout: 60_000 },
  async (t) => {
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createOutboxTestSchema(admin, databaseUrl!).catch(async (error) => {
      await admin.$disconnect();
      throw error;
    });
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
    });
    t.after(async () => {
      try {
        await prisma.$disconnect();
        await isolated.cleanup();
      } finally {
        await admin.$disconnect();
      }
    });

    const token = randomUUID();
    const url = `https://parcelis.example/login?mode=reset#token=${token}`;
    const accepted: string[] = [];
    let rejectNext = true;
    const smtp = createServer((socket) => {
      const lines = createInterface({ input: socket, crlfDelay: Infinity });
      let message: string[] | undefined;
      socket.write("220 localhost SMTP test server\r\n");
      lines.on("line", (line) => {
        if (message) {
          if (line !== ".") {
            message.push(line);
            return;
          }
          if (rejectNext) {
            rejectNext = false;
            socket.write(`451 Temporary provider failure ${token}\r\n`);
          } else {
            accepted.push(message.join("\r\n"));
            socket.write("250 Accepted\r\n");
          }
          message = undefined;
        } else if (line === "DATA") {
          message = [];
          socket.write("354 End with <CRLF>.<CRLF>\r\n");
        } else if (line === "QUIT") {
          socket.end("221 Goodbye\r\n");
        } else {
          socket.write("250 localhost\r\n");
        }
      });
    });
    smtp.listen(0, "127.0.0.1");
    await once(smtp, "listening");
    t.after(() => new Promise<void>((resolve) => smtp.close(() => resolve())));
    const address = smtp.address();
    assert.ok(address && typeof address !== "string");

    const organization = await prisma.organization.create({
      data: { name: "Recovery Test", slug: "recovery-test" },
    });
    await prisma.organizationEmailSettings.create({
      data: {
        organizationId: organization.id,
        host: "127.0.0.1",
        port: address.port,
        fromEmail: "sender@example.com",
        requireSignIn: false,
        securityType: "none",
      },
    });
    const payload = {
      organizationId: organization.id,
      recipientId: 1,
      recipientType: "user",
      email: "person@example.com",
      subject: "Reset your Parcelis password",
      body: `Reset your password: ${url}`,
      template: { kind: "password-reset", url },
    };
    const event = await prisma.$transaction(async (tx) => {
      const outboxEvent = await recordOutboxEvent(tx, {
        organizationId: organization.id,
        eventType: "notification.email",
        schemaVersion: 1,
        payload,
        idempotencyKey: "password-reset-test",
      });
      await recordNotificationDeliveryQueued(tx, {
        organizationId: organization.id,
        outboxEventId: outboxEvent.id,
        channel: "email",
        recipientId: payload.recipientId,
        recipientType: payload.recipientType,
        destination: payload.email,
        subject: payload.subject,
        idempotencyKey: "password-reset-test",
      });
      return outboxEvent;
    });

    const name = `parcelis-account-email-test-${randomUUID()}`;
    const connection = getRedisConnectionOptions({ REDIS_URL: redisUrl });
    const queue = new Queue(name, { connection });
    const events = new QueueEvents(name, { connection });
    const queues = new Map([[queueNames.accountNotifications, queue]]);
    let worker: Worker | undefined;
    t.after(async () => {
      try {
        await worker?.close();
        await queue.obliterate({ force: true });
      } finally {
        await Promise.all([events.close(), queue.close()]);
      }
    });

    const jobId = getOutboxEventJobId(event.id);
    const [claimed] = await claimAvailableOutboxEvents(prisma);
    assert.ok(claimed);
    await dispatchOutboxEvent(prisma, queues, claimed);
    const expected = {
      organizationId: organization.id,
      outboxEventId: event.id,
      outboxEventCreatedAt: event.createdAt.toISOString(),
    };
    assert.deepEqual((await queue.getJob(jobId))?.data, expected);
    await events.waitUntilReady();
    worker = new Worker(name, (job) => processQueuedNotificationEmail(prisma, job), { connection });
    await once(worker, "failed");
    await worker.close();
    const firstAttempt = await queue.getJob(jobId);
    assert.ok(firstAttempt);
    assert.equal(firstAttempt.attemptsMade, 1);
    assert.deepEqual(firstAttempt.data, expected);
    assert.ok(!JSON.stringify([firstAttempt.failedReason, firstAttempt.stacktrace]).includes(token));
    const retrying = await prisma.notificationDelivery.findUniqueOrThrow({ where: { outboxEventId: event.id } });
    assert.equal(retrying.status, "queued");
    assert.equal(retrying.attemptCount, 1);
    assert.equal(retrying.lastError, "Temporary email delivery failure.");

    await firstAttempt.remove();
    await reconcileDispatchedNotificationJobs(prisma, queues);
    await reconcileDispatchedNotificationJobs(prisma, queues);
    assert.deepEqual(
      (await queue.getJobs(["waiting"])).map((job) => job.id),
      [jobId],
    );
    const restored = await queue.getJob(jobId);
    assert.ok(restored);
    assert.deepEqual(restored.data, expected);
    worker = new Worker(name, (job) => processQueuedNotificationEmail(prisma, job), { connection });
    await restored.waitUntilFinished(events, 10_000);
    const sent = await prisma.notificationDelivery.findUniqueOrThrow({ where: { outboxEventId: event.id } });
    assert.equal(sent.status, "sent");
    assert.equal(sent.attemptCount, 2);
    assert.equal(sent.lastError, null);
    assert.deepEqual((await queue.getJob(jobId))?.data, { ...expected, acceptedMessageId: sent.providerMessageId });
    assert.equal(accepted.length, 1);
    assert.ok(accepted[0]?.replaceAll("=\r\n", "").includes(token));
  },
);
