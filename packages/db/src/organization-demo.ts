import type { Prisma } from "@prisma/client";

type DemoClient = Pick<
  Prisma.TransactionClient,
  "property" | "unit" | "tenant" | "lease" | "leaseTenant" | "invoice"
>;

type SeedOrganizationDemoDataInput = {
  organizationId: number;
  defaultInvoiceChargeId: number;
};

export async function seedOrganizationDemoData(
  prisma: DemoClient,
  { organizationId, defaultInvoiceChargeId }: SeedOrganizationDemoDataInput,
) {
  const propertyName = "Starter Demo Property";
  const unitName = "1A";
  const tenantEmail = `demo-tenant+${organizationId}@parcelis.dev`;

  const propertyExisting = await prisma.property.findFirst({
    where: { organizationId, name: propertyName },
    select: { id: true },
  });
  const property = propertyExisting
    ? await prisma.property.update({
        where: { id: propertyExisting.id },
        data: {
          line1: "100 Demo Lane",
          city: "Nashville",
          region: "TN",
          postalCode: "37201",
          propertyType: "Apartment",
          contactName: "Demo Operations",
          contactEmail: "ops@parcelis.dev",
          contactPhone: "615-555-0100",
          contactAddress: "100 Demo Lane, Nashville, TN 37201",
          unitCount: 1,
          occupiedUnits: 1,
          status: "active",
        },
      })
    : await prisma.property.create({
        data: {
          organizationId,
          name: propertyName,
          line1: "100 Demo Lane",
          city: "Nashville",
          region: "TN",
          postalCode: "37201",
          propertyType: "Apartment",
          contactName: "Demo Operations",
          contactEmail: "ops@parcelis.dev",
          contactPhone: "615-555-0100",
          contactAddress: "100 Demo Lane, Nashville, TN 37201",
          unitCount: 1,
          occupiedUnits: 1,
          status: "active",
        },
      });

  const unit = await prisma.unit.upsert({
    where: {
      propertyId_name: {
        propertyId: property.id,
        name: unitName,
      },
    },
    update: {
      marketRateCents: 165000,
      unitType: "residential",
      bedrooms: 1,
      bathrooms: "1.0",
      squareFeet: 650,
      archivedAt: null,
    },
    create: {
      propertyId: property.id,
      name: unitName,
      marketRateCents: 165000,
      unitType: "residential",
      bedrooms: 1,
      bathrooms: "1.0",
      squareFeet: 650,
    },
  });

  const tenant = await prisma.tenant.upsert({
    where: { organizationId_email: { organizationId, email: tenantEmail } },
    update: {
      firstName: "Demo",
      lastName: "Tenant",
      phone: "615-555-0101",
      accountStatus: "invitation_pending",
      insuranceStatus: "not_on_file",
      archivedAt: null,
    },
    create: {
      organizationId,
      firstName: "Demo",
      lastName: "Tenant",
      email: tenantEmail,
      phone: "615-555-0101",
      accountStatus: "invitation_pending",
      insuranceStatus: "not_on_file",
    },
  });

  const startsOn = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const endsOn = new Date(Date.UTC(startsOn.getUTCFullYear() + 1, startsOn.getUTCMonth(), 0));

  const leaseExisting = await prisma.lease.findFirst({
    where: { organizationId, propertyId: property.id, unitId: unit.id },
    select: { id: true },
  });
  const lease = leaseExisting
    ? await prisma.lease.update({
        where: { id: leaseExisting.id },
        data: {
          monthlyRentCents: 165000,
          rentChargeId: defaultInvoiceChargeId,
          startsOn,
          endsOn,
          status: "active",
        },
      })
    : await prisma.lease.create({
        data: {
          organizationId,
          propertyId: property.id,
          unitId: unit.id,
          monthlyRentCents: 165000,
          rentChargeId: defaultInvoiceChargeId,
          startsOn,
          endsOn,
          status: "active",
        },
      });

  await prisma.leaseTenant.upsert({
    where: {
      organizationId_leaseId_tenantId: {
        organizationId,
        leaseId: lease.id,
        tenantId: tenant.id,
      },
    },
    update: {},
    create: {
      organizationId,
      leaseId: lease.id,
      tenantId: tenant.id,
    },
  });

  const periodStartsOn = startsOn;
  const periodEndsOn = new Date(Date.UTC(startsOn.getUTCFullYear(), startsOn.getUTCMonth() + 1, 0));
  await prisma.invoice.upsert({
    where: {
      leaseId_tenantId_periodStartsOn: {
        leaseId: lease.id,
        tenantId: tenant.id,
        periodStartsOn,
      },
    },
    update: {
      propertyId: property.id,
      amountCents: 165000,
      balanceCents: 165000,
      status: "open",
      dueOn: periodStartsOn,
      periodEndsOn,
    },
    create: {
      organizationId,
      leaseId: lease.id,
      propertyId: property.id,
      tenantId: tenant.id,
      periodStartsOn,
      periodEndsOn,
      dueOn: periodStartsOn,
      amountCents: 165000,
      balanceCents: 165000,
      status: "open",
    },
  });
}
