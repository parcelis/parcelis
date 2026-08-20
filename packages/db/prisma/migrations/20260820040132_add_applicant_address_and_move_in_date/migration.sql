-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "region" TEXT;

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "requestedMoveInDate" TIMESTAMP(3);
