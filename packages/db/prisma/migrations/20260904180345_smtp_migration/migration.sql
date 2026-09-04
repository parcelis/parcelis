/*
  Warnings:

  - The values [pending] on the enum `UserAccountStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `EmailVerificationToken` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "UserAccountStatus_new" AS ENUM ('active', 'disabled');
ALTER TABLE "public"."User" ALTER COLUMN "accountStatus" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "accountStatus" TYPE "UserAccountStatus_new" USING ("accountStatus"::text::"UserAccountStatus_new");
ALTER TYPE "UserAccountStatus" RENAME TO "UserAccountStatus_old";
ALTER TYPE "UserAccountStatus_new" RENAME TO "UserAccountStatus";
DROP TYPE "public"."UserAccountStatus_old";
ALTER TABLE "User" ALTER COLUMN "accountStatus" SET DEFAULT 'active';
COMMIT;

-- DropForeignKey
ALTER TABLE "EmailVerificationToken" DROP CONSTRAINT "EmailVerificationToken_userId_fkey";

-- DropTable
DROP TABLE "EmailVerificationToken";
