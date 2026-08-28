"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import {
  AddressField,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  ParcelisLogo,
} from "@parcelis/ui";
import { apiClient, queryKeys } from "../../../../components/api-client";
import { LoadingState } from "../../../../components/loading-state";
import { SettingsRail } from "../../../../components/settings-rail";
import { ImageUploadPanel } from "../../../../components/image-upload-panel";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;
type AvatarVariant = "light" | "dark";
type AvatarChanges = Partial<Record<AvatarVariant, File | null>>;

const organizationAvatarMaxSizeBytes = 2 * 1024 * 1024;

export default function OrganizationSettingsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const activeOrganizationQuery = useQuery({
    queryKey: [...queryKeys.organizations.active, pathname],
    queryFn: () => apiClient.organizations.active.query(),
  });
  const accessibleOrganizationsQuery = useQuery({
    queryKey: queryKeys.organizations.list,
    queryFn: () => apiClient.organizations.list.query(),
  });
  const currentUserQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiClient.auth.me.query(),
  });
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [addressForm, setAddressForm] = React.useState({
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
  });
  const [isAddressPopoverOpen, setIsAddressPopoverOpen] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const updateAddressField = React.useCallback((field: keyof typeof addressForm, value: string) => {
    setAddressForm((current) => ({ ...current, [field]: value }));
  }, []);
  const addressLines = [
    addressForm.line1,
    addressForm.line2,
    [addressForm.city, addressForm.region, addressForm.postalCode].filter(Boolean).join(" "),
  ].filter(Boolean);
  const [avatarChanges, setAvatarChanges] = React.useState<AvatarChanges>({});
  const lightAvatarPreviewUrl = React.useMemo(
    () => (avatarChanges.light ? URL.createObjectURL(avatarChanges.light) : null),
    [avatarChanges.light],
  );
  const darkAvatarPreviewUrl = React.useMemo(
    () => (avatarChanges.dark ? URL.createObjectURL(avatarChanges.dark) : null),
    [avatarChanges.dark],
  );
  React.useEffect(
    () => () => {
      if (lightAvatarPreviewUrl) URL.revokeObjectURL(lightAvatarPreviewUrl);
    },
    [lightAvatarPreviewUrl],
  );
  React.useEffect(
    () => () => {
      if (darkAvatarPreviewUrl) URL.revokeObjectURL(darkAvatarPreviewUrl);
    },
    [darkAvatarPreviewUrl],
  );
  React.useEffect(() => {
    if (activeOrganizationQuery.data) {
      setName(activeOrganizationQuery.data.name);
      setSlug(activeOrganizationQuery.data.slug);
      setAddressForm({
        line1: activeOrganizationQuery.data.address.line1 ?? "",
        line2: activeOrganizationQuery.data.address.line2 ?? "",
        city: activeOrganizationQuery.data.address.city ?? "",
        region: activeOrganizationQuery.data.address.region ?? "",
        postalCode: activeOrganizationQuery.data.address.postalCode ?? "",
      });
      setPhone(activeOrganizationQuery.data.phone ?? "");
    }
  }, [activeOrganizationQuery.data]);
  const canManageOrganization = ["owner", "administrator"].includes(activeOrganizationQuery.data?.role ?? "");
  const canManageUsers = currentUserQuery.data?.user.role === "administrator";
  const saveOrganizationDetails = useMutation({
    mutationFn: async ({
      name,
      slug,
      address,
      phone,
      avatarChanges,
    }: {
      name: string;
      slug: string;
      address: { line1: string; line2: string; city: string; region: string; postalCode: string };
      phone: string;
      avatarChanges: AvatarChanges;
    }) => {
      await Promise.all(
        (Object.entries(avatarChanges) as Array<[AvatarVariant, File | null]>).map(async ([variant, file]) => {
          if (file === null) return apiClient.organizations.deleteAvatar.mutate({ variant });
          if (file.size > organizationAvatarMaxSizeBytes) {
            throw new Error("Organization avatars must be 2 MB or smaller.");
          }
          const { objectKey, uploadUrl } = await apiClient.organizations.createAvatarUploadUrl.mutate({
            contentType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            fileName: file.name,
            variant,
          });
          const response = await fetch(uploadUrl, {
            body: file,
            headers: { "Content-Type": file.type },
            method: "PUT",
          });
          if (!response.ok) throw new Error("The organization avatar could not be uploaded.");
          await apiClient.organizations.completeAvatarUpload.mutate({ objectKey, variant });
        }),
      );
      const hasAddress = Object.values(address).some((value) => value.trim().length > 0);
      const organization = await apiClient.organizations.update.mutate({
        name,
        slug,
        address: hasAddress
          ? {
              line1: address.line1 || undefined,
              line2: address.line2 || undefined,
              city: address.city || undefined,
              region: address.region || undefined,
              postalCode: address.postalCode || undefined,
            }
          : null,
        phone: phone.trim() || null,
      });
      return organization;
    },
    onSuccess: async (organization) => {
      setAvatarChanges({});
      queryClient.setQueryData(queryKeys.organizations.list, (current: typeof accessibleOrganizationsQuery.data) =>
        current?.map((membership) =>
          membership.organization.id === organization.id
            ? { ...membership, organization: { ...membership.organization, ...organization } }
            : membership,
        ),
      );
      const suffix = pathname.replace(/^(?:\/o\/[^/]+)+/, "");
      const nextPathname = `/o/${organization.slug}${suffix === "/" ? "" : suffix}`;
      if (nextPathname === pathname) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.organizations.active });
      } else {
        router.replace(nextPathname);
      }
    },
  });
  return (
    <main className="flex-1">
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
            <SettingsRail active="organization" canManageUsers={canManageUsers} />
            <div className="min-w-0 flex-1">
              <section className="mb-6 rounded-lg bg-parcelis-charcoal p-6 text-white">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Settings</p>
                <h1 className="mt-5 text-3xl font-bold md:text-5xl">Organization</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                  Manage this business’s workspace details.
                </p>
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
                  ) : canManageOrganization ? (
                    <form
                      className="flex max-w-xl flex-col gap-12"
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveOrganizationDetails.mutate({
                          name,
                          slug,
                          address: {
                            ...addressForm,
                            region: addressForm.region.toUpperCase(),
                          },
                          phone,
                          avatarChanges,
                        });
                      }}
                    >
                      <Label>Organization Avatar</Label>
                      <div className="flex flex-col gap-20 sm:flex-row">
                        <div className="min-w-0 flex-1">
                          <Label>Light mode avatar</Label>
                          <ImageUploadPanel
                            acceptedImageDescription="JPG, PNG, WebP, or GIF"
                            acceptedImageTypes={["image/jpeg", "image/png", "image/webp", "image/gif"]}
                            alt="Light mode organization avatar"
                            imagePreviewUrl={
                              avatarChanges.light === null
                                ? null
                                : (lightAvatarPreviewUrl ?? activeOrganizationQuery.data?.avatarUrl ?? null)
                            }
                            isDeletePending={saveOrganizationDetails.isPending}
                            onDelete={() => setAvatarChanges((current) => ({ ...current, light: null }))}
                            onImageChange={(file) =>
                              file && setAvatarChanges((current) => ({ ...current, light: file }))
                            }
                            previewBackground="light"
                            previewImageFit="contain"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <Label>Dark mode avatar</Label>
                          <ImageUploadPanel
                            acceptedImageDescription="JPG, PNG, WebP, or GIF"
                            acceptedImageTypes={["image/jpeg", "image/png", "image/webp", "image/gif"]}
                            alt="Dark mode organization avatar"
                            imagePreviewUrl={
                              avatarChanges.dark === null
                                ? null
                                : (darkAvatarPreviewUrl ?? activeOrganizationQuery.data?.darkAvatarUrl ?? null)
                            }
                            isDeletePending={saveOrganizationDetails.isPending}
                            onDelete={() => setAvatarChanges((current) => ({ ...current, dark: null }))}
                            onImageChange={(file) =>
                              file && setAvatarChanges((current) => ({ ...current, dark: file }))
                            }
                            previewBackground="dark"
                            previewImageFit="contain"
                          />
                        </div>
                      </div>
                      <Label>
                        Organization name
                        <Input
                          className="mt-1"
                          onChange={(event) => setName(event.target.value)}
                          required
                          value={name}
                        />
                      </Label>
                      <Label>
                        Organization URL
                        <div className="mt-1 flex items-center rounded-md border border-parcelis-border bg-white focus-within:border-parcelis-green">
                          <span className="border-r border-parcelis-border px-3 py-2 text-sm text-parcelis-gray">
                            /o/
                          </span>
                          <Input
                            className="border-0"
                            onChange={(event) => setSlug(event.target.value.toLowerCase())}
                            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                            required
                            value={slug}
                          />
                        </div>
                        <span className="mt-1 block text-xs text-parcelis-gray">
                          Lowercase letters, numbers, and hyphens only.
                        </span>
                      </Label>
                      <AddressField
                        addressLines={addressLines}
                        ariaLabel="Show organization address details"
                        label="Organization Address"
                        onChange={updateAddressField}
                        onOpenChange={setIsAddressPopoverOpen}
                        open={isAddressPopoverOpen}
                        values={addressForm}
                      />
                      <Label>
                        Organization phone number
                        <Input
                          className="mt-1"
                          maxLength={50}
                          onChange={(event) => setPhone(event.target.value)}
                          type="tel"
                          value={phone}
                        />
                      </Label>
                      <Button
                        className="min-w-40 self-start"
                        disabled={saveOrganizationDetails.isPending}
                        type="submit"
                      >
                        Update organization
                      </Button>
                    </form>
                  ) : (
                    <div className="max-w-xl space-y-4 text-sm">
                      <p className="text-parcelis-gray">You have view-only access to this organization’s settings.</p>
                      <div>
                        <p className="font-medium text-parcelis-charcoal">Organization name</p>
                        <p className="mt-1 text-parcelis-gray">{activeOrganizationQuery.data?.name}</p>
                      </div>
                      <div>
                        <p className="font-medium text-parcelis-charcoal">Organization URL</p>
                        <p className="mt-1 text-parcelis-gray">/o/{activeOrganizationQuery.data?.slug}</p>
                      </div>
                      <div>
                        <p className="font-medium text-parcelis-charcoal">Organization address</p>
                        <p className="mt-1 text-parcelis-gray">
                          {[
                            activeOrganizationQuery.data?.address.line1,
                            activeOrganizationQuery.data?.address.line2,
                            [
                              activeOrganizationQuery.data?.address.city,
                              activeOrganizationQuery.data?.address.region,
                              activeOrganizationQuery.data?.address.postalCode,
                            ]
                              .filter(Boolean)
                              .join(", "),
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Not provided"}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-parcelis-charcoal">Organization phone number</p>
                        <p className="mt-1 text-parcelis-gray">
                          {activeOrganizationQuery.data?.phone ?? "Not provided"}
                        </p>
                      </div>
                    </div>
                  )}
                  {saveOrganizationDetails.error ? (
                    <p className="mt-3 text-sm font-medium text-red-700">{saveOrganizationDetails.error.message}</p>
                  ) : null}
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
