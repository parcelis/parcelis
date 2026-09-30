import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { PrismaClient } from "@parcelis/db";
import { getOutboxEventJobId, getRedisConnectionOptions, notificationEmailJobName, queueNames } from "@parcelis/jobs";
import { Queue } from "bullmq";
import { reconcileDispatchedNotificationJobs } from "../outbox-dispatcher.js";

const redisUrl = process.env.OUTBOX_TEST_REDIS_URL;

test("restores a dispatched email job lost from Redis without adding a duplicate", { skip: !redisUrl }, async () => {
  const event = {
    id: 24701,
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
  const jobData = { ...event.payload, outboxEventId: event.id };
  const addJob = queue.add.bind(queue);
  let addCalls = 0;
  queue.add = ((...args: Parameters<typeof queue.add>) => {
    addCalls++;
    return addJob(...args);
  }) as typeof queue.add;

  try {
    await queue.add(notificationEmailJobName, jobData, { jobId });
    const original = await queue.getJob(jobId);
    assert.ok(original);
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
