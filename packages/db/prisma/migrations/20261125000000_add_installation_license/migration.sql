CREATE TABLE "InstallationLicense" (
    "installationId" TEXT NOT NULL,
    "credential" TEXT NOT NULL,
    "signedLicense" TEXT,
    "tier" TEXT,
    "validUntil" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "inactive" BOOLEAN NOT NULL DEFAULT false,
    "operationId" TEXT,
    "operationUntil" TIMESTAMP(3),

    CONSTRAINT "InstallationLicense_pkey" PRIMARY KEY ("installationId")
);

ALTER TABLE "InstallationLicense" ADD CONSTRAINT "InstallationLicense_installationId_fkey"
    FOREIGN KEY ("installationId") REFERENCES "Installation"("installationId") ON DELETE CASCADE ON UPDATE CASCADE;
