import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

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

async function seedRequiredUnits(property, requiredUnitNames) {
  for (const [index, unitName] of requiredUnitNames.entries()) {
    const unitDetails = getDemoUnitDetails(property, unitName, index);
    await prisma.unit.upsert({
      where: {
        propertyId_name: {
          propertyId: property.id,
          name: unitName,
        },
      },
      update: {},
      create: {
        propertyId: property.id,
        ...unitDetails,
      },
    });
  }
}

async function seedUnitsForProperty(property, requiredUnitNames = []) {
  const leases = await prisma.lease.findMany({
    where: { organizationId: property.organizationId, propertyId: property.id },
    select: {
      monthlyRentCents: true,
      unit: { select: { name: true } },
    },
  });
  const leaseRentByUnit = new Map(leases.map((lease) => [lease.unit.name, lease.monthlyRentCents]));
  const unitNames = getDemoUnitNames(property, [...requiredUnitNames, ...leases.map((lease) => lease.unit.name)]);

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
        where: { organizationId: property.organizationId, label: { in: utilityLabels } },
        select: { id: true },
      }),
      prisma.amenityType.findMany({
        where: { organizationId: property.organizationId, label: { in: amenityLabels } },
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
  const { tenantIds, unitId, ...leaseData } = data;

  const existing = await prisma.lease.findFirst({
    where: { organizationId, propertyId: data.propertyId, unitId },
  });

  const lease = existing
    ? await prisma.lease.update({ where: { id: existing.id }, data: { ...leaseData, unitId } })
    : await prisma.lease.create({ data: { ...leaseData, unitId, organizationId } });

  if (tenantIds && tenantIds.length > 0) {
    await prisma.leaseTenant.deleteMany({ where: { leaseId: lease.id } });
    await prisma.leaseTenant.createMany({
      data: tenantIds.map((tenantId) => ({ organizationId, leaseId: lease.id, tenantId })),
      skipDuplicates: true,
    });
  }

  return lease;
}

async function seedInvoice({ lease, tenantId, periodStartsOn, amountCents, balanceCents, payments = [] }) {
  const paidOn = balanceCents === 0 ? (payments.at(-1)?.paidOn ?? periodStartsOn) : null;

  await prisma.invoice.upsert({
    where: {
      leaseId_tenantId_periodStartsOn: { leaseId: lease.id, tenantId, periodStartsOn },
    },
    update: {},
    create: {
      organizationId: lease.organizationId,
      leaseId: lease.id,
      propertyId: lease.propertyId,
      tenantId,
      paidByTenantId: balanceCents === 0 ? tenantId : null,
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
        create: payments.map((payment) => ({ ...payment, tenantId })),
      },
    },
  });
}

