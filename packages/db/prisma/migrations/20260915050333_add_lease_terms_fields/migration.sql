-- AlterTable
ALTER TABLE "Lease" ADD COLUMN     "continueMonthToMonthAfterEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rentDueDay" INTEGER NOT NULL DEFAULT 1;
