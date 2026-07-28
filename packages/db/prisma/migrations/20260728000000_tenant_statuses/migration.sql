CREATE TYPE "TenantAccountStatus" AS ENUM ('activated', 'invitation_pending', 'disabled');
CREATE TYPE "TenantInsuranceStatus" AS ENUM ('active', 'expired', 'not_on_file');

ALTER TABLE "Tenant"
  ADD COLUMN "accountStatus" "TenantAccountStatus" NOT NULL DEFAULT 'invitation_pending',
  ADD COLUMN "insuranceStatus" "TenantInsuranceStatus" NOT NULL DEFAULT 'not_on_file',
  ADD COLUMN "archivedAt" TIMESTAMP(3);
