import assert from "node:assert/strict";
import test from "node:test";
import { calculateMonthlyRentSchedule } from "@parcelis/schemas";

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
