// This module provides types and functions for calculating
// monthly rent schedules for leases.
export type MonthlyRentScheduleInput = {
  monthlyRentCents: number;
  rentDueDay: number;
  startsOn: string;
  endsOn: string;
};

// Represents a single period within a monthly rent schedule.
export type MonthlyRentSchedulePeriod = {
  periodStartsOn: string;
  periodEndsOn: string;
  dueOn: string;
  amountCents: number;
  occupiedDays: number;
  daysInMonth: number;
};

// Input for calculating monthly rent charges for a lease.
export type MonthlyRentBillingInput = {
  monthlyRentCents: number;
  billingResponsibility: "joint" | "individual";
  tenantIds: number[];
  tenantAllocations: Array<{ tenantId: number; rentShareCents: number }>;
};

// Represents a planned monthly rent charge for a lease.
export type MonthlyRentChargePlan = {
  sourceKey: string;
  periodStartsOn: string;
  periodEndsOn: string;
  dueOn: string;
  amountCents: number;
  primaryTenantId: number;
  recipientTenantIds: number[];
};

// Input for calculating the combined lease rent plan, which includes both the schedule and billing information.
export type LeaseRentPlanInput = Omit<MonthlyRentScheduleInput, "endsOn"> &
  MonthlyRentBillingInput & { endsOn: string | null };

