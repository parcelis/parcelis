import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

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

const utilityTypes = ["Electricity", "Water", "Sewer", "Gas", "Internet"];
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
];
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
    property.propertyType === "Commercial" || (property.propertyType === "Mixed-Use" && index % 5 === 0);
  const bedroomCycle = [0, 1, 1, 2, 2, 3];
  const bedrooms = isCommercial ? null : bedroomCycle[index % bedroomCycle.length];
  const bathrooms = isCommercial ? 1 : bedrooms === 0 ? 1 : bedrooms >= 3 ? 2 : 1.5;
  const squareFeet = isCommercial ? 950 + (index % 4) * 175 : 525 + (bedrooms ?? 0) * 225 + (index % 3) * 35;
  const baseRentCents = isCommercial ? 285000 : 145000 + (bedrooms ?? 0) * 35000 + (index % 4) * 7500;

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
  const leaseRentByUnit = new Map(leases.map((lease) => [lease.unitLabel, lease.monthlyRentCents]));
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
    const unitDetails = getDemoUnitDetails(property, unitName, index, leaseRentByUnit.get(unitName));
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

    const utilityLabels = index % 3 === 0 ? ["Water", "Sewer"] : [];
    const amenityLabels = [
      index % 2 === 0 ? "A/C" : null,
      index % 4 === 0 ? "Off-Street Parking" : null,
      index % 6 === 0 ? "Balcony/Deck" : null,
      index % 7 === 0 ? "Pets Allowed" : null,
    ].filter(Boolean);
    const [utilities, amenities] = await Promise.all([
      prisma.utilityType.findMany({
        where: { label: { in: utilityLabels } },
        select: { id: true },
      }),
      prisma.amenityType.findMany({
        where: { label: { in: amenityLabels } },
        select: { id: true },
      }),
    ]);

    await Promise.all([
      prisma.unitUtility.deleteMany({ where: { unitId: unit.id } }),
      prisma.unitAmenity.deleteMany({ where: { unitId: unit.id } }),
    ]);

    await Promise.all([
      utilities.length
        ? prisma.unitUtility.createMany({
            data: utilities.map((option) => ({
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

async function upsertLease(organizationId, data) {
  const existing = await prisma.lease.findFirst({
    where: { propertyId: data.propertyId, unitLabel: data.unitLabel },
  });

  return existing ? prisma.lease.update({ where: { id: existing.id }, data }) : prisma.lease.create({ data: { ...data, organizationId } });
}

async function seedInvoice({ lease, periodStartsOn, amountCents, balanceCents, payments = [] }) {
  const paidOn = balanceCents === 0 ? (payments.at(-1)?.paidOn ?? periodStartsOn) : null;

  await prisma.invoice.upsert({
    where: { leaseId_periodStartsOn: { leaseId: lease.id, periodStartsOn } },
    update: {},
    create: {
      organizationId: lease.organizationId,
      leaseId: lease.id,
      propertyId: lease.propertyId,
      tenantId: lease.tenantId,
      paidByTenantId: balanceCents === 0 ? lease.tenantId : null,
      periodStartsOn,
      periodEndsOn: new Date(Date.UTC(periodStartsOn.getUTCFullYear(), periodStartsOn.getUTCMonth() + 1, 0)),
      dueOn: periodStartsOn,
      amountCents,
      balanceCents,
      status: balanceCents === 0 ? "paid" : "overdue",
      paidOn,
      paymentMethod: balanceCents === 0 ? (payments.at(-1)?.paymentMethod ?? null) : null,
      items: {
        create: {
          item: "Rent",
          description: `Rent for ${periodStartsOn.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}`,
          rateCents: amountCents,
          amountCents,
        },
      },
      payments: {
        create: payments,
      },
    },
  });
}

async function main() {
  const administratorEmail = "admin@parcelis.dev";
  const organization = await prisma.organization.upsert({
    where: { slug: "default" },
    update: { name: "Parcelis Property Management" },
    create: { name: "Parcelis Property Management", slug: "default" },
  });
  const administrator = await prisma.user.findUnique({ where: { email: administratorEmail } });

  if (administrator) {
    await prisma.user.update({
      where: { id: administrator.id },
      data: { name: "Administrator", role: "administrator" },
    });
  } else {
    const administratorPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!administratorPassword || administratorPassword.length < 12) {
      throw new Error("SEED_ADMIN_PASSWORD must be set to at least 12 characters to create the seed administrator.");
    }

    const passwordHash = await argon2.hash(administratorPassword, {
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
    });
    await prisma.user.create({
      data: { name: "Administrator", email: administratorEmail, passwordHash, role: "administrator" },
    });
  }

  const seededAdministrator = await prisma.user.findUniqueOrThrow({ where: { email: administratorEmail } });
  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: seededAdministrator.id, organizationId: organization.id } },
    update: { role: "owner" },
    create: { userId: seededAdministrator.id, organizationId: organization.id, role: "owner" },
  });
  await prisma.user.update({ where: { id: seededAdministrator.id }, data: { defaultOrganizationId: organization.id } });

  for (const [index, label] of utilityTypes.entries()) {
    await prisma.utilityType.upsert({
      where: { label },
      update: { sortOrder: (index + 1) * 10 },
      create: { organizationId: organization.id, label, sortOrder: (index + 1) * 10 },
    });
  }

  for (const [index, label] of amenityTypes.entries()) {
    await prisma.amenityType.upsert({
      where: { label },
      update: { sortOrder: (index + 1) * 10 },
      create: { organizationId: organization.id, label, sortOrder: (index + 1) * 10 },
    });
  }

  for (const [index, label] of propertyTags.entries()) {
    await prisma.tag.upsert({
      where: { label },
      update: { sortOrder: (index + 1) * 10 },
      create: { organizationId: organization.id, label, sortOrder: (index + 1) * 10 },
    });
  }

  for (const property of properties) {
    const existing = await prisma.property.findFirst({
      where: { name: property.name },
    });

    if (existing) {
      await prisma.property.update({
        where: { id: existing.id },
        data: { ...property, organizationId: organization.id },
      });
    } else {
      await prisma.property.create({
        data: { ...property, organizationId: organization.id },
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
      accountStatus: "activated",
      insuranceStatus: "active",
    },
    create: {
      organizationId: organization.id,
      firstName: "Maya",
      lastName: "Ellis",
      email: "maya.ellis@example.com",
      phone: "615-555-0148",
      accountStatus: "activated",
      insuranceStatus: "active",
    },
  });
  const secondTenant = await prisma.tenant.upsert({
    where: { email: "calvin.brooks@example.com" },
    update: {
      firstName: "Calvin",
      lastName: "Brooks",
      phone: "843-555-0182",
      accountStatus: "invitation_pending",
      insuranceStatus: "not_on_file",
    },
    create: {
      organizationId: organization.id,
      firstName: "Calvin",
      lastName: "Brooks",
      email: "calvin.brooks@example.com",
      phone: "843-555-0182",
      accountStatus: "invitation_pending",
      insuranceStatus: "not_on_file",
    },
  });
  await prisma.emergencyContact.deleteMany({ where: { tenantId: secondTenant.id } });
  await prisma.emergencyContact.create({
    data: {
      tenantId: secondTenant.id,
      firstName: "Denise",
      lastName: "Brooks",
      phone: "843-555-0167",
      isPrimary: true,
    },
  });

  const thirdTenant = await prisma.tenant.upsert({
    where: { email: "nora.patel@example.com" },
    update: {
      firstName: "Nora",
      lastName: "Patel",
      phone: "512-555-0135",
      accountStatus: "activated",
      insuranceStatus: "expired",
    },
    create: {
      organizationId: organization.id,
      firstName: "Nora",
      lastName: "Patel",
      email: "nora.patel@example.com",
      phone: "512-555-0135",
      accountStatus: "activated",
      insuranceStatus: "expired",
    },
  });
  const fourthTenant = await prisma.tenant.upsert({
    where: { email: "elena.morris@example.com" },
    update: {
      firstName: "Elena",
      lastName: "Morris",
      phone: "615-555-0176",
      accountStatus: "activated",
      insuranceStatus: "active",
    },
    create: {
      organizationId: organization.id,
      firstName: "Elena",
      lastName: "Morris",
      email: "elena.morris@example.com",
      phone: "615-555-0176",
      accountStatus: "activated",
      insuranceStatus: "active",
    },
  });
  const pastTenant = await prisma.tenant.upsert({
    where: { email: "darius.wright@example.com" },
    update: {
      firstName: "Darius",
      lastName: "Wright",
      phone: "843-555-0151",
      accountStatus: "activated",
      insuranceStatus: "not_on_file",
      archivedAt: null,
    },
    create: {
      organizationId: organization.id,
      firstName: "Darius",
      lastName: "Wright",
      email: "darius.wright@example.com",
      phone: "843-555-0151",
      accountStatus: "activated",
      insuranceStatus: "not_on_file",
    },
  });
  const archivedTenant = await prisma.tenant.upsert({
    where: { email: "simone.bell@example.com" },
    update: {
      firstName: "Simone",
      lastName: "Bell",
      phone: "615-555-0124",
      accountStatus: "disabled",
      insuranceStatus: "expired",
      archivedAt: new Date("2026-01-15"),
    },
    create: {
      organizationId: organization.id,
      firstName: "Simone",
      lastName: "Bell",
      email: "simone.bell@example.com",
      phone: "615-555-0124",
      accountStatus: "disabled",
      insuranceStatus: "expired",
      archivedAt: new Date("2026-01-15"),
    },
  });

  const [mayaLease, elenaLease, calvinLease, noraLease] = await Promise.all([
    upsertLease(organization.id, {
      propertyId: hawthorne.id,
      tenantId: tenant.id,
      unitLabel: "4B",
      monthlyRentCents: 184500,
      amountOverdueCents: 0,
      startsOn: new Date("2026-02-01"),
      endsOn: new Date("2027-01-31"),
      status: "active",
    }),
    upsertLease(organization.id, {
      propertyId: hawthorne.id,
      tenantId: fourthTenant.id,
      unitLabel: "8A",
      monthlyRentCents: 197500,
      amountOverdueCents: 32500,
      startsOn: new Date("2026-06-01"),
      endsOn: new Date("2027-05-31"),
      status: "active",
    }),
    upsertLease(organization.id, {
      propertyId: mariner.id,
      tenantId: secondTenant.id,
      unitLabel: "2A",
      monthlyRentCents: 216000,
      amountOverdueCents: 82500,
      startsOn: new Date("2025-10-01"),
      endsOn: new Date("2026-09-15"),
      status: "active",
    }),
    upsertLease(organization.id, {
      propertyId: juniper.id,
      tenantId: thirdTenant.id,
      unitLabel: "7C",
      monthlyRentCents: 239500,
      amountOverdueCents: 125000,
      startsOn: new Date("2025-09-01"),
      endsOn: new Date("2026-08-20"),
      status: "notice",
    }),
    upsertLease(organization.id, {
      propertyId: mariner.id,
      tenantId: pastTenant.id,
      unitLabel: "5C",
      monthlyRentCents: 189500,
      amountOverdueCents: 0,
      startsOn: new Date("2024-03-01"),
      endsOn: new Date("2025-02-28"),
      status: "ended",
    }),
    upsertLease(organization.id, {
      propertyId: hawthorne.id,
      tenantId: archivedTenant.id,
      unitLabel: "11D",
      monthlyRentCents: 176500,
      amountOverdueCents: 0,
      startsOn: new Date("2023-06-01"),
      endsOn: new Date("2024-05-31"),
      status: "ended",
    }),
  ]);

  const july = new Date("2026-07-01T00:00:00.000Z");
  const august = new Date("2026-08-01T00:00:00.000Z");
  await Promise.all([
    seedInvoice({
      lease: mayaLease,
      periodStartsOn: july,
      amountCents: mayaLease.monthlyRentCents,
      balanceCents: 0,
      payments: [
        { amountCents: mayaLease.monthlyRentCents, paymentMethod: "other", paidOn: new Date("2026-07-01T00:00:00.000Z") },
      ],
    }),
    seedInvoice({
      lease: mayaLease,
      periodStartsOn: august,
      amountCents: mayaLease.monthlyRentCents,
      balanceCents: mayaLease.monthlyRentCents,
    }),
    seedInvoice({
      lease: elenaLease,
      periodStartsOn: august,
      amountCents: elenaLease.monthlyRentCents,
      balanceCents: 32500,
      payments: [{ amountCents: 165000, paymentMethod: "other", paidOn: new Date("2026-08-03T00:00:00.000Z") }],
    }),
    seedInvoice({
      lease: calvinLease,
      periodStartsOn: august,
      amountCents: calvinLease.monthlyRentCents,
      balanceCents: 82500,
      payments: [{ amountCents: 133500, paymentMethod: "other", paidOn: new Date("2026-08-02T00:00:00.000Z") }],
    }),
    seedInvoice({
      lease: noraLease,
      periodStartsOn: august,
      amountCents: noraLease.monthlyRentCents,
      balanceCents: 125000,
      payments: [{ amountCents: 114500, paymentMethod: "check", paidOn: new Date("2026-08-04T00:00:00.000Z") }],
    }),
  ]);

  await Promise.all([seedUnitsForProperty(hawthorne), seedUnitsForProperty(mariner), seedUnitsForProperty(juniper)]);

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
  ];
  await Promise.all(
    maintenanceCategories.map((label, sortOrder) =>
      prisma.maintenanceCategory.upsert({
        where: { label },
        update: { sortOrder },
        create: { organizationId: organization.id, label, sortOrder },
      }),
    ),
  );
  await Promise.all([
    prisma.landlord.upsert({
      where: { email: "avery.mitchell@hawthorneflats.example" },
      update: { firstName: "Avery", lastName: "Mitchell", phone: "615-555-0194" },
      create: {
        organizationId: organization.id,
        firstName: "Avery",
        lastName: "Mitchell",
        email: "avery.mitchell@hawthorneflats.example",
        phone: "615-555-0194",
      },
    }),
    prisma.landlord.upsert({
      where: { email: "jordan.reyes@marinercourt.example" },
      update: { firstName: "Jordan", lastName: "Reyes", phone: "843-555-0127" },
      create: {
        organizationId: organization.id,
        firstName: "Jordan",
        lastName: "Reyes",
        email: "jordan.reyes@marinercourt.example",
        phone: "843-555-0127",
      },
    }),
    prisma.landlord.upsert({
      where: { email: "priya.shah@juniperrow.example" },
      update: { firstName: "Priya", lastName: "Shah", phone: "512-555-0169" },
      create: { organizationId: organization.id, firstName: "Priya", lastName: "Shah", email: "priya.shah@juniperrow.example", phone: "512-555-0169" },
    }),
  ]);

  const tickets = [
    {
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
      propertyId: mariner.id,
      unitLabel: "2A",
      title: "Unit 2A water heater inspection",
      description: "Tenant reports inconsistent hot water.",
      status: "new",
      priority: "high",
      openedOn: new Date("2026-07-16"),
      dueOn: new Date("2026-07-21"),
    },
    {
      propertyId: juniper.id,
      unitLabel: null,
      title: "Common area lighting replacement",
      description: "Replace fixtures near rear stairwell.",
      status: "pending",
      priority: "urgent",
      openedOn: new Date("2026-07-12"),
      dueOn: new Date("2026-07-20"),
    },
  ];

  for (const ticket of tickets) {
    const existing = await prisma.maintenanceTicket.findFirst({
      where: { propertyId: ticket.propertyId, title: ticket.title },
    });

    if (existing) {
      await prisma.maintenanceTicket.update({
        where: { id: existing.id },
        data: ticket,
      });
    } else {
      await prisma.maintenanceTicket.create({ data: { ...ticket, organizationId: organization.id } });
    }
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
