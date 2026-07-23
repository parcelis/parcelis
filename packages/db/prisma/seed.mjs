import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const properties = [
  {
    name: "Hawthorne Flats",
    line1: "1208 Hawthorne Ave",
    city: "Nashville",
    region: "TN",
    postalCode: "37212",
    propertyType: "Apartment",
    contactName: "Avery Mitchell",
    contactEmail: "avery.mitchell@hawthorneflats.example",
    contactPhone: "615-555-0194",
    contactAddress: "1208 Hawthorne Ave, Suite 100, Nashville, TN 37212",
    unitCount: 48,
    occupiedUnits: 45,
    status: "active",
  },
  {
    name: "Mariner Court",
    line1: "44 East Bay Street",
    city: "Charleston",
    region: "SC",
    postalCode: "29401",
    propertyType: "Condo",
    contactName: "Jordan Reyes",
    contactEmail: "jordan.reyes@marinercourt.example",
    contactPhone: "843-555-0127",
    contactAddress: "44 East Bay Street, Office 2, Charleston, SC 29401",
    unitCount: 26,
    occupiedUnits: 22,
    status: "leasing",
  },
  {
    name: "Juniper Row",
    line1: "711 Juniper Lane",
    city: "Austin",
    region: "TX",
    postalCode: "78704",
    propertyType: "Mixed-Use",
    contactName: "Priya Shah",
    contactEmail: "priya.shah@juniperrow.example",
    contactPhone: "512-555-0169",
    contactAddress: "711 Juniper Lane, Leasing Desk, Austin, TX 78704",
    unitCount: 34,
    occupiedUnits: 33,
    status: "maintenance",
  },
];

const rentIncludeOptions = ["Electricity", "Water", "Sewer", "Gas", "Internet"];
const amenityOptions = [
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
];

function getDemoUnitNames(property, leaseLabels) {
  const names = [...new Set(leaseLabels.filter(Boolean))];
  let index = 1;

  while (names.length < property.unitCount) {
    const nextName = String(index);
    if (!names.includes(nextName)) {
      names.push(nextName);
    }
    index += 1;
  }

  return names.slice(0, property.unitCount);
}

function getDemoUnitDetails(property, unitName, index, leaseRentCents) {
  const isCommercial =
    property.propertyType === "Commercial" ||
    (property.propertyType === "Mixed-Use" && index % 5 === 0);
  const bedroomCycle = [0, 1, 1, 2, 2, 3];
  const bedrooms = isCommercial
    ? null
    : bedroomCycle[index % bedroomCycle.length];
  const bathrooms = isCommercial
    ? 1
    : bedrooms === 0
      ? 1
      : bedrooms >= 3
        ? 2
        : 1.5;
  const squareFeet = isCommercial
    ? 950 + (index % 4) * 175
    : 525 + (bedrooms ?? 0) * 225 + (index % 3) * 35;
  const baseRentCents = isCommercial
    ? 285000
    : 145000 + (bedrooms ?? 0) * 35000 + (index % 4) * 7500;

  return {
    name: unitName,
    marketRateCents: leaseRentCents ?? baseRentCents,
    unitType: isCommercial ? "commercial" : "residential",
    bedrooms,
    bathrooms,
    squareFeet,
  };
}

