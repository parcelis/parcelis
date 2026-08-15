ALTER TABLE "Organization" ADD COLUMN "seedKey" TEXT;

CREATE UNIQUE INDEX "Organization_seedKey_key" ON "Organization"("seedKey");

UPDATE "Organization"
SET "seedKey" = 'parcelis-demo'
FROM "User"
WHERE "User"."email" = 'admin@parcelis.dev'
  AND "User"."defaultOrganizationId" = "Organization"."id";
