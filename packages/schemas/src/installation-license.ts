import { z } from "zod";

export const parcelisAccountsOrigin = "https://accounts.parcelis.app";

export const activateInstallationLicenseSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^plc_[A-Za-z0-9_-]{32}$/, "Enter a valid activation code from Parcelis Accounts."),
  name: z.string().trim().min(1, "Enter an installation name.").max(100),
  environment: z.enum(["production", "staging", "development"]),
});

export type ActivateInstallationLicense = z.infer<typeof activateInstallationLicenseSchema>;
