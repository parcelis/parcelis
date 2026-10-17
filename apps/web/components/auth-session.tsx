"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { LoadingState } from "./loading-state";

function SessionGuard({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { status } = useSession({
    required: true,
    onUnauthenticated() {
      queryClient.clear();
      const params = new URLSearchParams({
        next: `${window.location.pathname}${window.location.search}`,
        reason: "session-ended",
      });
      router.replace(`/login?${params.toString()}`);
    },
  });
  if (status === "authenticated") return children;

  return (
    <LoadingState
      className="min-h-screen"
      label={status === "loading" ? "Checking your session…" : "Redirecting to sign in…"}
    />
  );
}

export function AuthSession({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionGuard>{children}</SessionGuard>
    </SessionProvider>
  );
}
