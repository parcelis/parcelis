CREATE UNIQUE INDEX "OutboxEvent_organizationId_id_key" ON "OutboxEvent"("organizationId", "id");

CREATE UNIQUE INDEX "NotificationDelivery_organizationId_outboxEventId_key" ON "NotificationDelivery"("organizationId", "outboxEventId");

ALTER TABLE "NotificationDelivery" DROP CONSTRAINT "NotificationDelivery_outboxEventId_fkey";

ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_organizationId_outboxEventId_fkey" FOREIGN KEY ("organizationId", "outboxEventId") REFERENCES "OutboxEvent"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
