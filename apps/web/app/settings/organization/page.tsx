"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, Input, Label, ParcelisLogo } from "@parcelis/ui";
import { apiClient, queryKeys } from "../../../components/api-client";
import { LoadingState } from "../../../components/loading-state";
import { SettingsRail } from "../../../components/settings-rail";
import { Sidebar } from "../../../components/sidebar";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

export default function OrganizationSettingsPage() {
  const queryClient = useQueryClient();
  const organizationQuery = useQuery({
    queryKey: queryKeys.organizations.active,
    queryFn: () => apiClient.organizations.active.query(),
  });
  const organizationsQuery = useQuery({
    queryKey: queryKeys.organizations.list,
    queryFn: () => apiClient.organizations.list.query(),
  });
  const [name, setName] = React.useState("");
  React.useEffect(() => {
    if (organizationQuery.data) setName(organizationQuery.data.name);
  }, [organizationQuery.data]);
  const updateOrganizationMutation = useMutation({
    mutationFn: (organizationName: string) => apiClient.organizations.update.mutate({ name: organizationName }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations.active });
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations.list });
    },
  });

  return (
    <main className="flex-1">
      <Sidebar active="settings" />
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/">Portfolio</Link>
            </Button>
          </div>
        </header>

        <div className="parcelis-page-shell">
          <div className="flex flex-col gap-6 md:flex-row">
            <SettingsRail active="organization" />
            <div className="min-w-0 flex-1">
              <section className="mb-6 rounded-lg bg-parcelis-charcoal p-6 text-white">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Settings</p>
                <h1 className="mt-5 text-3xl font-bold md:text-5xl">Organization</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">Manage this business’s workspace details.</p>
              </section>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-semibold text-parcelis-charcoal">Organization details</h2>
                      <p className="mt-1 text-sm text-parcelis-gray">
                        {organizationQuery.data?.name ?? "Loading organization…"}
                      </p>
                    </div>
                    <Building2 className="h-5 w-5 text-parcelis-green" />
                  </div>
                </CardHeader>
                <CardContent>
                  {organizationQuery.isLoading ? (
                    <LoadingState label="Loading organization…" />
                  ) : organizationQuery.error ? (
                    <p className="text-sm font-medium text-red-700">{organizationQuery.error.message}</p>
                  ) : (
                    <form
                      className="flex max-w-xl flex-col gap-4 sm:flex-row sm:items-end"
                      onSubmit={(event) => {
                        event.preventDefault();
                        updateOrganizationMutation.mutate(name);
                      }}
                    >
                      <Label className="flex-1">
                        Organization name
                        <Input className="mt-1" onChange={(event) => setName(event.target.value)} required value={name} />
                      </Label>
                      <Button className="min-w-40" disabled={updateOrganizationMutation.isPending} type="submit">
                        Save organization
                      </Button>
                    </form>
                  )}
                  {organizationQuery.data ? (
                    <dl className="mt-6 grid gap-4 border-t border-parcelis-border pt-5 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="font-medium text-parcelis-gray">Organization</dt>
                        <dd className="mt-1 font-semibold text-parcelis-charcoal">{organizationQuery.data.name}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-parcelis-gray">Your role</dt>
                        <dd className="mt-1 font-semibold capitalize text-parcelis-charcoal">{organizationQuery.data.role}</dd>
                      </div>
                    </dl>
                  ) : null}
                  {updateOrganizationMutation.error ? <p className="mt-3 text-sm font-medium text-red-700">{updateOrganizationMutation.error.message}</p> : null}
                </CardContent>
              </Card>

              <Card className="mt-6">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-semibold text-parcelis-charcoal">Organizations</h2>
                      <p className="mt-1 text-sm text-parcelis-gray">Organizations you can access in Parcelis.</p>
                    </div>
                    <Badge variant="secondary">{organizationsQuery.data?.length ?? 0}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {organizationsQuery.isLoading ? (
                    <LoadingState label="Loading organizations…" />
                  ) : organizationsQuery.error ? (
                    <p className="text-sm font-medium text-red-700">{organizationsQuery.error.message}</p>
                  ) : organizationsQuery.data?.length ? (
                    <ul className="divide-y divide-parcelis-border rounded-md border border-parcelis-border">
                      {organizationsQuery.data.map(({ organization, role }) => {
                        const isActive = organization.id === organizationQuery.data?.id;
                        return (
                          <li className="flex items-center justify-between gap-4 px-4 py-3" key={organization.id}>
                            <div>
                              <p className="font-semibold text-parcelis-charcoal">{organization.name}</p>
                              <p className="mt-1 text-sm capitalize text-parcelis-gray">{role}</p>
                            </div>
                            {isActive ? <Badge>Current</Badge> : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-parcelis-gray">You do not have access to any organizations.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
