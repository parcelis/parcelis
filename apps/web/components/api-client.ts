"use client";

import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@parcelis/api/router";

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
    byId: (id: string) => ["properties", "byId", id] as const,
  },
};
