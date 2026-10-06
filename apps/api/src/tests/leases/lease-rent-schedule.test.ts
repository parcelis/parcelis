import assert from "node:assert/strict";
import test from "node:test";
import { calculateMonthlyRentSchedule, planLeaseRentCharges, planMonthlyRentCharges } from "@parcelis/schemas";

test("an open-ended lease plans twelve initial calendar months", () => {
  const charges = planLeaseRentCharges({
    monthlyRentCents: 120_000,
    rentDueDay: 1,
    startsOn: "2027-04-16",
    endsOn: null,
    billingResponsibility: "joint",
    tenantIds: [11],
    tenantAllocations: [],
  });

  assert.equal(charges.length, 12);
  assert.equal(charges[0]?.periodStartsOn, "2027-04-16");
  assert.equal(charges.at(-1)?.periodEndsOn, "2028-03-31");
});

test("a fixed lease longer than 120 calendar months is rejected", () => {
  assert.throws(
    () =>
      planLeaseRentCharges({
        monthlyRentCents: 120_000,
        rentDueDay: 1,
        startsOn: "2027-01-01",
        endsOn: "2037-01-01",
        billingResponsibility: "joint",
        tenantIds: [11],
        tenantAllocations: [],
      }),
    /cannot exceed 120 months/,
  );
});

test("a fixed lease spanning exactly 120 calendar months plans every charge", () => {
  const charges = planLeaseRentCharges({
    monthlyRentCents: 120_000,
    rentDueDay: 1,
    startsOn: "2027-01-01",
    endsOn: "2036-12-31",
    billingResponsibility: "joint",
    tenantIds: [11],
    tenantAllocations: [],
  });

  assert.equal(charges.length, 120);
  assert.equal(charges[0]?.sourceKey, "rent:2027-01:joint");
  assert.equal(charges.at(-1)?.sourceKey, "rent:2036-12:joint");
});

test("a full lease plan includes every monthly joint rent charge", () => {
  const charges = planLeaseRentCharges({
    monthlyRentCents: 120_000,
    rentDueDay: 1,
    startsOn: "2027-01-01",
    endsOn: "2027-12-31",
    billingResponsibility: "joint",
    tenantIds: [12, 11],
    tenantAllocations: [],
  });

  assert.equal(charges.length, 12);
  assert.equal(
    charges.reduce((total, charge) => total + charge.amountCents, 0),
    1_440_000,
  );
  assert.deepEqual(charges[0], {
    sourceKey: "rent:2027-01:joint",
    periodStartsOn: "2027-01-01",
    periodEndsOn: "2027-01-31",
    dueOn: "2027-01-01",
    amountCents: 120_000,
    primaryTenantId: 11,
    recipientTenantIds: [11, 12],
  });
  assert.equal(charges.at(-1)?.sourceKey, "rent:2027-12:joint");
});

test("a January through December lease creates twelve monthly rent periods", () => {
  const schedule = calculateMonthlyRentSchedule({
    monthlyRentCents: 120_000,
    rentDueDay: 1,
    startsOn: "2027-01-01",
    endsOn: "2027-12-31",
  });
  assert.equal(schedule.length, 12);
  assert.deepEqual(schedule[0], {
    periodStartsOn: "2027-01-01",
    periodEndsOn: "2027-01-31",
    dueOn: "2027-01-01",
    amountCents: 120_000,
    occupiedDays: 31,
    daysInMonth: 31,
  });
  assert.deepEqual(schedule.at(-1), {
    periodStartsOn: "2027-12-01",
    periodEndsOn: "2027-12-31",
    dueOn: "2027-12-01",
    amountCents: 120_000,
    occupiedDays: 31,
    daysInMonth: 31,
  });
});

