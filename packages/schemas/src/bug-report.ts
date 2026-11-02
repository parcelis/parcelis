import { z } from "zod";

export const bugReportDestination = "support@parcelis.dev";
export const bugReportMaxImages = 3;
export const bugReportMaxImageBytes = 5 * 1024 * 1024;
export const bugReportImageTypes = ["image/png", "image/jpeg", "image/webp"] as const;
export const bugReportImageMessage = "Choose up to three PNG, JPEG, or WebP images, no larger than 5 MB each.";

export function sanitizeBugReportUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Use an HTTP or HTTPS page URL.");
  return `${url.origin}${url.pathname}`;
}

export const bugReportImageSchema = z
  .file()
  .min(1, "Screenshots must not be empty.")
  .max(bugReportMaxImageBytes, bugReportImageMessage)
  .mime([...bugReportImageTypes], bugReportImageMessage)
  .refine(
    (file) => file.name.length <= 200 && !Array.from(file.name).some((character) => character.charCodeAt(0) < 32),
    "Use a shorter screenshot filename without control characters.",
  );

export const bugReportInputSchema = z.object({
  description: z.string().trim().min(1, "Describe the problem.").max(10000),
  pageUrl: z
    .string()
    .max(2048)
    .url()
    .transform((value, ctx) => {
      try {
        return sanitizeBugReportUrl(value);
      } catch {
        ctx.addIssue({ code: "custom", message: "Use an HTTP or HTTPS page URL." });
        return z.NEVER;
      }
    })
    .optional(),
  browserVersion: z.string().trim().min(1).max(1000).optional(),
  appVersion: z.string().trim().min(1).max(100).optional(),
  screenshots: z.array(bugReportImageSchema).max(bugReportMaxImages, bugReportImageMessage).default([]),
});

export const bugReportFormSchema = z.instanceof(FormData).transform((form, ctx) => {
  const result = bugReportInputSchema.safeParse({
    description: form.get("description"),
    pageUrl: form.get("pageUrl") ?? undefined,
    browserVersion: form.get("browserVersion") ?? undefined,
    appVersion: form.get("appVersion") ?? undefined,
    screenshots: form.getAll("screenshots"),
  });
  if (!result.success) {
    for (const issue of result.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    return z.NEVER;
  }
  return result.data;
});

export type BugReportInput = z.infer<typeof bugReportInputSchema>;
