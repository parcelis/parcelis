"use client";

import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@parcelis/api/router";
import type { NoteSubjectInput } from "@parcelis/schemas";

export function createApiClient(organizationSlug?: string) {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: "/trpc",
        async fetch(url, options) {
          const requestOrganizationSlug =
            organizationSlug ??
            (typeof window === "undefined" ? null : window.location.pathname.match(/^\/o\/([^/]+)/)?.[1]);
          const headers = new Headers(options?.headers);
          if (requestOrganizationSlug) {
            headers.set("x-parcelis-organization-slug", requestOrganizationSlug);
          }
          const response = await fetch(url, { ...options, credentials: "include", headers });
          return response;
        },
      }),
    ],
  });
}

export const apiClient = createApiClient();

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
  apiTokens: {
    all: (organizationId: number) => ["apiTokens", organizationId] as const,
    list: (organizationId: number, cursor?: string) => ["apiTokens", organizationId, "list", cursor ?? null] as const,
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
  invoices: {
    charges: ["invoices", "charges"] as const,
  },
};