test("partial first and final calendar months are prorated and use their agreed due dates", () => {
  const schedule = calculateMonthlyRentSchedule({
    monthlyRentCents: 120_000,
    rentDueDay: 1,
    startsOn: "2027-04-16",
    endsOn: "2027-06-15",
  });
  assert.deepEqual(
    schedule.map(({ periodStartsOn, periodEndsOn, dueOn, amountCents }) => ({
      periodStartsOn,
      periodEndsOn,
      dueOn,
      amountCents,
    })),
    [
      {
        periodStartsOn: "2027-04-16",
        periodEndsOn: "2027-04-30",
        dueOn: "2027-04-16",
        amountCents: 60_000,
      },
      {
        periodStartsOn: "2027-05-01",
        periodEndsOn: "2027-05-31",
        dueOn: "2027-05-01",
        amountCents: 120_000,
      },
      {
        periodStartsOn: "2027-06-01",
        periodEndsOn: "2027-06-15",
        dueOn: "2027-06-15",
        amountCents: 60_000,
      },
    ],
  );
});

test("rent due days above a month's length are clamped", () => {
  const schedule = calculateMonthlyRentSchedule({
    monthlyRentCents: 100_000,
    rentDueDay: 31,
    startsOn: "2028-02-01",
    endsOn: "2028-03-31",
  });
  const february = schedule[0];
  assert.equal(february?.dueOn, "2028-02-29");
  assert.equal(february?.amountCents, 100_000);
});

test("a first partial period keeps the regular due day when it follows move-in", () => {
  const [april] = calculateMonthlyRentSchedule({
    monthlyRentCents: 100_000,
    rentDueDay: 25,
    startsOn: "2027-04-16",
    endsOn: "2027-05-31",
  });
  assert.equal(april?.dueOn, "2027-04-25");
  assert.equal(april?.amountCents, 50_000);
});

test("invalid dates and reversed terms are rejected", () => {
  assert.throws(
    () =>
      calculateMonthlyRentSchedule({
        monthlyRentCents: 100_000,
        rentDueDay: 1,
        startsOn: "2027-02-29",
        endsOn: "2027-03-31",
      }),
    /Invalid calendar date/,
  );
  assert.throws(
    () =>
      calculateMonthlyRentSchedule({
        monthlyRentCents: 100_000,
        rentDueDay: 1,
        startsOn: "2027-04-01",
        endsOn: "2027-03-31",
      }),
    /on or after/,
  );
  assert.throws(
    () =>
      calculateMonthlyRentSchedule({
        monthlyRentCents: 100_000,
        rentDueDay: 1,
        startsOn: "2027-04-01",
        endsOn: "2027-04-30",
      }),
    /different calendar months/,
  );
});

test("joint billing creates one charge addressed to every tenant", () => {
  const [period] = calculateMonthlyRentSchedule({
    monthlyRentCents: 120_000,
    rentDueDay: 1,
    startsOn: "2027-04-16",
    endsOn: "2027-06-15",
  });
  const plans = planMonthlyRentCharges(period!, {
    monthlyRentCents: 120_000,
    billingResponsibility: "joint",
    tenantIds: [12, 11],
    tenantAllocations: [],
  });
  assert.deepEqual(plans, [
    {
      sourceKey: "rent:2027-04:joint",
      periodStartsOn: "2027-04-16",
      periodEndsOn: "2027-04-30",
      dueOn: "2027-04-16",
      amountCents: 60_000,
      primaryTenantId: 11,
      recipientTenantIds: [11, 12],
    },
  ]);
});

test("individual partial rent distributes rounding cents and preserves the period total", () => {
  const [period] = calculateMonthlyRentSchedule({
    monthlyRentCents: 10_000,
    rentDueDay: 1,
    startsOn: "2027-04-16",
    endsOn: "2027-06-15",
  });
  const billing = {
    monthlyRentCents: 10_000,
    billingResponsibility: "individual" as const,
    tenantIds: [13, 11, 12],
    tenantAllocations: [
      { tenantId: 13, rentShareCents: 3_334 },
      { tenantId: 12, rentShareCents: 3_333 },
      { tenantId: 11, rentShareCents: 3_333 },
    ],
  };
  const plans = planMonthlyRentCharges(period!, billing);
  assert.deepEqual(
    plans.map(({ sourceKey, amountCents, primaryTenantId, recipientTenantIds }) => ({
      sourceKey,
      amountCents,
      primaryTenantId,
      recipientTenantIds,
    })),
    [
      {
        sourceKey: "rent:2027-04:tenant:11",
        amountCents: 1_667,
        primaryTenantId: 11,
        recipientTenantIds: [11],
      },
      {
        sourceKey: "rent:2027-04:tenant:12",
        amountCents: 1_666,
        primaryTenantId: 12,
        recipientTenantIds: [12],
      },
      {
        sourceKey: "rent:2027-04:tenant:13",
        amountCents: 1_667,
        primaryTenantId: 13,
        recipientTenantIds: [13],
      },
    ],
  );
  assert.equal(
    plans.reduce((sum, plan) => sum + plan.amountCents, 0),
    period!.amountCents,
  );
  assert.deepEqual(planMonthlyRentCharges(period!, billing), plans);
});

