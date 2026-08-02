"use client";

import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@parcelis/api/router";
import type { NoteSubjectInput } from "@parcelis/schemas";

export const apiClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/trpc`,
    }),
  ],
});

export const queryKeys = {
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
  tags: {
    list: ["tags", "list"] as const,
  },
};
