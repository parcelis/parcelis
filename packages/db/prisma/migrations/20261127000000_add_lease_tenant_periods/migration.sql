CREATE TABLE "LeaseTenantPeriod" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "leaseId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "assignedOn" TIMESTAMP(3),
    "removedOn" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeaseTenantPeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeaseTenantPeriod_organizationId_leaseId_tenantId_idx"
    ON "LeaseTenantPeriod"("organizationId", "leaseId", "tenantId");

ALTER TABLE "LeaseTenantPeriod" ADD CONSTRAINT "LeaseTenantPeriod_organizationId_leaseId_tenantId_fkey"
    FOREIGN KEY ("organizationId", "leaseId", "tenantId")
    REFERENCES "LeaseTenant"("organizationId", "leaseId", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
