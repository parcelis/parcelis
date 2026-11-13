// Currency-related schemas and metadata
import { z } from "zod";

// Supported currency codes
export const currencyCodeValues = ["USD"] as const;

// Currency code schema
export const currencyCodeSchema = z.enum(currencyCodeValues);

// Currency metadata schema
export const currencyMetadataSchema = z.object({
  code: currencyCodeSchema,
  name: z.string().trim().min(1),
  minorUnitDigits: z.number().int().nonnegative(),
});

// Currency-related TypeScript types
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;

// Currency metadata TypeScript type
export type CurrencyMetadata = z.infer<typeof currencyMetadataSchema>;

// Default currency code
export const defaultCurrencyCode: CurrencyCode = "USD";

// Currency metadata for supported currencies
export const currencyMetadata = {
  USD: {
    code: "USD",
    name: "US Dollar",
    minorUnitDigits: 2,
  },
} as const satisfies Record<CurrencyCode, CurrencyMetadata>;