async function main() {
  const administratorEmail = "admin@parcelis.dev";
  const organizationName = "Parcelis Property Management";
  const organizationSeedKey = "parcelis-demo";
  const existingOrganization = await prisma.organization.findUnique({
    where: { seedKey: organizationSeedKey },
  });
  const organization = existingOrganization
    ? await prisma.organization.update({
        where: { id: existingOrganization.id },
        data: {
          name: organizationName,
          ...(existingOrganization.slug === "default" ? { slug: randomBytes(10).toString("hex") } : {}),
        },
      })
    : await prisma.organization.create({
        data: { name: organizationName, slug: randomBytes(10).toString("hex"), seedKey: organizationSeedKey },
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
      where: { organizationId_label: { organizationId: organization.id, label } },
      update: { sortOrder: (index + 1) * 10 },
      create: { organizationId: organization.id, label, sortOrder: (index + 1) * 10 },
    });
  }

  for (const [index, label] of amenityTypes.entries()) {
    await prisma.amenityType.upsert({
      where: { organizationId_label: { organizationId: organization.id, label } },
      update: { sortOrder: (index + 1) * 10 },
      create: { organizationId: organization.id, label, sortOrder: (index + 1) * 10 },
    });
  }

  for (const [index, label] of propertyTags.entries()) {
    await prisma.tag.upsert({
      where: { organizationId_label: { organizationId: organization.id, label } },
      update: { sortOrder: (index + 1) * 10 },
      create: { organizationId: organization.id, label, sortOrder: (index + 1) * 10 },
    });
  }

  for (const property of properties) {
    const existing = await prisma.property.findFirst({
      where: { organizationId: organization.id, name: property.name },
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
    where: { organizationId: organization.id, name: "Hawthorne Flats" },
  });
  const mariner = await prisma.property.findFirstOrThrow({
    where: { organizationId: organization.id, name: "Mariner Court" },
  });
  const juniper = await prisma.property.findFirstOrThrow({
    where: { organizationId: organization.id, name: "Juniper Row" },
  });

  await Promise.all([
    seedRequiredUnits(hawthorne, ["4B", "8A", "11D"]),
    seedRequiredUnits(mariner, ["2A", "5C"]),
    seedRequiredUnits(juniper, ["7C"]),
  ]);

  const tenant = await prisma.tenant.upsert({
    where: { organizationId_email: { organizationId: organization.id, email: "maya.ellis@example.com" } },
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
    where: { organizationId_email: { organizationId: organization.id, email: "calvin.brooks@example.com" } },
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
    where: { organizationId_email: { organizationId: organization.id, email: "nora.patel@example.com" } },
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
    where: { organizationId_email: { organizationId: organization.id, email: "elena.morris@example.com" } },
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
    where: { organizationId_email: { organizationId: organization.id, email: "darius.wright@example.com" } },
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
    where: { organizationId_email: { organizationId: organization.id, email: "simone.bell@example.com" } },
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

  const units = await prisma.unit.findMany({
    where: { propertyId: { in: [hawthorne.id, mariner.id, juniper.id] } },
    select: { id: true, propertyId: true, name: true },
  });
  const getUnitId = (propertyId, name) => {
    const unit = units.find((item) => item.propertyId === propertyId && item.name === name);
    if (!unit) throw new Error(`Missing demo unit ${name} for property ${propertyId}`);
    return unit.id;
  };

  const [mayaLease, elenaLease, calvinLease, noraLease] = await Promise.all([
    upsertLease(organization.id, {
      propertyId: hawthorne.id,
      tenantIds: [tenant.id],
      unitId: getUnitId(hawthorne.id, "4B"),
      monthlyRentCents: 184500,
      startsOn: new Date("2026-02-01"),
      endsOn: new Date("2027-01-31"),
      status: "active",
    }),
    upsertLease(organization.id, {
      propertyId: hawthorne.id,
      tenantIds: [fourthTenant.id],
      unitId: getUnitId(hawthorne.id, "8A"),
      monthlyRentCents: 197500,
      startsOn: new Date("2026-06-01"),
      endsOn: new Date("2027-05-31"),
      status: "active",
    }),
    upsertLease(organization.id, {
      propertyId: mariner.id,
      tenantIds: [secondTenant.id],
      unitId: getUnitId(mariner.id, "2A"),
      monthlyRentCents: 216000,
      startsOn: new Date("2025-10-01"),
      endsOn: new Date("2026-09-15"),
      status: "active",
    }),
    upsertLease(organization.id, {
      propertyId: juniper.id,
      tenantIds: [thirdTenant.id],
      unitId: getUnitId(juniper.id, "7C"),
      monthlyRentCents: 239500,
      startsOn: new Date("2025-09-01"),
      endsOn: new Date("2026-08-20"),
      status: "notice",
    }),
    upsertLease(organization.id, {
      propertyId: mariner.id,
      tenantIds: [pastTenant.id],
      unitId: getUnitId(mariner.id, "5C"),
      monthlyRentCents: 189500,
      startsOn: new Date("2024-03-01"),
      endsOn: new Date("2025-02-28"),
      status: "ended",
    }),
    upsertLease(organization.id, {
      propertyId: hawthorne.id,
      tenantIds: [archivedTenant.id],
      unitId: getUnitId(hawthorne.id, "11D"),
      monthlyRentCents: 176500,
      startsOn: new Date("2023-06-01"),
      endsOn: new Date("2024-05-31"),
      status: "ended",
    }),
  ]);

  await Promise.all([
    seedUnitsForProperty(hawthorne, ["4B", "8A", "11D"]),
    seedUnitsForProperty(mariner, ["2A", "5C"]),
    seedUnitsForProperty(juniper, ["7C"]),
  ]);

  const july = new Date("2026-07-01T00:00:00.000Z");
  const august = new Date("2026-08-01T00:00:00.000Z");
  await Promise.all([
    seedInvoice({
      lease: mayaLease,
      tenantId: tenant.id,
      periodStartsOn: july,
      amountCents: mayaLease.monthlyRentCents,
      balanceCents: 0,
      payments: [
        {
          amountCents: mayaLease.monthlyRentCents,
          paymentMethod: "other",
          paidOn: new Date("2026-07-01T00:00:00.000Z"),
        },
      ],
    }),
    seedInvoice({
      lease: mayaLease,
      tenantId: tenant.id,
      periodStartsOn: august,
      amountCents: mayaLease.monthlyRentCents,
      balanceCents: mayaLease.monthlyRentCents,
    }),
    seedInvoice({
      lease: elenaLease,
      tenantId: fourthTenant.id,
      periodStartsOn: august,
      amountCents: elenaLease.monthlyRentCents,
      balanceCents: 32500,
      payments: [{ amountCents: 165000, paymentMethod: "other", paidOn: new Date("2026-08-03T00:00:00.000Z") }],
    }),
    seedInvoice({
      lease: calvinLease,
      tenantId: secondTenant.id,
      periodStartsOn: august,
      amountCents: calvinLease.monthlyRentCents,
      balanceCents: 82500,
      payments: [{ amountCents: 133500, paymentMethod: "other", paidOn: new Date("2026-08-02T00:00:00.000Z") }],
    }),
    seedInvoice({
      lease: noraLease,
      tenantId: thirdTenant.id,
      periodStartsOn: august,
      amountCents: noraLease.monthlyRentCents,
      balanceCents: 125000,
      payments: [{ amountCents: 114500, paymentMethod: "check", paidOn: new Date("2026-08-04T00:00:00.000Z") }],
    }),
  ]);

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
        where: { organizationId_label: { organizationId: organization.id, label } },
        update: { sortOrder },
        create: { organizationId: organization.id, label, sortOrder },
      }),
    ),
  );

  const applicationStatusLabels = [
    "For Review",
    "Pending",
    "Approved",
    "Lease Created",
    "Rejected",
    "Declined",
    "Expired",
  ];
  const applicationStatuses = await Promise.all(
    applicationStatusLabels.map((label, sortOrder) =>
      prisma.applicationStatus.upsert({
        where: { organizationId_label: { organizationId: organization.id, label } },
        update: { sortOrder },
        create: { organizationId: organization.id, label, sortOrder },
      }),
    ),
  );
  const applicationStatusByLabel = Object.fromEntries(applicationStatuses.map((status) => [status.label, status]));
  await Promise.all([
    prisma.landlord.upsert({
      where: {
        organizationId_email: { organizationId: organization.id, email: "avery.mitchell@hawthorneflats.example" },
      },
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
      where: { organizationId_email: { organizationId: organization.id, email: "jordan.reyes@marinercourt.example" } },
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
      where: { organizationId_email: { organizationId: organization.id, email: "priya.shah@juniperrow.example" } },
      update: { firstName: "Priya", lastName: "Shah", phone: "512-555-0169" },
      create: {
        organizationId: organization.id,
        firstName: "Priya",
        lastName: "Shah",
        email: "priya.shah@juniperrow.example",
        phone: "512-555-0169",
      },
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
      where: { organizationId: organization.id, propertyId: ticket.propertyId, title: ticket.title },
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

  const applications = [
    {
      propertyId: hawthorne.id,
      statusLabel: "For Review",
      annualIncomeCents: 7800000,
      submittedOn: new Date("2026-08-10T09:00:00.000Z"),
      requestedMoveInDate: new Date("2026-09-01"),
      applicant: {
        firstName: "Devon",
        lastName: "Kingsley",
        email: "devon.kingsley@example.com",
        phone: "615-555-0142",
        addressLine1: "412 Willow Street",
        city: "Nashville",
        region: "TN",
        postalCode: "37203",
      },
    },
    {
      propertyId: hawthorne.id,
      statusLabel: "Approved",
      annualIncomeCents: 9200000,
      submittedOn: new Date("2026-07-28T10:15:00.000Z"),
      requestedMoveInDate: new Date("2026-08-15"),
      applicant: {
        firstName: "Marisol",
        lastName: "Ibarra",
        email: "marisol.ibarra@example.com",
        phone: "615-555-0198",
        addressLine1: "89 Cedar Lane",
        city: "Nashville",
        region: "TN",
        postalCode: "37206",
      },
    },
    {
      propertyId: mariner.id,
      statusLabel: "Pending",
      annualIncomeCents: 6600000,
      submittedOn: new Date("2026-08-02T14:30:00.000Z"),
      requestedMoveInDate: new Date("2026-09-15"),
      applicant: {
        firstName: "Theo",
        lastName: "Whitfield",
        email: "theo.whitfield@example.com",
        phone: "843-555-0163",
        addressLine1: "27 Harbor Row",
        city: "Charleston",
        region: "SC",
        postalCode: "29401",
      },
    },
    {
      propertyId: mariner.id,
      statusLabel: "Lease Created",
      annualIncomeCents: 8400000,
      submittedOn: new Date("2026-07-12T11:00:00.000Z"),
      requestedMoveInDate: new Date("2026-08-01"),
      applicant: {
        firstName: "Priya",
        lastName: "Anand",
        email: "priya.anand@example.com",
        phone: "843-555-0111",
        addressLine1: "150 Battery Street",
        city: "Charleston",
        region: "SC",
        postalCode: "29403",
      },
    },
    {
      propertyId: juniper.id,
      statusLabel: "Rejected",
      annualIncomeCents: 4800000,
      submittedOn: new Date("2026-08-05T13:45:00.000Z"),
      requestedMoveInDate: new Date("2026-08-20"),
      applicant: {
        firstName: "Grant",
        lastName: "Osei",
        email: "grant.osei@example.com",
        phone: "512-555-0176",
        addressLine1: "76 Congress Ave",
        city: "Austin",
        region: "TX",
        postalCode: "78701",
      },
    },
    {
      propertyId: juniper.id,
      statusLabel: "Expired",
      annualIncomeCents: 7100000,
      submittedOn: new Date("2026-06-18T08:30:00.000Z"),
      requestedMoveInDate: new Date("2026-07-01"),
      applicant: {
        firstName: "Lena",
        lastName: "Vogel",
        email: "lena.vogel@example.com",
        phone: "512-555-0159",
        addressLine1: "230 South Lamar",
        city: "Austin",
        region: "TX",
        postalCode: "78704",
      },
    },
  ];

  for (const application of applications) {
    const existing = await prisma.application.findFirst({
      where: {
        organizationId: organization.id,
        propertyId: application.propertyId,
        submittedOn: application.submittedOn,
      },
    });
    const applicant = existing
      ? await prisma.applicant.update({ where: { id: existing.applicantId }, data: application.applicant })
      : await prisma.applicant.create({ data: { organizationId: organization.id, ...application.applicant } });
    const status = applicationStatusByLabel[application.statusLabel];

    if (existing) {
      await prisma.application.update({
        where: { id: existing.id },
        data: {
          statusId: status.id,
          annualIncomeCents: application.annualIncomeCents,
          submittedOn: application.submittedOn,
          requestedMoveInDate: application.requestedMoveInDate,
        },
      });
    } else {
      await prisma.application.create({
        data: {
          organizationId: organization.id,
          propertyId: application.propertyId,
          applicantId: applicant.id,
          statusId: status.id,
          annualIncomeCents: application.annualIncomeCents,
          submittedOn: application.submittedOn,
          requestedMoveInDate: application.requestedMoveInDate,
        },
      });
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
