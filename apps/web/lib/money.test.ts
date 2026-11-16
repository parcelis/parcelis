import assert from "node:assert/strict";
import test from "node:test";
import { createMoneyTools } from "./money.ts";
import { getCurrencyMetadata } from "@parcelis/schemas/currency";
import { maxStoredMinorUnits } from "@parcelis/schemas/money";

const usd = createMoneyTools(getCurrencyMetadata("USD"));

test("USD entry preserves cents without floating point rounding", () => {
  assert.equal(usd.toCents("0.29"), 29);
  assert.equal(usd.toCents("1200.01"), 120001);
  assert.equal(usd.formatCurrencyInput(120001), "1200.01");
  assert.equal(usd.formatCurrency(1), "$0.01 USD");
  assert.equal(usd.formatCurrency(120001), "$1,200.01 USD");
  assert.equal(usd.formatCurrency(null), "Not set");
  assert.equal(usd.amountStep, "0.01");
});

test("invalid or oversized input is rejected without rounding or partial parsing", () => {
  for (const value of ["-1", "1e2", "1,000", "1.001", "12abc", "21474836.48", "Infinity"]) {
    assert.equal(usd.parseCurrencyInput(value), null, value);
    assert.equal(Number.isNaN(usd.toCents(value)), true, value);
  }
  assert.equal(usd.parseCurrencyInput(""), null);
  assert.equal(usd.toCents(""), 0);
  assert.equal(usd.toCents(usd.maxAmount), maxStoredMinorUnits);
});

test("additional currency fixtures use their own precision without changing the production registry", () => {
  const yen = createMoneyTools({ code: "JPY", minorUnitDigits: 0 });
  const dinar = createMoneyTools({ code: "KWD", minorUnitDigits: 3 });
  assert.equal(yen.toCents("125"), 125);
  assert.equal(yen.parseCurrencyInput("125.01"), null);
  assert.equal(yen.amountStep, "1");
  assert.equal(yen.formatCurrencyInput(125), "125");
  assert.equal(yen.formatCurrency(125), "¥125 JPY");
  assert.equal(dinar.toCents("1.001"), 1001);
  assert.equal(dinar.formatCurrencyInput(1001), "1.001");
  assert.equal(dinar.amountStep, "0.001");
  assert.match(dinar.formatCurrency(1001), /1\.001.*KWD/);
  assert.equal(dinar.formatCurrency(1, "USD"), "$0.01 USD");
});
