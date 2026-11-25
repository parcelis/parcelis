"use client";

import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  ParcelisLogo,
  SettingsPanel,
  SettingsPanelHeader,
} from "@parcelis/ui";
import { Copy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { apiClient, queryKeys } from "../../../../../components/api-client";
import { LoadingState } from "../../../../../components/loading-state";
import { SettingsRail } from "../../../../../components/settings-rail";
import { parcelisAccountsOrigin } from "@parcelis/schemas";
import { LicenseCards } from "./license-cards";

export default function OrganizationInstallationPage() {
  const pathname = usePathname();
  const currentUserQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => apiClient.auth.me.query(),
  });
  const installationQuery = useQuery({
    queryKey: ["organizations", "installation-identity", pathname],
    queryFn: () => apiClient.organizations.installationIdentity.query(),
    retry: false,
  });
  const installationId = installationQuery.data?.installationId;

  async function copyInstallationId() {
    if (!installationId) return;

    try {
      await navigator.clipboard.writeText(installationId);
      toast.success("Installation ID copied.");
    } catch {
      toast.error("Couldn’t copy the installation ID. Select it and copy it manually.");
    }
  }

  return (
    <main className="flex-1">
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo
                darkLogoSrc={process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL}
                logoSrc={process.env.NEXT_PUBLIC_BRAND_LOGO_URL}
                markOnly
              />
            </div>
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/">Portfolio</Link>
            </Button>
          </div>
        </header>

        <div className="parcelis-page-shell">
          <SettingsPanel
            navigation={
              <SettingsRail
                active="installation"
                canManageInvoicing={currentUserQuery.data?.permissions.invoices.view ?? false}
                canManageRoles={currentUserQuery.data?.user.role === "administrator"}
                canManageUsers={currentUserQuery.data?.permissions.users.view ?? false}
              />
            }
            header={
              <SettingsPanelHeader
                title="Installation"
                description="View your plan, app version, and installation ID."
              />
            }
          >
            <p className="text-sm text-parcelis-gray">
              View your account in the{" "}
              <a
                href={parcelisAccountsOrigin}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-parcelis-green underline underline-offset-4 hover:text-parcelis-green-hover"
              >
                Parcelis Portal
              </a>
              .
            </p>
            {installationQuery.isSuccess ? (
              <LicenseCards
                pathname={pathname}
                canManageLicense={currentUserQuery.data?.user.role === "administrator"}
                installationUrl={installationQuery.data.installationUrl}
              />
            ) : null}
            <Card aria-labelledby="installation-details-heading">
              <CardContent className="flex flex-col gap-4 text-sm">
                <h2 id="installation-details-heading" className="text-lg font-semibold text-parcelis-charcoal">
                  Installation
                </h2>
                {installationQuery.isPending ? (
                  <LoadingState label="Loading installation details…" />
                ) : installationQuery.isError ? (
                  <p className="text-sm text-red-700" role="alert">
                    {installationQuery.error instanceof TRPCClientError &&
                    installationQuery.error.data?.code === "FORBIDDEN"
                      ? "Organization owner or administrator access is required."
                      : "Installation details couldn’t be loaded."}
                  </p>
                ) : (
                  <>
                    <dl className="flex flex-col gap-1 text-sm">
                      <dt className="font-medium">App version</dt>
                      <dd>{installationQuery.data.releaseVersion ?? "—"}</dd>
                    </dl>
                    <div className="flex flex-col gap-2">
                      {installationId ? (
                        <>
                          <Label htmlFor="installation-id">Installation ID</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              id="installation-id"
                              className="min-w-0 font-mono"
                              readOnly
                              value={installationId}
                              onFocus={(event) => event.currentTarget.select()}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="size-8 shrink-0 px-0"
                              aria-label="Copy installation ID"
                              onClick={copyInstallationId}
                            >
                              <Copy className="size-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-parcelis-gray">An installation ID hasn’t been created yet.</p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </SettingsPanel>
        </div>
      </section>
    </main>
  );
}