test("a tiny prorated tenant share keeps its zero-cent charge plan", () => {
  const [april] = calculateMonthlyRentSchedule({
    monthlyRentCents: 100,
    rentDueDay: 1,
    startsOn: "2027-04-30",
    endsOn: "2027-05-31",
  });
  const plans = planMonthlyRentCharges(april!, {
    monthlyRentCents: 100,
    billingResponsibility: "individual",
    tenantIds: [1, 2],
    tenantAllocations: [
      { tenantId: 1, rentShareCents: 99 },
      { tenantId: 2, rentShareCents: 1 },
    ],
  });

  assert.deepEqual(
    plans.map(({ sourceKey, amountCents, recipientTenantIds }) => ({ sourceKey, amountCents, recipientTenantIds })),
    [
      { sourceKey: "rent:2027-04:tenant:1", amountCents: 3, recipientTenantIds: [1] },
      { sourceKey: "rent:2027-04:tenant:2", amountCents: 0, recipientTenantIds: [2] },
    ],
  );
  assert.equal(
    plans.reduce((sum, plan) => sum + plan.amountCents, 0),
    april!.amountCents,
  );
});

test("a rent source key remains tied to its month when a partial start date changes", () => {
  const [earlier] = calculateMonthlyRentSchedule({
    monthlyRentCents: 10_000,
    rentDueDay: 1,
    startsOn: "2027-04-16",
    endsOn: "2027-06-15",
  });
  const [later] = calculateMonthlyRentSchedule({
    monthlyRentCents: 10_000,
    rentDueDay: 1,
    startsOn: "2027-04-20",
    endsOn: "2027-06-15",
  });
  const billing = {
    monthlyRentCents: 10_000,
    billingResponsibility: "joint" as const,
    tenantIds: [11],
    tenantAllocations: [],
  };
  assert.equal(planMonthlyRentCharges(earlier!, billing)[0]?.sourceKey, "rent:2027-04:joint");
  assert.equal(planMonthlyRentCharges(later!, billing)[0]?.sourceKey, "rent:2027-04:joint");
});

test("individual full-month charges use the agreed tenant rent shares", () => {
  const schedule = calculateMonthlyRentSchedule({
    monthlyRentCents: 10_000,
    rentDueDay: 1,
    startsOn: "2027-04-16",
    endsOn: "2027-06-15",
  });
  const plans = planMonthlyRentCharges(schedule[1]!, {
    monthlyRentCents: 10_000,
    billingResponsibility: "individual",
    tenantIds: [11, 12],
    tenantAllocations: [
      { tenantId: 11, rentShareCents: 4_000 },
      { tenantId: 12, rentShareCents: 6_000 },
    ],
  });
  assert.deepEqual(
    plans.map(({ amountCents, dueOn }) => ({ amountCents, dueOn })),
    [
      { amountCents: 4_000, dueOn: "2027-05-01" },
      { amountCents: 6_000, dueOn: "2027-05-01" },
    ],
  );
});

test("rent charge planning rejects allocations that do not match the lease", () => {
  const [period] = calculateMonthlyRentSchedule({
    monthlyRentCents: 10_000,
    rentDueDay: 1,
    startsOn: "2027-04-16",
    endsOn: "2027-06-15",
  });
  assert.throws(
    () =>
      planMonthlyRentCharges(period!, {
        monthlyRentCents: 10_000,
        billingResponsibility: "individual",
        tenantIds: [11, 12],
        tenantAllocations: [
          { tenantId: 11, rentShareCents: 4_000 },
          { tenantId: 12, rentShareCents: 5_000 },
        ],
      }),
    /allocations must match/,
  );
});
