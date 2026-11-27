 "use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, LayoutDashboard, Users } from "lucide-react";
import { Button } from "@parcelis/ui";

export default function DemoReadyPage() {
  const router = useRouter();

  function dismissDemoReady() {
    try {
      window.localStorage.setItem("parcelis-demo-ready-dismissed", "true");
    } catch {
      // no-op
    }
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
        <Button className="min-w-40" onClick={dismissDemoReady} variant="secondary">
          Don’t show again
        </Button>
      </section>

      <section className="flex items-center rounded-lg border border-parcelis-border/70 bg-white/70 px-4 py-3 text-sm text-parcelis-gray dark:bg-parcelis-charcoal/35 dark:text-white/75">
        When you are ready to use your own data, replace demo records from settings and continue setup in your
        preferred order.
        <Link className="ml-2 inline-flex items-center font-semibold text-parcelis-green-hover" href="/settings/profile">
          Continue setup
          <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </section>
    </main>
  );
}
