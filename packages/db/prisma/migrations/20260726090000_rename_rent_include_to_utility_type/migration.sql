ALTER TABLE "RentIncludeOption" RENAME TO "UtilityType";
ALTER TABLE "UnitRentInclude" RENAME TO "UnitUtility";

ALTER TABLE "UtilityType" RENAME CONSTRAINT "RentIncludeOption_pkey" TO "UtilityType_pkey";
ALTER TABLE "UnitUtility" RENAME CONSTRAINT "UnitRentInclude_pkey" TO "UnitUtility_pkey";
ALTER TABLE "UnitUtility" RENAME CONSTRAINT "UnitRentInclude_unitId_fkey" TO "UnitUtility_unitId_fkey";
ALTER TABLE "UnitUtility" RENAME CONSTRAINT "UnitRentInclude_optionId_fkey" TO "UnitUtility_optionId_fkey";

ALTER INDEX "RentIncludeOption_label_key" RENAME TO "UtilityType_label_key";
ALTER INDEX "UnitRentInclude_optionId_idx" RENAME TO "UnitUtility_optionId_idx";
