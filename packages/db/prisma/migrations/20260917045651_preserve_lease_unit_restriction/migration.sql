-- DropForeignKey
ALTER TABLE "Lease" DROP CONSTRAINT "Lease_propertyId_unitId_fkey";

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_propertyId_unitId_fkey" FOREIGN KEY ("propertyId", "unitId") REFERENCES "Unit"("propertyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
