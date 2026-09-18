-- CreateEnum
CREATE TYPE "LeaseDraftStep" AS ENUM ('property', 'residents', 'terms', 'review');

-- DropForeignKey
ALTER TABLE "Lease" DROP CONSTRAINT "Lease_propertyId_unitId_fkey";

-- AlterTable
ALTER TABLE "Lease" ADD COLUMN     "draftStep" "LeaseDraftStep" NOT NULL DEFAULT 'property',
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_propertyId_unitId_fkey" FOREIGN KEY ("propertyId", "unitId") REFERENCES "Unit"("propertyId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