async function seedUnitsForProperty(property) {
  const leases = await prisma.lease.findMany({
    where: { propertyId: property.id },
    select: {
      monthlyRentCents: true,
      unitLabel: true,
    },
  });
  const leaseRentByUnit = new Map(
    leases.map((lease) => [lease.unitLabel, lease.monthlyRentCents]),
  );
  const unitNames = getDemoUnitNames(
    property,
    leases.map((lease) => lease.unitLabel),
  );

  await prisma.unit.deleteMany({
    where: {
      propertyId: property.id,
      name: { notIn: unitNames },
    },
  });

  for (const [index, unitName] of unitNames.entries()) {
    const unitDetails = getDemoUnitDetails(
      property,
      unitName,
      index,
      leaseRentByUnit.get(unitName),
    );
    const unit = await prisma.unit.upsert({
      where: {
        propertyId_name: {
          propertyId: property.id,
          name: unitName,
        },
      },
      update: unitDetails,
      create: {
        propertyId: property.id,
        ...unitDetails,
      },
    });

    const rentIncludeLabels = index % 3 === 0 ? ["Water", "Sewer"] : [];
    const amenityLabels = [
      index % 2 === 0 ? "A/C" : null,
      index % 4 === 0 ? "Off-Street Parking" : null,
      index % 6 === 0 ? "Balcony/Deck" : null,
      index % 7 === 0 ? "Pets Allowed" : null,
    ].filter(Boolean);
    const [rentIncludes, amenities] = await Promise.all([
      prisma.rentIncludeOption.findMany({
        where: { label: { in: rentIncludeLabels } },
        select: { id: true },
      }),
      prisma.amenityOption.findMany({
        where: { label: { in: amenityLabels } },
        select: { id: true },
      }),
    ]);

    await Promise.all([
      prisma.unitRentInclude.deleteMany({ where: { unitId: unit.id } }),
      prisma.unitAmenity.deleteMany({ where: { unitId: unit.id } }),
    ]);

    await Promise.all([
      rentIncludes.length
        ? prisma.unitRentInclude.createMany({
            data: rentIncludes.map((option) => ({
              optionId: option.id,
              unitId: unit.id,
            })),
            skipDuplicates: true,
          })
        : Promise.resolve(),
      amenities.length
        ? prisma.unitAmenity.createMany({
            data: amenities.map((option) => ({
              optionId: option.id,
              unitId: unit.id,
            })),
            skipDuplicates: true,
          })
        : Promise.resolve(),
    ]);
  }
}

