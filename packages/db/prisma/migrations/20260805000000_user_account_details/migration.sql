CREATE TYPE "UserRole" AS ENUM ('administrator', 'member');
CREATE TYPE "UserAccountStatus" AS ENUM ('active', 'disabled');

ALTER TABLE "User"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'member',
  ADD COLUMN "accountStatus" "UserAccountStatus" NOT NULL DEFAULT 'active';

UPDATE "User"
SET "role" = 'administrator'
WHERE "email" = 'admin@parcelis.dev';
