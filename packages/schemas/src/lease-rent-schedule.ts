
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
