"use client";

import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@parcelis/api/router";
import type { NoteSubjectInput } from "@parcelis/schemas";

export const apiClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${process.env.NEXT_PUBLIC_API_URL ?? ""}/trpc`,
      fetch(url, options) {
        const organizationSlug = typeof window === "undefined" ? null : window.location.pathname.match(/^\/o\/([^/]+)/)?.[1];
        const headers = new Headers(options?.headers);
        if (organizationSlug) headers.set("x-parcelis-organization-slug", organizationSlug);
        return fetch(url, { ...options, credentials: "include", headers });
      },
    }),
  ],
});

export const queryKeys = {
  organizations: {
    active: ["organizations", "active"] as const,
    list: ["organizations", "list"] as const,
  },
  users: {
    list: ["users", "list"] as const,
  },
  properties: {
    list: ["properties", "list"] as const,
    byId: (id: number) => ["properties", "byId", id] as const,
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
};
