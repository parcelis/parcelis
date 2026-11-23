import {
  formatMinorUnits,
  maxStoredMinorUnits,
  parseMinorUnits,
  toStoredMinorUnits,
  type MoneyCurrency,
} from "@parcelis/schemas/money";
import { getCurrencyMetadata } from "@parcelis/schemas/currency";

export function createMoneyTools(currency: MoneyCurrency) {
  function formatCurrencyInput(value: number | null): string {
    if (value === null) return "";
    const digits = currency.minorUnitDigits;
    const amount = BigInt(value);
    const text = (amount < 0n ? -amount : amount).toString().padStart(digits + 1, "0");
    return `${amount < 0n ? "-" : ""}${digits ? `${text.slice(0, -digits)}.${text.slice(-digits)}` : text}`;
  }

  function parseCurrencyInput(value: string): number | null {
    if (!value.trim()) return null;
    try {
      return toStoredMinorUnits(parseMinorUnits(value, currency.minorUnitDigits));
    } catch {
      return null;
    }
  }

  function formatCurrency(value: number | null, currencyCode?: string | null): string {
    if (value === null) return "Not set";
    if (!Number.isSafeInteger(value)) return "Enter a valid amount";
    const metadata = currencyCode && currencyCode !== currency.code ? getCurrencyMetadata(currencyCode) : currency;
    return `${formatMinorUnits(value, metadata)} ${metadata.code}`;
  }

  return {
    currency,
    formatCurrency,
    formatCurrencyExact: formatCurrency,
    formatCurrencyInput,
    parseCurrencyInput,
    toCents: (value: string) => (value.trim() === "" ? 0 : (parseCurrencyInput(value) ?? Number.NaN)),
    validateAmountInput: (event: { currentTarget: HTMLInputElement }) => {
      const input = event.currentTarget;
      input.setCustomValidity(
        input.value.trim() && parseCurrencyInput(input.value) === null
          ? `Enter a valid ${currency.code} amount with at most ${currency.minorUnitDigits} decimal places, up to ${formatCurrencyInput(maxStoredMinorUnits)}.`
          : "",
      );
    },
    amountStep: currency.minorUnitDigits ? `0.${"0".repeat(currency.minorUnitDigits - 1)}1` : "1",
    maxAmount: formatCurrencyInput(maxStoredMinorUnits),
  };
}