// Helper function to determine the number of days in a given
// month of a specific year.
function daysInMonth(year: number, month: number) {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// Parses a calendar date string (YYYY-MM-DD) into its components.
function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid calendar date: ${value}.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Invalid calendar date: ${value}.`);
  }
  return { year, month, day };
}

// Formats a calendar date from its components into a string (YYYY-MM-DD).
function formatCalendarDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Calculates the monthly rent schedule for a lease based on its start and end dates, monthly rent, and rent due day.
export function calculateMonthlyRentSchedule({
  monthlyRentCents,
  rentDueDay,
  startsOn,
  endsOn,
}: MonthlyRentScheduleInput) {
  if (!Number.isSafeInteger(monthlyRentCents) || monthlyRentCents <= 0) {
    throw new Error("Monthly rent must be a positive number of cents.");
  }
  if (!Number.isInteger(rentDueDay) || rentDueDay < 1 || rentDueDay > 31) {
    throw new Error("Rent due day must be between 1 and 31.");
  }

  const start = parseCalendarDate(startsOn);
  const end = parseCalendarDate(endsOn);
  if (startsOn > endsOn) throw new Error("Lease end date must be on or after its start date.");
  if (start.year === end.year && start.month === end.month) {
    throw new Error("Lease start and end dates must be in different calendar months.");
  }

  // Initialize the rent schedule array and set the
  // starting year and month.
  const schedule: MonthlyRentSchedulePeriod[] = [];
  let year = start.year;
  let month = start.month;

  while (year < end.year || (year === end.year && month <= end.month)) {
    const monthLength = daysInMonth(year, month);
    const firstDay = formatCalendarDate(year, month, 1);
    const lastDay = formatCalendarDate(year, month, monthLength);
    const periodStartsOn = startsOn > firstDay ? startsOn : firstDay;
    const periodEndsOn = endsOn < lastDay ? endsOn : lastDay;
    const occupiedStart = parseCalendarDate(periodStartsOn).day;
    const occupiedEnd = parseCalendarDate(periodEndsOn).day;
    const occupiedDays = occupiedEnd - occupiedStart + 1;
    const dueDay = Math.min(rentDueDay, monthLength);
    const regularDueOn = formatCalendarDate(year, month, dueDay);
    const isFirstPeriod = year === start.year && month === start.month;
    const isFinalPartialPeriod = year === end.year && month === end.month && periodEndsOn < lastDay;
    const dueOn = isFinalPartialPeriod
      ? endsOn
      : isFirstPeriod && periodStartsOn > regularDueOn
        ? periodStartsOn
        : regularDueOn;

    schedule.push({
      periodStartsOn,
      periodEndsOn,
      dueOn,
      amountCents: Math.round((monthlyRentCents * occupiedDays) / monthLength),
      occupiedDays,
      daysInMonth: monthLength,
    });

    if (month === 12) {
      year += 1;
      month = 1;
    } else {
      month += 1;
    }
  }

  return schedule;
}

// Plans the monthly rent charges for a given rent
// schedule period based on the billing input.
export function planMonthlyRentCharges(
  period: MonthlyRentSchedulePeriod,
  { monthlyRentCents, billingResponsibility, tenantIds, tenantAllocations }: MonthlyRentBillingInput,
): MonthlyRentChargePlan[] {
  const sortedTenantIds = [...tenantIds].sort((a, b) => a - b);
  if (
    sortedTenantIds.length === 0 ||
    sortedTenantIds.some((id, index) => !Number.isSafeInteger(id) || id <= 0 || id === sortedTenantIds[index - 1])
  ) {
    throw new Error("Provide unique tenant IDs for rent billing.");
  }
  if (
    !Number.isSafeInteger(monthlyRentCents) ||
    monthlyRentCents <= 0 ||
    !Number.isSafeInteger(period.amountCents) ||
    period.amountCents !== Math.round((monthlyRentCents * period.occupiedDays) / period.daysInMonth)
  ) {
    throw new Error("Rent period amount does not match the monthly rent.");
  }

  const sourcePeriod = period.periodStartsOn.slice(0, 7);
  const periodFields = {
    periodStartsOn: period.periodStartsOn,
    periodEndsOn: period.periodEndsOn,
    dueOn: period.dueOn,
  };

  if (billingResponsibility === "joint") {
    if (tenantAllocations.length > 0) throw new Error("Joint billing cannot use tenant allocations.");
    return [
      {
        ...periodFields,
        sourceKey: `rent:${sourcePeriod}:joint`,
        amountCents: period.amountCents,
        primaryTenantId: sortedTenantIds[0]!,
        recipientTenantIds: sortedTenantIds,
      },
    ];
  }

  const sortedAllocations = [...tenantAllocations].sort((a, b) => a.tenantId - b.tenantId);
  if (
    billingResponsibility !== "individual" ||
    sortedAllocations.length !== sortedTenantIds.length ||
    sortedAllocations.some(
      ({ tenantId, rentShareCents }, index) =>
        tenantId !== sortedTenantIds[index] || !Number.isSafeInteger(rentShareCents) || rentShareCents <= 0,
    ) ||
    sortedAllocations.reduce((sum, { rentShareCents }) => sum + rentShareCents, 0) !== monthlyRentCents
  ) {
    throw new Error("Individual rent allocations must match the tenants and monthly rent.");
  }

  const prorated = sortedAllocations.map(({ tenantId, rentShareCents }) => {
    const numerator = rentShareCents * period.occupiedDays;
    return {
      tenantId,
      amountCents: Math.floor(numerator / period.daysInMonth),
      remainder: numerator % period.daysInMonth,
    };
  });
  let remainingCents = period.amountCents - prorated.reduce((sum, charge) => sum + charge.amountCents, 0);
  for (const charge of [...prorated].sort((a, b) => b.remainder - a.remainder || a.tenantId - b.tenantId)) {
    if (remainingCents === 0) break;
    charge.amountCents += 1;
    remainingCents -= 1;
  }

  return prorated.map(({ tenantId, amountCents }) => ({
    ...periodFields,
    sourceKey: `rent:${sourcePeriod}:tenant:${tenantId}`,
    amountCents,
    primaryTenantId: tenantId,
    recipientTenantIds: [tenantId],
  }));
}

// Lease planner
// Plans the lease rent charges based on the calculated monthly rent schedule.
export function planLeaseRentCharges(input: LeaseRentPlanInput): MonthlyRentChargePlan[] {
  const start = parseCalendarDate(input.startsOn);
  let endsOn = input.endsOn;
  if (endsOn === null) {
    const finalMonthIndex = start.year * 12 + start.month - 1 + 11;
    const year = Math.floor(finalMonthIndex / 12);
    const month = (finalMonthIndex % 12) + 1;
    endsOn = formatCalendarDate(year, month, daysInMonth(year, month));
  } else {
    const end = parseCalendarDate(endsOn);
    const periodCount = (end.year - start.year) * 12 + end.month - start.month + 1;
    if (periodCount > 120) throw new Error("Lease rent schedule cannot exceed 120 months.");
  }
  return calculateMonthlyRentSchedule({ ...input, endsOn }).flatMap((period) => planMonthlyRentCharges(period, input));
}
