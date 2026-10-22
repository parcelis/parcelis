-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "createdById" INTEGER,
    "createdByLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" INTEGER,
    "revokedByLabel" TEXT,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_organizationId_createdAt_id_idx" ON "ApiToken"("organizationId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
