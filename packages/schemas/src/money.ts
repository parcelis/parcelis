import { z } from "zod";
import { currencyCodeSchema, type CurrencyMetadata } from "./currency.ts";

export const maxStoredMinorUnits = 2_147_483_647;
export const storedMinorUnitsSchema = z.number().int().nonnegative().max(maxStoredMinorUnits);
export const minorUnitAmountSchema = z.string().regex(/^(?:0|-?[1-9]\d*)$/);
export const moneySchema = z.object({ currencyCode: currencyCodeSchema, amountMinorUnits: minorUnitAmountSchema });
export type Money = z.infer<typeof moneySchema>;
export type MoneyCurrency = Pick<CurrencyMetadata, "minorUnitDigits"> & { code: string };

function scaleFor(digits: number) {
  if (!Number.isInteger(digits) || digits < 0 || digits > 20) throw new RangeError("Invalid minor-unit precision.");
  return 10n ** BigInt(digits);
}

export function roundMinorUnits(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("Denominator must be positive.");
  const sign = numerator < 0n ? -1n : 1n;
  const value = numerator * sign;
  return sign * (value / denominator + ((value % denominator) * 2n >= denominator ? 1n : 0n));
}

export function parseMinorUnits(
  value: string,
  minorUnitDigits: number,
  rounding: "reject" | "halfAwayFromZero" = "reject",
): string {
  const scale = scaleFor(minorUnitDigits);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error("Enter a decimal amount without grouping or exponent notation.");
  const fraction = match[3] ?? "";
  const excess = fraction.slice(minorUnitDigits);
  if (rounding === "reject" && /[1-9]/.test(excess)) throw new RangeError("Amount exceeds currency precision.");
  const amount =
    BigInt(match[2]!) * scale + BigInt(fraction.slice(0, minorUnitDigits).padEnd(minorUnitDigits, "0") || "0");
  const rounded = amount + (rounding === "halfAwayFromZero" && Number(excess[0] ?? 0) >= 5 ? 1n : 0n);
  return (match[1] === "-" ? -rounded : rounded).toString();
}

export function formatMinorUnits(value: string | bigint | number, currency: MoneyCurrency, locale = "en-US") {
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw new RangeError("Amount must be an exact integer.");
  const amount = BigInt(typeof value === "string" ? minorUnitAmountSchema.parse(value) : value);
  const scale = scaleFor(currency.minorUnitDigits);
  const absolute = amount < 0n ? -amount : amount;
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(currency.minorUnitDigits, "0");
  const signedWhole = amount < 0n ? (whole === 0n ? -0 : -whole) : whole;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.code,
    minimumFractionDigits: currency.minorUnitDigits,
    maximumFractionDigits: currency.minorUnitDigits,
  })
    .formatToParts(signedWhole)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}

export function toStoredMinorUnits(value: string | bigint): number {
  const amount = BigInt(typeof value === "string" ? minorUnitAmountSchema.parse(value) : value);
  if (amount < 0n || amount > BigInt(maxStoredMinorUnits))
    throw new RangeError("Amount exceeds current storage limits.");
  return Number(amount);
}

export function sumMinorUnits(values: readonly number[]): number {
  let total = 0n;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) throw new RangeError("Amount must be an exact integer.");
    total += BigInt(value);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("Total exceeds the JSON-safe integer range.");
  }
  return Number(total);
}
