import { getCurrencyMetadata } from "../../../packages/schemas/src/currency";

export function currencySettingsFixture() {
  return {
    currencyCode: "USD",
    currencyLockedAt: null as string | null,
    canChangeCurrency: true,
    restrictionReason: null as string | null,
    supportedCurrencies: [getCurrencyMetadata("USD")] as Array<{ code: string; name: string; minorUnitDigits: number }>,
  };
}
