import type { Prisma } from "@prisma/client";

const utilityTypes = ["Electricity", "Water", "Sewer", "Gas", "Internet"] as const;
const amenityTypes = [
  "A/C",
  "Off-Street Parking",
  "On-Street Parking",
  "Pool",
  "Furnished",
  "Balcony/Deck",
  "Hardwood Floor",
  "Tile Floor",
  "Carpet",
  "Pets Allowed",
  "Wheelchair Access",
] as const;
const propertyTags = [
  "Commercial",
  "HOA",
  "Industrial",
  "Manufactured Home",
  "Office",
  "Other",
  "Parking",
  "Residential",
  "Retail",
  "Senior Living",
  "Storage",
  "Student Housing",
] as const;
const maintenanceCategories = [
  "A/C",
  "Appliance",
  "Plumbing",
  "Electrical",
  "Heat",
  "Kitchen",
  "Other",
  "Pest Control",
  "Bathroom",
  "Exterior",
] as const;
const applicationStatusLabels = [
  "For Review",
  "Pending",
  "Approved",
  "Lease Created",
  "Rejected",
  "Declined",
  "Expired",
] as const;

type BootstrapClient = {
  invoiceCharge: Prisma.TransactionClient["invoiceCharge"];
  utilityType?: Prisma.TransactionClient["utilityType"];
  amenityType?: Prisma.TransactionClient["amenityType"];
  tag?: Prisma.TransactionClient["tag"];
  maintenanceCategory?: Prisma.TransactionClient["maintenanceCategory"];
  applicationStatus?: Prisma.TransactionClient["applicationStatus"];
};

export async function seedOrganizationBootstrapData(prisma: BootstrapClient, organizationId: number) {
  const defaultInvoiceCharge =
    (typeof prisma.invoiceCharge.findFirst === "function"
      ? await prisma.invoiceCharge.findFirst({ where: { organizationId, isDefault: true } })
      : null) ??
    (await prisma.invoiceCharge.create({
      data: {
        organizationId,
        name: "Rent",
        description: "Monthly rent for {month} {year}",
        isDefault: true,
      },
    }));

  for (const [index, label] of utilityTypes.entries()) {
    await prisma.utilityType?.upsert({
      where: { organizationId_label: { organizationId, label } },
      update: { sortOrder: (index + 1) * 10 },
      create: { organizationId, label, sortOrder: (index + 1) * 10 },
    });
  }

  for (const [index, label] of amenityTypes.entries()) {
    await prisma.amenityType?.upsert({
      where: { organizationId_label: { organizationId, label } },
      update: { sortOrder: (index + 1) * 10 },
      create: { organizationId, label, sortOrder: (index + 1) * 10 },
    });
  }

  for (const [index, label] of propertyTags.entries()) {
    await prisma.tag?.upsert({
      where: { organizationId_label: { organizationId, label } },
      update: { sortOrder: (index + 1) * 10 },
      create: { organizationId, label, sortOrder: (index + 1) * 10 },
    });
  }

  if (prisma.maintenanceCategory) {
    await Promise.all(
      maintenanceCategories.map((label, sortOrder) =>
        prisma.maintenanceCategory!.upsert({
          where: { organizationId_label: { organizationId, label } },
          update: { sortOrder },
          create: { organizationId, label, sortOrder },
        }),
      ),
    );
  }

  const applicationStatuses = prisma.applicationStatus
    ? await Promise.all(
        applicationStatusLabels.map((label, sortOrder) =>
          prisma.applicationStatus!.upsert({
            where: { organizationId_label: { organizationId, label } },
            update: { sortOrder },
            create: { organizationId, label, sortOrder },
          }),
        ),
      )
    : [];
  const applicationStatusByLabel = Object.fromEntries(applicationStatuses.map((status) => [status.label, status]));

  return { defaultInvoiceCharge, applicationStatusByLabel };
}
