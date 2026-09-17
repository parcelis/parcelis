-- CreateEnum
CREATE TYPE "LeaseTermType" AS ENUM ('fixed', 'month_to_month');

-- AlterTable
ALTER TABLE "Lease" ADD COLUMN     "termType" "LeaseTermType";

UPDATE "Lease"
SET "termType" = CASE
  WHEN "endsOn" IS NULL THEN 'month_to_month'::"LeaseTermType"
  ELSE 'fixed'::"LeaseTermType"
END
WHERE "startsOn" IS NOT NULL;
