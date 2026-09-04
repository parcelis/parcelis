CREATE TABLE "OrganizationEmailSettings" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "host" TEXT NOT NULL,
    "securityType" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "requireSignIn" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT,
    "passwordCipher" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationEmailSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationEmailSettings_organizationId_key" ON "OrganizationEmailSettings"("organizationId");

ALTER TABLE "OrganizationEmailSettings"
ADD CONSTRAINT "OrganizationEmailSettings_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
