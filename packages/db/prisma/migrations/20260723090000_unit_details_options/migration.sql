-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('residential', 'commercial');

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketRateCents" INTEGER NOT NULL,
    "unitType" "UnitType" NOT NULL DEFAULT 'residential',
    "bedrooms" INTEGER,
    "bathrooms" DECIMAL(4,1),
    "squareFeet" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentIncludeOption" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentIncludeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmenityOption" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmenityOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitRentInclude" (
    "unitId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "UnitRentInclude_pkey" PRIMARY KEY ("unitId","optionId")
);

-- CreateTable
CREATE TABLE "UnitAmenity" (
    "unitId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "UnitAmenity_pkey" PRIMARY KEY ("unitId","optionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Unit_propertyId_name_key" ON "Unit"("propertyId", "name");

-- CreateIndex
CREATE INDEX "Unit_propertyId_idx" ON "Unit"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "RentIncludeOption_label_key" ON "RentIncludeOption"("label");

-- CreateIndex
CREATE UNIQUE INDEX "AmenityOption_label_key" ON "AmenityOption"("label");

-- CreateIndex
CREATE INDEX "UnitRentInclude_optionId_idx" ON "UnitRentInclude"("optionId");

-- CreateIndex
CREATE INDEX "UnitAmenity_optionId_idx" ON "UnitAmenity"("optionId");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitRentInclude" ADD CONSTRAINT "UnitRentInclude_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitRentInclude" ADD CONSTRAINT "UnitRentInclude_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "RentIncludeOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitAmenity" ADD CONSTRAINT "UnitAmenity_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitAmenity" ADD CONSTRAINT "UnitAmenity_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AmenityOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "RentIncludeOption" ("id", "label", "sortOrder", "updatedAt") VALUES
  ('11111111-1111-4111-9111-111111111111', 'Electricity', 10, CURRENT_TIMESTAMP),
  ('22222222-2222-4222-9222-222222222222', 'Water', 20, CURRENT_TIMESTAMP),
  ('33333333-3333-4333-9333-333333333333', 'Sewer', 30, CURRENT_TIMESTAMP),
  ('44444444-4444-4444-9444-444444444444', 'Gas', 40, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-9555-555555555555', 'Internet', 50, CURRENT_TIMESTAMP);

INSERT INTO "AmenityOption" ("id", "label", "sortOrder", "updatedAt") VALUES
  ('66666666-6666-4666-9666-666666666666', 'A/C', 10, CURRENT_TIMESTAMP),
  ('77777777-7777-4777-9777-777777777777', 'Off-Street Parking', 20, CURRENT_TIMESTAMP),
  ('88888888-8888-4888-9888-888888888888', 'On-Street Parking', 30, CURRENT_TIMESTAMP),
  ('99999999-9999-4999-9999-999999999999', 'Pool', 40, CURRENT_TIMESTAMP),
  ('aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa', 'Furnished', 50, CURRENT_TIMESTAMP),
  ('bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb', 'Balcony/Deck', 60, CURRENT_TIMESTAMP),
  ('cccccccc-cccc-4ccc-9ccc-cccccccccccc', 'Hardwood Floor', 70, CURRENT_TIMESTAMP),
  ('dddddddd-dddd-4ddd-9ddd-dddddddddddd', 'Tile Floor', 80, CURRENT_TIMESTAMP),
  ('eeeeeeee-eeee-4eee-9eee-eeeeeeeeeeee', 'Carpet', 90, CURRENT_TIMESTAMP),
  ('ffffffff-ffff-4fff-9fff-ffffffffffff', 'Pets Allowed', 100, CURRENT_TIMESTAMP),
  ('12121212-1212-4212-9212-121212121212', 'Wheelchair Access', 110, CURRENT_TIMESTAMP);
