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
import { ImageUploadPanel } from "../../../components/image-upload-panel";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

export default function OrganizationSettingsPage() {
  const queryClient = useQueryClient();
  const activeOrganizationQuery = useQuery({
    queryKey: queryKeys.organizations.active,
    queryFn: () => apiClient.organizations.active.query(),
  });
  const accessibleOrganizationsQuery = useQuery({
    queryKey: queryKeys.organizations.list,
    queryFn: () => apiClient.organizations.list.query(),
  });
  const [name, setName] = React.useState("");
  React.useEffect(() => {
    if (activeOrganizationQuery.data) setName(activeOrganizationQuery.data.name);
  }, [activeOrganizationQuery.data]);
  const saveOrganizationDetails = useMutation({
    mutationFn: (organizationName: string) => apiClient.organizations.update.mutate({ name: organizationName }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations.active });
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations.list });
    },
  });
  const uploadOrganizationAvatar = useMutation({
    mutationFn: async (file: File) => {
      if (!new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/gif"]).has(file.type)) {
        throw new Error("Choose a JPG, PNG, WebP, SVG, or GIF image.");
      }
      const { objectKey, uploadUrl } = await apiClient.organizations.createAvatarUploadUrl.mutate({
        contentType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/svg+xml" | "image/gif",
        fileName: file.name,
      });
      const response = await fetch(uploadUrl, { body: file, headers: { "Content-Type": file.type }, method: "PUT" });
      if (!response.ok) throw new Error("The organization avatar could not be uploaded.");
      await apiClient.organizations.completeAvatarUpload.mutate({ objectKey });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.organizations.active }),
  });
  const removeOrganizationAvatar = useMutation({
    mutationFn: () => apiClient.organizations.deleteAvatar.mutate(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.organizations.active }),
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
                      <h2 className="font-semibold text-parcelis-charcoal">General</h2>
                      <p className="mt-1 text-sm text-parcelis-gray">Here you can edit your organization’s settings.</p>
                    </div>
                    <Building2 className="h-5 w-5 text-parcelis-green" />
                  </div>
                </CardHeader>
                <CardContent>
                  {activeOrganizationQuery.isLoading ? (
                    <LoadingState label="Loading organization…" />
                  ) : activeOrganizationQuery.error ? (
                    <p className="text-sm font-medium text-red-700">{activeOrganizationQuery.error.message}</p>
                  ) : (
                    <form
                      className="flex max-w-xl flex-col gap-5"
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveOrganizationDetails.mutate(name);
                      }}
                    >
                      <Label>
                        Avatar
                      </Label>
                      <ImageUploadPanel
                        acceptedImageDescription="JPG, PNG, WebP, SVG, or GIF"
                        acceptedImageTypes={["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/gif"]}
                        alt="Organization avatar"
                        imagePreviewUrl={activeOrganizationQuery.data?.avatarUrl ?? null}
                        isDeletePending={removeOrganizationAvatar.isPending}
                        onDelete={() => removeOrganizationAvatar.mutate()}
                        onImageChange={(file) => file && uploadOrganizationAvatar.mutate(file)}
                      />
                      <Label>
                        Organization name
                        <Input className="mt-1" onChange={(event) => setName(event.target.value)} required value={name} />
                      </Label>
                      <Button className="min-w-40 self-start" disabled={saveOrganizationDetails.isPending} type="submit">Save organization</Button>
                    </form>
                  )}
                  {activeOrganizationQuery.data ? (
                    <dl className="mt-6 grid gap-4 border-t border-parcelis-border pt-5 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="font-medium text-parcelis-gray">Organization</dt>
                        <dd className="mt-1 font-semibold text-parcelis-charcoal">{activeOrganizationQuery.data.name}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-parcelis-gray">Your role</dt>
                        <dd className="mt-1 font-semibold capitalize text-parcelis-charcoal">{activeOrganizationQuery.data.role}</dd>
                      </div>
                    </dl>
                  ) : null}
                  {uploadOrganizationAvatar.error ? <p className="mt-3 text-sm font-medium text-red-700">{uploadOrganizationAvatar.error.message}</p> : null}
                  {removeOrganizationAvatar.error ? <p className="mt-3 text-sm font-medium text-red-700">{removeOrganizationAvatar.error.message}</p> : null}
                  {saveOrganizationDetails.error ? <p className="mt-3 text-sm font-medium text-red-700">{saveOrganizationDetails.error.message}</p> : null}
                </CardContent>
              </Card>

              <Card className="mt-6">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-semibold text-parcelis-charcoal">Organizations</h2>
                      <p className="mt-1 text-sm text-parcelis-gray">Organizations you can access in Parcelis.</p>
                    </div>
                    <Badge variant="secondary">{accessibleOrganizationsQuery.data?.length ?? 0}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {accessibleOrganizationsQuery.isLoading ? (
                    <LoadingState label="Loading organizations…" />
                  ) : accessibleOrganizationsQuery.error ? (
                    <p className="text-sm font-medium text-red-700">{accessibleOrganizationsQuery.error.message}</p>
                  ) : accessibleOrganizationsQuery.data?.length ? (
                    <ul className="divide-y divide-parcelis-border rounded-md border border-parcelis-border">
                      {accessibleOrganizationsQuery.data.map(({ organization, role }) => {
                        const isActive = organization.id === activeOrganizationQuery.data?.id;
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