async function main() {
  for (const [index, label] of rentIncludeOptions.entries()) {
    await prisma.rentIncludeOption.upsert({
      where: { label },
      update: { sortOrder: (index + 1) * 10 },
      create: { label, sortOrder: (index + 1) * 10 },
    });
  }

  for (const [index, label] of amenityOptions.entries()) {
    await prisma.amenityOption.upsert({
      where: { label },
      update: { sortOrder: (index + 1) * 10 },
      create: { label, sortOrder: (index + 1) * 10 },
    });
  }

  for (const property of properties) {
    const existing = await prisma.property.findFirst({
      where: { name: property.name },
    });

    if (existing) {
      await prisma.property.update({
        where: { id: existing.id },
        data: property,
      });
    } else {
      await prisma.property.create({
        data: property,
      });
    }
  }

  const hawthorne = await prisma.property.findFirstOrThrow({
    where: { name: "Hawthorne Flats" },
  });
  const mariner = await prisma.property.findFirstOrThrow({
    where: { name: "Mariner Court" },
  });
  const juniper = await prisma.property.findFirstOrThrow({
    where: { name: "Juniper Row" },
  });

  const tenant = await prisma.tenant.upsert({
    where: { email: "maya.ellis@example.com" },
    update: {
      firstName: "Maya",
      lastName: "Ellis",
      phone: "615-555-0148",
    },
    create: {
      firstName: "Maya",
      lastName: "Ellis",
      email: "maya.ellis@example.com",
      phone: "615-555-0148",
    },
  });
  const secondTenant = await prisma.tenant.upsert({
    where: { email: "calvin.brooks@example.com" },
    update: {
      firstName: "Calvin",
      lastName: "Brooks",
      phone: "843-555-0182",
    },
    create: {
      firstName: "Calvin",
      lastName: "Brooks",
      email: "calvin.brooks@example.com",
      phone: "843-555-0182",
    },
  });
  const thirdTenant = await prisma.tenant.upsert({
    where: { email: "nora.patel@example.com" },
    update: {
      firstName: "Nora",
      lastName: "Patel",
      phone: "512-555-0135",
    },
    create: {
      firstName: "Nora",
      lastName: "Patel",
      email: "nora.patel@example.com",
      phone: "512-555-0135",
    },
  });

  await prisma.lease.upsert({
    where: { id: "11111111-1111-4111-8111-111111111111" },
    update: {
      propertyId: hawthorne.id,
      tenantId: tenant.id,
      unitLabel: "4B",
      monthlyRentCents: 184500,
      amountOverdueCents: 0,
      startsOn: new Date("2026-02-01"),
      endsOn: new Date("2027-01-31"),
      status: "active",
    },
    create: {
      id: "11111111-1111-4111-8111-111111111111",
      propertyId: hawthorne.id,
      tenantId: tenant.id,
      unitLabel: "4B",
      monthlyRentCents: 184500,
      amountOverdueCents: 0,
      startsOn: new Date("2026-02-01"),
      endsOn: new Date("2027-01-31"),
      status: "active",
    },
  });

  await prisma.lease.upsert({
    where: { id: "22222222-2222-4222-8222-222222222222" },
    update: {
      propertyId: mariner.id,
      tenantId: secondTenant.id,
      unitLabel: "2A",
      monthlyRentCents: 216000,
      amountOverdueCents: 82500,
      startsOn: new Date("2025-10-01"),
      endsOn: new Date("2026-09-15"),
      status: "active",
    },
    create: {
      id: "22222222-2222-4222-8222-222222222222",
      propertyId: mariner.id,
      tenantId: secondTenant.id,
      unitLabel: "2A",
      monthlyRentCents: 216000,
      amountOverdueCents: 82500,
      startsOn: new Date("2025-10-01"),
      endsOn: new Date("2026-09-15"),
      status: "active",
    },
  });

  await prisma.lease.upsert({
    where: { id: "33333333-3333-4333-8333-333333333333" },
    update: {
      propertyId: juniper.id,
      tenantId: thirdTenant.id,
      unitLabel: "7C",
      monthlyRentCents: 239500,
      amountOverdueCents: 125000,
      startsOn: new Date("2025-09-01"),
      endsOn: new Date("2026-08-20"),
      status: "notice",
    },
    create: {
      id: "33333333-3333-4333-8333-333333333333",
      propertyId: juniper.id,
      tenantId: thirdTenant.id,
      unitLabel: "7C",
      monthlyRentCents: 239500,
      amountOverdueCents: 125000,
      startsOn: new Date("2025-09-01"),
      endsOn: new Date("2026-08-20"),
      status: "notice",
    },
  });

  await Promise.all([
    seedUnitsForProperty(hawthorne),
    seedUnitsForProperty(mariner),
    seedUnitsForProperty(juniper),
  ]);

  const tickets = [
    {
      id: "44444444-4444-4444-8444-444444444444",
      propertyId: hawthorne.id,
      unitLabel: null,
      title: "Replace lobby entry sensor",
      description: "Intermittent access sensor failure reported by residents.",
      status: "in_progress",
      priority: "medium",
      openedOn: new Date("2026-07-08"),
      dueOn: new Date("2026-07-24"),
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      propertyId: mariner.id,
      unitLabel: "2A",
      title: "Unit 2A water heater inspection",
      description: "Tenant reports inconsistent hot water.",
      status: "open",
      priority: "high",
      openedOn: new Date("2026-07-16"),
      dueOn: new Date("2026-07-21"),
    },
    {
      id: "66666666-6666-4666-8666-666666666666",
      propertyId: juniper.id,
      unitLabel: null,
      title: "Common area lighting replacement",
      description: "Replace fixtures near rear stairwell.",
      status: "waiting_vendor",
      priority: "urgent",
      openedOn: new Date("2026-07-12"),
      dueOn: new Date("2026-07-20"),
    },
  ];

  for (const ticket of tickets) {
    await prisma.maintenanceTicket.upsert({
      where: { id: ticket.id },
      update: ticket,
      create: ticket,
    });
  }
}

main()
  .then(async () => {
    console.log("Seeded Parcelis demo data.");
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
