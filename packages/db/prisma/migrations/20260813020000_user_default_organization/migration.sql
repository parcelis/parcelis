ALTER TABLE "User" ADD COLUMN "defaultOrganizationId" INTEGER;

UPDATE "User"
SET "defaultOrganizationId" = (
  SELECT "organizationId"
  FROM "OrganizationMembership"
  WHERE "OrganizationMembership"."userId" = "User"."id"
  ORDER BY "createdAt" ASC
  LIMIT 1
);

CREATE INDEX "User_defaultOrganizationId_idx" ON "User"("defaultOrganizationId");

ALTER TABLE "User"
ADD CONSTRAINT "User_defaultOrganizationId_fkey"
FOREIGN KEY ("defaultOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
