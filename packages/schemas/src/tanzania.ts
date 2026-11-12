export const appLocale = "en-TZ";
export const appCurrency = "TZS";
export const defaultTimeZone = "Africa/Dar_es_Salaam";
export const tanzaniaRegions = [
  "Arusha", "Dar es Salaam", "Dodoma", "Geita", "Iringa", "Kagera", "Katavi",
  "Kigoma", "Kilimanjaro", "Lindi", "Manyara", "Mara", "Mbeya", "Mjini Magharibi",
  "Morogoro", "Mtwara", "Mwanza", "Njombe", "Pemba North", "Pemba South", "Pwani",
  "Rukwa", "Ruvuma", "Shinyanga", "Simiyu", "Singida", "Songwe", "Tabora", "Tanga",
  "Unguja North", "Unguja South"
] as const;

export const paymentMethodValues = [
  "cash",
  "mpesa",
  "mixx_by_yas",
  "airtel_money",
  "halopesa",
  "bank_transfer",
  "cheque",
  "other",
] as const;
export type PaymentMethod = (typeof paymentMethodValues)[number];
export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Cash",
  mpesa: "M-Pesa",
  mixx_by_yas: "Mixx by Yas",
  airtel_money: "Airtel Money",
  halopesa: "HaloPesa",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  other: "Other",
};

/** Falls back to a title-cased label for methods saved before the Tanzanian list. */
export function formatPaymentMethod(method: string): string {
  if (method in paymentMethodLabels) return paymentMethodLabels[method as PaymentMethod];

  return method
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}