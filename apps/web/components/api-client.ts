"use client";

import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@parcelis/api/router";
import type { NoteSubjectInput } from "@parcelis/schemas";

export const apiClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/trpc`,
      fetch(url, options) {
        return fetch(url, { ...options, credentials: "include" });
      },
    }),
  ],
});

export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },
  roles: {
    list: ["roles", "list"] as const,
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
