-- DropIndex
DROP INDEX "OutboxEvent_organizationId_status_createdAt_idx";

-- CreateIndex
CREATE INDEX "OutboxEvent_organizationId_status_failedAt_id_idx" ON "OutboxEvent"("organizationId", "status", "failedAt", "id");
