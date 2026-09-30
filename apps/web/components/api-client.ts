"use client";

import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@parcelis/api/router";
import type { NoteSubjectInput } from "@parcelis/schemas";
import { sessionExpiredEventName } from "./session-events";

export const apiClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
      async fetch(url, options) {
        const organizationSlug =
          typeof window === "undefined" ? null : window.location.pathname.match(/^\/o\/([^/]+)/)?.[1];
        const headers = new Headers(options?.headers);
        if (organizationSlug) headers.set("x-parcelis-organization-slug", organizationSlug);
        const response = await fetch(url, { ...options, credentials: "include", headers });
        if (typeof window !== "undefined" && (!response.ok || response.status === 207)) {
          try {
            const result: unknown = await response.clone().json();
            const results = Array.isArray(result) ? result : [result];
            if (
              results.some(
                (entry) =>
                  typeof entry === "object" &&
                  entry !== null &&
                  "error" in entry &&
                  typeof entry.error === "object" &&
                  entry.error !== null &&
                  "data" in entry.error &&
                  typeof entry.error.data === "object" &&
                  entry.error.data !== null &&
                  "sessionExpired" in entry.error.data &&
                  entry.error.data.sessionExpired === true,
              )
            ) {
              window.dispatchEvent(new Event(sessionExpiredEventName));
            }
          } catch {
            // A non-JSON error response is handled by the request caller.
          }
        }
        return response;
      },
    }),
  ],
});

export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },
  organizations: {
    active: ["organizations", "active"] as const,
    list: ["organizations", "list"] as const,
    emailSettings: ["organizations", "email-settings"] as const,
    emailSettingsEncryptionStatus: ["organizations", "email-settings-encryption-status"] as const,
  },
  users: {
    list: ["users", "list"] as const,
  },
  properties: {
    list: ["properties", "list"] as const,
    byId: (id: number) => ["properties", "byId", id] as const,
  },
  leases: {
    drafts: ["leases", "drafts"] as const,
    byId: (id: number) => ["leases", "byId", id] as const,
  },
  tenants: {
    list: ["tenants", "list"] as const,
    byId: (id: number) => ["tenants", "byId", id] as const,
  },
  notes: {
    list: (subject: NoteSubjectInput) => ["notes", "list", subject] as const,
  },
  unitOptions: {
    list: ["unitOptions", "list"] as const,
  },
  maintenanceCategories: {
    list: ["maintenanceCategories", "list"] as const,
  },
  landlords: {
    list: ["landlords", "list"] as const,
  },
  tags: {
    list: ["tags", "list"] as const,
  },
  applications: {
    list: ["applications", "list"] as const,
    byId: (id: number) => ["applications", "byId", id] as const,
  },
  applicationStatuses: {
    list: ["applicationStatuses", "list"] as const,
  },
};
