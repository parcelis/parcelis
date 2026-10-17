"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@parcelis/ui";
import { apiClient, queryKeys } from "../../../../components/api-client";
import { LoadingState } from "../../../../components/loading-state";

export default function JobsPage() {
  const currentUserQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => apiClient.auth.me.query(),
  });
  const isAdministrator = currentUserQuery.data?.user.role === "administrator";

  return (
    <main className="flex min-h-0 flex-1 flex-col transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
      {isAdministrator ? (
        <iframe
          className="min-h-[calc(100svh-4rem)] w-full flex-1 border-0"
          src="/admin/jobs/?embedded=1"
          title="Job dashboard"
        />
      ) : (
        <div className="parcelis-page-shell">
          {currentUserQuery.isLoading ? (
            <LoadingState label="Loading account…" />
          ) : currentUserQuery.error ? (
            <p className="text-sm font-medium text-red-700">{currentUserQuery.error.message}</p>
          ) : (
            <Card>
              <CardContent className="py-8 text-sm text-parcelis-gray">Administrator access is required.</CardContent>
            </Card>
          )}
        </div>
      )}
    </main>
  );
}
