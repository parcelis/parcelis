-- AlterTable
ALTER TABLE "Note" ADD COLUMN "applicationId" INTEGER;

-- CreateIndex
CREATE INDEX "Note_applicationId_createdAt_id_idx" ON "Note"("applicationId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
