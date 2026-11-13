import assert from "node:assert/strict";
import test from "node:test";
import {
  currencyCodeSchema,
  currencyCodeValues,
  currencyMetadata,
  currencyMetadataSchema,
  defaultCurrencyCode,
  type CurrencyCode,
  type CurrencyMetadata,
} from "@parcelis/schemas";

test("the default currency is enabled and has USD cents precision", () => {
  const code: CurrencyCode = currencyCodeSchema.parse(defaultCurrencyCode);
  const metadata: CurrencyMetadata = currencyMetadataSchema.parse(currencyMetadata[code]);

  assert.equal(code, "USD");
  assert.deepEqual(metadata, { code: "USD", name: "US Dollar", minorUnitDigits: 2 });
});

test("every enabled currency has matching validated metadata", () => {
  assert.deepEqual(Object.keys(currencyMetadata).sort(), [...currencyCodeValues].sort());
  for (const code of currencyCodeValues) {
    const metadata = currencyMetadataSchema.parse(currencyMetadata[code]);
    assert.equal(metadata.code, code);
  }
});

test("currency codes reject unsupported, noncanonical, and missing values", () => {
  for (const value of ["EUR", "TZS", "ABC", "usd", " USD ", "", null, undefined, 0]) {
    assert.equal(currencyCodeSchema.safeParse(value).success, false, String(value));
  }
});

test("optional currency updates preserve omission instead of applying the creation default", () => {
  const optionalCurrencySchema = currencyCodeSchema.optional();

  assert.equal(optionalCurrencySchema.parse(undefined), undefined);
  assert.equal(optionalCurrencySchema.parse("USD"), "USD");
  assert.equal(optionalCurrencySchema.safeParse("TZS").success, false);
});

test("currency metadata rejects unsupported codes, blank names, and invalid precision", () => {
  for (const patch of [
    { code: "TZS" },
    { name: "   " },
    { minorUnitDigits: -1 },
    { minorUnitDigits: 1.5 },
    { minorUnitDigits: "2" },
    { minorUnitDigits: Number.POSITIVE_INFINITY },
    { minorUnitDigits: Number.NaN },
  ]) {
    assert.equal(currencyMetadataSchema.safeParse({ ...currencyMetadata.USD, ...patch }).success, false);
  }
});
