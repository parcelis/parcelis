import assert from "node:assert/strict";
import test from "node:test";
import {
  currencyMetadata,
  formatMinorUnits,
  parseMinorUnits,
  roundMinorUnits,
  sumMinorUnits,
  sumMoneyMinorUnits,
  toStoredMinorUnits,
  moneySchema,
  createApplicationInputSchema,
  createUnitInputSchema,
  recordInvoicePaymentInputSchema,
  recordInvoicePaymentsInputSchema,
  createManualInvoiceInputSchema,
} from "@parcelis/schemas";
import { calculateMonthlyRentSchedule, planLeaseRentCharges } from "@parcelis/schemas";

test("decimal parsing keeps exact minor units across currency scales and large values", () => {
  for (const [value, digits, expected] of [
    ["12.34", 2, "1234"],
    ["-0.01", 2, "-1"],
    ["123", 0, "123"],
    ["12.345", 3, "12345"],
    ["-0.000", 3, "0"],
    ["78000000.00", 2, "7800000000"],
    ["9007199254740993.99", 2, "900719925474099399"],
  ] as const)
    assert.equal(parseMinorUnits(value, digits), expected);
  for (const value of ["1e3", "1,234.00", "", "NaN", "1.2.3"]) assert.throws(() => parseMinorUnits(value, 2));
  assert.throws(() => parseMinorUnits("1.001", 2), /precision/);
  assert.equal(parseMinorUnits("1.005", 2, "halfAwayFromZero"), "101");
  assert.equal(parseMinorUnits("-1.005", 2, "halfAwayFromZero"), "-101");
  assert.equal(parseMinorUnits("1.004", 2, "halfAwayFromZero"), "100");
});

test("formatting preserves fractions and does not round large integers through floating point", () => {
  assert.equal(formatMinorUnits(1, currencyMetadata.USD), "$0.01");
  assert.equal(formatMinorUnits(-1, currencyMetadata.USD), "-$0.01");
  assert.equal(formatMinorUnits("900719925474099399", currencyMetadata.USD), "$9,007,199,254,740,993.99");
  assert.match(formatMinorUnits("123", { code: "JPY", minorUnitDigits: 0 }), /123/);
  assert.match(formatMinorUnits("12345", { code: "KWD", minorUnitDigits: 3 }), /12\.345/);
  assert.match(formatMinorUnits("7800000000", { code: "TZS", minorUnitDigits: 2 }), /78,000,000\.00/);
  assert.throws(() => formatMinorUnits(Number.MAX_SAFE_INTEGER + 1, currencyMetadata.USD));
});

test("legacy storage rejects overflow while the neutral contract serializes exact integers", () => {
  assert.equal(toStoredMinorUnits("2147483647"), 2_147_483_647);
  assert.throws(() => toStoredMinorUnits("2147483648"));
  assert.throws(() => toStoredMinorUnits(parseMinorUnits("78000000.00", 2)));
  const money = moneySchema.parse({ currencyCode: "USD", amountMinorUnits: "900719925474099399" });
  assert.deepEqual(JSON.parse(JSON.stringify(money)), money);
  for (const amountMinorUnits of ["1.00", "01", "-0", "1e4"]) {
    assert.equal(moneySchema.safeParse({ currencyCode: "USD", amountMinorUnits }).success, false);
  }
  assert.equal(sumMinorUnits([2_147_483_647, 2_147_483_647]), 4_294_967_294);
  assert.throws(() => sumMinorUnits([Number.MAX_SAFE_INTEGER, 1]));
});

test("proration uses exact products and individual allocations preserve the total", () => {
  assert.equal(roundMinorUnits(1n, 2n), 1n);
  assert.equal(roundMinorUnits(-1n, 2n), -1n);
  const schedule = calculateMonthlyRentSchedule({
    monthlyRentCents: Number.MAX_SAFE_INTEGER,
    rentDueDay: 1,
    startsOn: "2027-01-16",
    endsOn: "2027-02-28",
  });
  assert.equal(schedule[0]?.amountCents, Number(roundMinorUnits(BigInt(Number.MAX_SAFE_INTEGER) * 16n, 31n)));
  const charges = planLeaseRentCharges({
    monthlyRentCents: 2_147_483_647,
    rentDueDay: 1,
    startsOn: "2027-01-16",
    endsOn: "2027-02-28",
    billingResponsibility: "individual",
    tenantIds: [1, 2],
    tenantAllocations: [
      { tenantId: 1, rentShareCents: 1 },
      { tenantId: 2, rentShareCents: 2_147_483_646 },
    ],
  });
  assert.equal(
    sumMinorUnits(charges.slice(0, 2).map(({ amountCents }) => amountCents)),
    Number(roundMinorUnits(2_147_483_647n * 16n, 31n)),
  );
});

test("all remaining money inputs reject storage overflow before database writes", () => {
  const payment = { id: 1, amountCents: 2_147_483_648, paidOn: new Date(), paidByTenantId: 1, paymentMethod: "cash" };
  assert.equal(recordInvoicePaymentInputSchema.safeParse(payment).success, false);
  assert.equal(
    recordInvoicePaymentsInputSchema.safeParse({
      id: 1,
      payments: [
        { ...payment, amountCents: 2_147_483_647 },
        { ...payment, amountCents: 1 },
      ],
    }).success,
    false,
  );
  assert.equal(
    createUnitInputSchema.safeParse({
      propertyId: 1,
      name: "A",
      marketRateCents: 2_147_483_648,
      unitType: "Residential",
    }).success,
    false,
  );
  assert.equal(
    createApplicationInputSchema.safeParse({
      propertyId: 1,
      statusId: 1,
      annualIncomeCents: 7_800_000_000,
      applicant: { firstName: "A", lastName: "B", email: "a@example.test" },
    }).success,
    false,
  );
  assert.equal(
    createManualInvoiceInputSchema.safeParse({
      propertyId: 1,
      leaseId: 1,
      dueOn: new Date(),
      paidCents: 0,
      items: [{ item: "Overflow", quantity: 2_147_483_647, rateCents: 2_147_483_647 }],
    }).success,
    false,
  );
});

test("currency totals reject mixed currencies instead of returning an unlabeled sum", () => {
  assert.equal(
    sumMoneyMinorUnits(
      [
        { currencyCode: "USD", amountMinorUnits: 1 },
        { currencyCode: "USD", amountMinorUnits: 99 },
      ],
      "USD",
    ),
    100,
  );
  assert.throws(
    () => sumMoneyMinorUnits([{ currencyCode: "EUR", amountMinorUnits: 100 }], "USD"),
    /different currencies/,
  );
});
