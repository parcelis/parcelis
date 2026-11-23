"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";

export function TrpcProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const slug = pathname.match(/^\/o\/([^/]+)/)?.[1] ?? "";
  const [clients] = React.useState(() => new Map<string, QueryClient>());
  const queryClient = React.useMemo(() => {
    let client = clients.get(slug);
    if (!client) {
      client = new QueryClient();
      clients.set(slug, client);
    }
    return client;
  }, [clients, slug]);
  return (
    <QueryClientProvider client={queryClient} key={slug}>
      {children}
    </QueryClientProvider>
  );
}
