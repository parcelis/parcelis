-- CreateTable ApplicationForm
CREATE TABLE "ApplicationForm" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "draftDefinition" JSONB NOT NULL,
    "activeVersionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable ApplicationFormVersion
CREATE TABLE "ApplicationFormVersion" (
    "id" SERIAL NOT NULL,
    "formId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationFormVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationForm_activeVersionId_key" ON "ApplicationForm"("activeVersionId");

-- CreateIndex
CREATE INDEX "ApplicationForm_organizationId_updatedAt_idx" ON "ApplicationForm"("organizationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationFormVersion_formId_version_key" ON "ApplicationFormVersion"("formId", "version");

-- CreateIndex
CREATE INDEX "ApplicationFormVersion_formId_publishedAt_idx" ON "ApplicationFormVersion"("formId", "publishedAt");

-- AddForeignKey
ALTER TABLE "ApplicationForm" ADD CONSTRAINT "ApplicationForm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationForm" ADD CONSTRAINT "ApplicationForm_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "ApplicationFormVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationFormVersion" ADD CONSTRAINT "ApplicationFormVersion_formId_fkey" FOREIGN KEY ("formId") REFERENCES "ApplicationForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
