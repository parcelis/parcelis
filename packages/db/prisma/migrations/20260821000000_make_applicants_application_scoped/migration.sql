-- AlterTable
ALTER TABLE "Application"
ALTER COLUMN "requestedMoveInDate" TYPE DATE USING "requestedMoveInDate"::date;

-- DropIndex
DROP INDEX "Applicant_organizationId_email_key";

-- CreateIndex
CREATE INDEX "Applicant_organizationId_email_idx" ON "Applicant"("organizationId", "email");
