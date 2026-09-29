-- CreateEnum
CREATE TYPE "NotificationDeliveryChannel" AS ENUM ('email');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('queued', 'sending', 'sent', 'failed');

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "outboxEventId" INTEGER NOT NULL,
    "channel" "NotificationDeliveryChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'queued',
    "recipientId" INTEGER NOT NULL,
    "recipientType" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_outboxEventId_key" ON "NotificationDelivery"("outboxEventId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_organizationId_status_createdAt_id_idx" ON "NotificationDelivery"("organizationId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_updatedAt_id_idx" ON "NotificationDelivery"("status", "updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_organizationId_idempotencyKey_key" ON "NotificationDelivery"("organizationId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_outboxEventId_fkey" FOREIGN KEY ("outboxEventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
