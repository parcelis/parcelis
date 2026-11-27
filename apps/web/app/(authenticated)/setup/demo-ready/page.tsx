 "use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, LayoutDashboard, Users } from "lucide-react";
import { Button } from "@parcelis/ui";
import { apiClient, queryKeys } from "../../../../components/api-client";
import { LoadingState } from "../../../../components/loading-state";
import { canViewDemoReady, dismissDemoReady } from "../../../../lib/demo-ready";

export default function DemoReadyPage() {
  const router = useRouter();
  const { data, isPending } = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => apiClient.auth.me.query(),
  });
  const accountId = data?.user.id;
  const canView = accountId !== undefined && canViewDemoReady(accountId);

  useEffect(() => {
    if (!isPending && !canView) router.replace("/");
  }, [canView, isPending, router]);

  if (accountId === undefined || !canView) return <LoadingState label="Opening your workspace…" />;

  function handleDismiss() {
    if (accountId !== undefined) dismissDemoReady(accountId);
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-full w-full flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-parcelis-charcoal dark:text-parcelis-porcelain">
          Demo setup complete
        </h1>
        <p className="max-w-2xl text-sm text-parcelis-gray dark:text-white/75">
          Your workspace is ready with starter demo records so you can explore the full workflow right away.
        </p>
      </header>

      <section className="flex flex-wrap gap-3">
        <Button asChild className="min-w-40">
          <Link href="/">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Open dashboard
          </Link>
        </Button>
        <Button asChild className="min-w-40" variant="secondary">
          <Link href="/properties">
            <Building2 className="mr-2 h-4 w-4" />
            View properties
          </Link>
        </Button>
        <Button asChild className="min-w-40" variant="secondary">
          <Link href="/tenants">
            <Users className="mr-2 h-4 w-4" />
            View tenants
          </Link>
        </Button>
        <Button className="min-w-40" onClick={handleDismiss} variant="secondary">
          Don’t show again
        </Button>
      </section>
    </main>
  );
}
