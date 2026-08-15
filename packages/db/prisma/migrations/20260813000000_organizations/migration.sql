CREATE TYPE "OrganizationMemberRole" AS ENUM ('owner', 'administrator', 'member');

CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationMembership" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "OrganizationMembership_userId_organizationId_key" ON "OrganizationMembership"("userId", "organizationId");
CREATE INDEX "OrganizationMembership_organizationId_role_idx" ON "OrganizationMembership"("organizationId", "role");

INSERT INTO "Organization" ("name", "slug", "updatedAt") VALUES ('Default organization', 'default', CURRENT_TIMESTAMP);

INSERT INTO "OrganizationMembership" ("userId", "organizationId", "role", "updatedAt")
SELECT "id", (SELECT "id" FROM "Organization" WHERE "slug" = 'default'),
  CASE WHEN "role" = 'administrator' THEN 'administrator'::"OrganizationMemberRole" ELSE 'member'::"OrganizationMemberRole" END,
  CURRENT_TIMESTAMP
FROM "User";

ALTER TABLE "Session" ADD COLUMN "activeOrganizationId" INTEGER;
UPDATE "Session" SET "activeOrganizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default');

ALTER TABLE "Property" ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "Tag" ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "UtilityType" ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "AmenityType" ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "Tenant" ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "Landlord" ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "MaintenanceCategory" ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "Lease" ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "MaintenanceTicket" ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "ActivityEvent" ADD COLUMN "organizationId" INTEGER;

UPDATE "Property" SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default');
UPDATE "Tag" SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default');
UPDATE "UtilityType" SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default');
UPDATE "AmenityType" SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default');
UPDATE "Tenant" SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default');
UPDATE "Landlord" SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default');
UPDATE "MaintenanceCategory" SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default');
UPDATE "Lease" SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default');
UPDATE "Invoice" SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default');
UPDATE "MaintenanceTicket" SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default');
UPDATE "ActivityEvent" SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default');

ALTER TABLE "Property" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Tag" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "UtilityType" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "AmenityType" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Tenant" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Landlord" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "MaintenanceCategory" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Lease" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "MaintenanceTicket" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ActivityEvent" ALTER COLUMN "organizationId" SET NOT NULL;

CREATE INDEX "Property_organizationId_idx" ON "Property"("organizationId");
CREATE INDEX "Tag_organizationId_idx" ON "Tag"("organizationId");
CREATE INDEX "UtilityType_organizationId_idx" ON "UtilityType"("organizationId");
CREATE INDEX "AmenityType_organizationId_idx" ON "AmenityType"("organizationId");
CREATE INDEX "Tenant_organizationId_idx" ON "Tenant"("organizationId");
CREATE INDEX "Landlord_organizationId_idx" ON "Landlord"("organizationId");
CREATE INDEX "MaintenanceCategory_organizationId_idx" ON "MaintenanceCategory"("organizationId");
CREATE INDEX "Lease_organizationId_idx" ON "Lease"("organizationId");
CREATE INDEX "Invoice_organizationId_idx" ON "Invoice"("organizationId");
CREATE INDEX "MaintenanceTicket_organizationId_idx" ON "MaintenanceTicket"("organizationId");
CREATE INDEX "ActivityEvent_organizationId_createdAt_idx" ON "ActivityEvent"("organizationId", "createdAt");

ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Property" ADD CONSTRAINT "Property_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UtilityType" ADD CONSTRAINT "UtilityType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AmenityType" ADD CONSTRAINT "AmenityType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Landlord" ADD CONSTRAINT "Landlord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceCategory" ADD CONSTRAINT "MaintenanceCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
