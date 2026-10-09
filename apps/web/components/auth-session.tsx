"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

function SessionGuard({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { status } = useSession({
    required: true,
    onUnauthenticated() {
      queryClient.clear();
      const next = new URLSearchParams({ next: `${window.location.pathname}${window.location.search}` });
      router.replace(`/login?${next.toString()}`);
    },
  });
  return status === "authenticated" ? children : null;
}

export function AuthSession({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionGuard>{children}</SessionGuard>
    </SessionProvider>
  );
}
