import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const properties = [
  {
    name: "Masaki Heights",
    line1: "Plot 1208 Haile Selassie Road",
    city: "Kinondoni",
    region: "Dar es Salaam",
    postalCode: "14111",
    propertyType: "Apartment",
    contactName: "Neema Mushi",
    contactEmail: "neema.mushi@masakiheights.example",
    contactPhone: "+255 754 555 194",
    contactAddress: "Plot 1208 Haile Selassie Road, Office 1, Kinondoni, Dar es Salaam 14111",
    unitCount: 48,
    occupiedUnits: 45,
    status: "active",
  },
  {
    name: "Forodhani Court",
    line1: "44 Kenyatta Road",
    city: "Stone Town",
    region: "Mjini Magharibi",
    postalCode: "71101",
    propertyType: "Condo",
    contactName: "Juma Hamad",
    contactEmail: "juma.hamad@forodhanicourt.example",
    contactPhone: "+255 777 555 127",
    contactAddress: "44 Kenyatta Road, Office 2, Stone Town, Mjini Magharibi 71101",
    unitCount: 26,
    occupiedUnits: 22,
    status: "leasing",
  },
  {
    name: "Njiro Row",
    line1: "711 Njiro Road",
    city: "Arusha",
    region: "Arusha",
    postalCode: "23101",
    propertyType: "Mixed-Use",
    contactName: "Rehema Mollel",
    contactEmail: "rehema.mollel@njirorow.example",
    contactPhone: "+255 767 555 169",
    contactAddress: "711 Njiro Road, Leasing Desk, Arusha, Arusha 23101",
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
  const baseRentCents = isCommercial ? 142500000 : 72500000 + (bedrooms ?? 0) * 17500000 + (index % 4) * 3750000;

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

async function upsertLease(organizationId, rentChargeId, data) {
  const { tenantIds, unitId, ...leaseData } = data;

  const existing = await prisma.lease.findFirst({
    where: { organizationId, propertyId: data.propertyId, unitId },
  });

  const lease = existing
    ? await prisma.lease.update({ where: { id: existing.id }, data: { ...leaseData, unitId, rentChargeId } })
    : await prisma.lease.create({ data: { ...leaseData, unitId, organizationId, rentChargeId } });

  if (tenantIds && tenantIds.length > 0) {
    await prisma.invoice.deleteMany({ where: { leaseId: lease.id } });
    await prisma.leaseTenant.deleteMany({ where: { leaseId: lease.id } });
    await prisma.leaseTenant.createMany({
      data: tenantIds.map((tenantId) => ({ organizationId, leaseId: lease.id, tenantId })),
      skipDuplicates: true,
    });
  }

  return lease;
}

async function seedInvoice({ lease, charge, tenantId, periodStartsOn, amountCents, balanceCents, payments = [] }) {
  const paidOn = balanceCents === 0 ? (payments.at(-1)?.paidOn ?? periodStartsOn) : null;
  const month = new Intl.DateTimeFormat("en-TZ", { month: "long", timeZone: "UTC" }).format(periodStartsOn);
  const description = charge.description
    ? charge.description.replaceAll("{month}", month).replaceAll("{year}", String(periodStartsOn.getUTCFullYear()))
    : null;

  await prisma.invoice.upsert({
    where: {
      leaseId_tenantId_periodStartsOn: { leaseId: lease.id, tenantId, periodStartsOn },
    },
    update: {
      recipients: {
        createMany: {
          data: [{ tenantId }],
          skipDuplicates: true,
        },
      },
    },
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
      recipients: {
        create: { tenantId },
      },
      items: {
        create: {
          item: charge.name,
          description,
          rateCents: amountCents,
          amountCents,
        },
      },
      payments: {
        create: payments.map((payment) => ({ ...payment, organizationId: lease.organizationId, tenantId })),
      },
    },
  });
}

async function main() {
  const administratorEmail = process.env.SEED_ADMIN_EMAIL?.trim() || "admin@parcelis.dev";
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
        data: {
          name: organizationName,
          slug: randomBytes(10).toString("hex"),
          seedKey: organizationSeedKey,
          timeZone: "Africa/Dar_es_Salaam",
        },
      });
  const defaultInvoiceCharge =
    (await prisma.invoiceCharge.findFirst({ where: { organizationId: organization.id, isDefault: true } })) ??
    (await prisma.invoiceCharge.create({
      data: {
        organizationId: organization.id,
        name: "Rent",
        description: "Monthly rent for {month} {year}",
        isDefault: true,
      },
    }));
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
    where: { organizationId: organization.id, name: "Masaki Heights" },
  });
  const mariner = await prisma.property.findFirstOrThrow({
    where: { organizationId: organization.id, name: "Forodhani Court" },
  });
  const juniper = await prisma.property.findFirstOrThrow({
    where: { organizationId: organization.id, name: "Njiro Row" },
  });

  await Promise.all([
    seedRequiredUnits(hawthorne, ["4B", "8A", "11D"]),
    seedRequiredUnits(mariner, ["2A", "5C"]),
    seedRequiredUnits(juniper, ["7C"]),
  ]);

  const tenant = await prisma.tenant.upsert({
    where: { organizationId_email: { organizationId: organization.id, email: "amina.mwakyusa@example.com" } },
    update: {
      firstName: "Amina",
      lastName: "Mwakyusa",
      phone: "+255 754 555 148",
      accountStatus: "activated",
      insuranceStatus: "active",
    },
    create: {
      organizationId: organization.id,
      firstName: "Amina",
      lastName: "Mwakyusa",
      email: "amina.mwakyusa@example.com",
      phone: "+255 754 555 148",
      accountStatus: "activated",
      insuranceStatus: "active",
    },
  });
  const secondTenant = await prisma.tenant.upsert({
    where: { organizationId_email: { organizationId: organization.id, email: "baraka.kimaro@example.com" } },
    update: {
      firstName: "Baraka",
      lastName: "Kimaro",
      phone: "+255 777 555 182",
      accountStatus: "invitation_pending",
      insuranceStatus: "not_on_file",
    },
    create: {
      organizationId: organization.id,
      firstName: "Baraka",
      lastName: "Kimaro",
      email: "baraka.kimaro@example.com",
      phone: "+255 777 555 182",
      accountStatus: "invitation_pending",
      insuranceStatus: "not_on_file",
    },
  });
  await prisma.emergencyContact.deleteMany({ where: { tenantId: secondTenant.id } });
  await prisma.emergencyContact.create({
    data: {
      tenantId: secondTenant.id,
      firstName: "Dorcas",
      lastName: "Kimaro",
      phone: "+255 777 555 167",
      isPrimary: true,
    },
  });

  const thirdTenant = await prisma.tenant.upsert({
    where: { organizationId_email: { organizationId: organization.id, email: "nasra.salim@example.com" } },
    update: {
      firstName: "Nasra",
      lastName: "Salim",
      phone: "+255 767 555 135",
      accountStatus: "activated",
      insuranceStatus: "expired",
    },
    create: {
      organizationId: organization.id,
      firstName: "Nasra",
      lastName: "Salim",
      email: "nasra.salim@example.com",
      phone: "+255 767 555 135",
      accountStatus: "activated",
      insuranceStatus: "expired",
    },
  });
  const fourthTenant = await prisma.tenant.upsert({
    where: { organizationId_email: { organizationId: organization.id, email: "esther.massawe@example.com" } },
    update: {
      firstName: "Esther",
      lastName: "Massawe",
      phone: "+255 754 555 176",
      accountStatus: "activated",
      insuranceStatus: "active",
    },
    create: {
      organizationId: organization.id,
      firstName: "Esther",
      lastName: "Massawe",
      email: "esther.massawe@example.com",
      phone: "+255 754 555 176",
      accountStatus: "activated",
      insuranceStatus: "active",
    },
  });
  const pastTenant = await prisma.tenant.upsert({
    where: { organizationId_email: { organizationId: organization.id, email: "daudi.mrema@example.com" } },
    update: {
      firstName: "Daudi",
      lastName: "Mrema",
      phone: "+255 777 555 151",
      accountStatus: "activated",
      insuranceStatus: "not_on_file",
      archivedAt: null,
    },
    create: {
      organizationId: organization.id,
      firstName: "Daudi",
      lastName: "Mrema",
      email: "daudi.mrema@example.com",
      phone: "+255 777 555 151",
      accountStatus: "activated",
      insuranceStatus: "not_on_file",
    },
  });
  const archivedTenant = await prisma.tenant.upsert({
    where: { organizationId_email: { organizationId: organization.id, email: "subira.lyimo@example.com" } },
    update: {
      firstName: "Subira",
      lastName: "Lyimo",
      phone: "+255 754 555 124",
      accountStatus: "disabled",
      insuranceStatus: "expired",
      archivedAt: new Date("2026-01-15"),
    },
    create: {
      organizationId: organization.id,
      firstName: "Subira",
      lastName: "Lyimo",
      email: "subira.lyimo@example.com",
      phone: "+255 754 555 124",
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
    upsertLease(organization.id, defaultInvoiceCharge.id, {
      propertyId: hawthorne.id,
      tenantIds: [tenant.id],
      unitId: getUnitId(hawthorne.id, "4B"),
      monthlyRentCents: 92250000,
      startsOn: new Date("2026-02-01"),
      endsOn: new Date("2027-01-31"),
      status: "active",
    }),
    upsertLease(organization.id, defaultInvoiceCharge.id, {
      propertyId: hawthorne.id,
      tenantIds: [fourthTenant.id],
      unitId: getUnitId(hawthorne.id, "8A"),
      monthlyRentCents: 98750000,
      startsOn: new Date("2026-06-01"),
      endsOn: new Date("2027-05-31"),
      status: "active",
    }),
    upsertLease(organization.id, defaultInvoiceCharge.id, {
      propertyId: mariner.id,
      tenantIds: [secondTenant.id],
      unitId: getUnitId(mariner.id, "2A"),
      monthlyRentCents: 108000000,
      startsOn: new Date("2025-10-01"),
      endsOn: new Date("2026-09-15"),
      status: "active",
    }),
    upsertLease(organization.id, defaultInvoiceCharge.id, {
      propertyId: juniper.id,
      tenantIds: [thirdTenant.id],
      unitId: getUnitId(juniper.id, "7C"),
      monthlyRentCents: 119750000,
      startsOn: new Date("2025-09-01"),
      endsOn: new Date("2026-08-20"),
      status: "notice",
    }),
    upsertLease(organization.id, defaultInvoiceCharge.id, {
      propertyId: mariner.id,
      tenantIds: [pastTenant.id],
      unitId: getUnitId(mariner.id, "5C"),
      monthlyRentCents: 94750000,
      startsOn: new Date("2024-03-01"),
      endsOn: new Date("2025-02-28"),
      status: "ended",
    }),
    upsertLease(organization.id, defaultInvoiceCharge.id, {
      propertyId: hawthorne.id,
      tenantIds: [archivedTenant.id],
      unitId: getUnitId(hawthorne.id, "11D"),
      monthlyRentCents: 88250000,
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
      charge: defaultInvoiceCharge,
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
      charge: defaultInvoiceCharge,
      tenantId: tenant.id,
      periodStartsOn: august,
      amountCents: mayaLease.monthlyRentCents,
      balanceCents: mayaLease.monthlyRentCents,
    }),
    seedInvoice({
      lease: elenaLease,
      charge: defaultInvoiceCharge,
      tenantId: fourthTenant.id,
      periodStartsOn: august,
      amountCents: elenaLease.monthlyRentCents,
      balanceCents: 16250000,
      payments: [{ amountCents: 82500000, paymentMethod: "other", paidOn: new Date("2026-08-03T00:00:00.000Z") }],
    }),
    seedInvoice({
      lease: calvinLease,
      charge: defaultInvoiceCharge,
      tenantId: secondTenant.id,
      periodStartsOn: august,
      amountCents: calvinLease.monthlyRentCents,
      balanceCents: 41250000,
      payments: [{ amountCents: 66750000, paymentMethod: "other", paidOn: new Date("2026-08-02T00:00:00.000Z") }],
    }),
    seedInvoice({
      lease: noraLease,
      charge: defaultInvoiceCharge,
      tenantId: thirdTenant.id,
      periodStartsOn: august,
      amountCents: noraLease.monthlyRentCents,
      balanceCents: 62500000,
      payments: [{ amountCents: 57250000, paymentMethod: "mpesa", paidOn: new Date("2026-08-04T00:00:00.000Z") }],
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
        organizationId_email: { organizationId: organization.id, email: "neema.mushi@masakiheights.example" },
      },
      update: { firstName: "Neema", lastName: "Mushi", phone: "+255 754 555 194" },
      create: {
        organizationId: organization.id,
        firstName: "Neema",
        lastName: "Mushi",
        email: "neema.mushi@masakiheights.example",
        phone: "+255 754 555 194",
      },
    }),
    prisma.landlord.upsert({
      where: { organizationId_email: { organizationId: organization.id, email: "juma.hamad@forodhanicourt.example" } },
      update: { firstName: "Juma", lastName: "Hamad", phone: "+255 777 555 127" },
      create: {
        organizationId: organization.id,
        firstName: "Juma",
        lastName: "Hamad",
        email: "juma.hamad@forodhanicourt.example",
        phone: "+255 777 555 127",
      },
    }),
    prisma.landlord.upsert({
      where: { organizationId_email: { organizationId: organization.id, email: "rehema.mollel@njirorow.example" } },
      update: { firstName: "Rehema", lastName: "Mollel", phone: "+255 767 555 169" },
      create: {
        organizationId: organization.id,
        firstName: "Pendo",
        lastName: "Mollel",
        email: "rehema.mollel@njirorow.example",
        phone: "+255 767 555 169",
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
      annualIncomeCents: 1560000000,
      submittedOn: new Date("2026-08-10T09:00:00.000Z"),
      requestedMoveInDate: new Date("2026-09-01"),
      applicant: {
        firstName: "Deo",
        lastName: "Kessy",
        email: "deo.kessy@example.com",
        phone: "+255 754 555 142",
        addressLine1: "412 Chole Road",
        city: "Kinondoni",
        region: "Dar es Salaam",
        postalCode: "14110",
      },
    },
    {
      propertyId: hawthorne.id,
      statusLabel: "Approved",
      annualIncomeCents: 1840000000,
      submittedOn: new Date("2026-07-28T10:15:00.000Z"),
      requestedMoveInDate: new Date("2026-08-15"),
      applicant: {
        firstName: "Mariam",
        lastName: "Issa",
        email: "mariam.issa@example.com",
        phone: "+255 754 555 198",
        addressLine1: "89 Toure Drive",
        city: "Kinondoni",
        region: "Dar es Salaam",
        postalCode: "14112",
      },
    },
    {
      propertyId: mariner.id,
      statusLabel: "Pending",
      annualIncomeCents: 1320000000,
      submittedOn: new Date("2026-08-02T14:30:00.000Z"),
      requestedMoveInDate: new Date("2026-09-15"),
      applicant: {
        firstName: "Tumaini",
        lastName: "Shayo",
        email: "tumaini.shayo@example.com",
        phone: "+255 777 555 163",
        addressLine1: "27 Gizenga Street",
        city: "Stone Town",
        region: "Mjini Magharibi",
        postalCode: "71101",
      },
    },
    {
      propertyId: mariner.id,
      statusLabel: "Lease Created",
      annualIncomeCents: 1680000000,
      submittedOn: new Date("2026-07-12T11:00:00.000Z"),
      requestedMoveInDate: new Date("2026-08-01"),
      applicant: {
        firstName: "Pendo",
        lastName: "Abdallah",
        email: "pendo.abdallah@example.com",
        phone: "+255 777 555 111",
        addressLine1: "150 Shangani Street",
        city: "Stone Town",
        region: "Mjini Magharibi",
        postalCode: "71102",
      },
    },
    {
      propertyId: juniper.id,
      statusLabel: "Rejected",
      annualIncomeCents: 960000000,
      submittedOn: new Date("2026-08-05T13:45:00.000Z"),
      requestedMoveInDate: new Date("2026-08-20"),
      applicant: {
        firstName: "Godfrey",
        lastName: "Swai",
        email: "godfrey.swai@example.com",
        phone: "+255 767 555 176",
        addressLine1: "76 Sokoine Road",
        city: "Arusha",
        region: "Arusha",
        postalCode: "23102",
      },
    },
    {
      propertyId: juniper.id,
      statusLabel: "Expired",
      annualIncomeCents: 1420000000,
      submittedOn: new Date("2026-06-18T08:30:00.000Z"),
      requestedMoveInDate: new Date("2026-07-01"),
      applicant: {
        firstName: "Lilian",
        lastName: "Urassa",
        email: "lilian.urassa@example.com",
        phone: "+255 767 555 159",
        addressLine1: "230 Old Moshi Road",
        city: "Arusha",
        region: "Arusha",
        postalCode: "23101",
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
