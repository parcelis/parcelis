"use client";

import { SettingsPanel, SettingsPanelHeader } from "@parcelis/ui";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { AddressField, Badge, Button, Card, CardContent, CardHeader, Input, Label, TimezoneSelect } from "@parcelis/ui";
import { OrganizationContactInformation } from "../../../../../components/organization-contact-information";
import { apiClient, createApiClient, queryKeys } from "../../../../../components/api-client";
import {
  assertImageFileSize,
  uploadPresignedFile,
  type ImageContentType,
} from "../../../../../components/image-upload";
import { LoadingState } from "../../../../../components/loading-state";
import { SettingsRail } from "../../../../../components/settings-rail";
import { ImageUploadPanel } from "../../../../../components/image-upload-panel";
import { settingUpdatedMessage } from "../../../../../components/toast-messages";
import { useOrganizationCurrency } from "../../../../../components/organization-currency";
import { OrganizationCurrencyField } from "../../../../../components/organization-currency-field";
import type { CurrencyCode } from "@parcelis/schemas";

type AvatarVariant = "light" | "dark";
type AvatarChanges = Partial<Record<AvatarVariant, File | null>>;
type OrganizationFormValues = {
  name: string;
  slug: string;
  address: { line1: string; line2: string; city: string; region: string; postalCode: string };
  phone: string;
  email: string;
  timeZone: string;
};
type OrganizationFormField = Exclude<keyof OrganizationFormValues, "address"> | keyof OrganizationFormValues["address"];
type FormEdits = Partial<Record<OrganizationFormField, number>>;

function getOrganizationFormValues(
  organization: Pick<
    Awaited<ReturnType<typeof apiClient.organizations.update.mutate>>,
    "name" | "slug" | "address" | "phone" | "email" | "timeZone"
  >,
): OrganizationFormValues {
  return {
    name: organization.name,
    slug: organization.slug,
    address: {
      line1: organization.address.line1 ?? "",
      line2: organization.address.line2 ?? "",
      city: organization.address.city ?? "",
      region: organization.address.region ?? "",
      postalCode: organization.address.postalCode ?? "",
    },
    phone: organization.phone ?? "",
    email: organization.email ?? "",
    timeZone: organization.timeZone,
  };
}

export default function OrganizationSettingsPage() {
  const currencySettings = useOrganizationCurrency();
  const [currencyCode, setCurrencyCode] = React.useState<CurrencyCode | null>(null);
  const formOrganizationId = React.useRef<number | null>(null);
  const formEdits = React.useRef<FormEdits>({});
  const editRevision = React.useRef(0);
  const queryClient = useQueryClient();
  const router = useRouter();
  React.useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.organizations.currency });
  }, [queryClient]);
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
  const [email, setEmail] = React.useState("");
  const [timeZone, setTimeZone] = React.useState("UTC");
  const markFieldEdited = React.useCallback((field: OrganizationFormField) => {
    formEdits.current[field] = ++editRevision.current;
  }, []);
  const updateAddressField = React.useCallback((field: keyof typeof addressForm, value: string) => {
    formEdits.current[field] = ++editRevision.current;
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
  const synchronizeOrganizationForm = React.useCallback((next: OrganizationFormValues) => {
    const synchronize = (field: Exclude<keyof OrganizationFormValues, "address">) => (current: string) =>
      formEdits.current[field] === undefined ? next[field] : current;
    setName(synchronize("name"));
    setSlug(synchronize("slug"));
    setPhone(synchronize("phone"));
    setEmail(synchronize("email"));
    setTimeZone(synchronize("timeZone"));
    setAddressForm((current) => {
      const address = { ...current };
      for (const field of Object.keys(address) as Array<keyof typeof address>) {
        if (formEdits.current[field] === undefined) address[field] = next.address[field];
      }
      return Object.keys(address).every(
        (field) => address[field as keyof typeof address] === current[field as keyof typeof current],
      )
        ? current
        : address;
    });
  }, []);
  React.useEffect(() => {
    const organization = activeOrganizationQuery.data;
    if (!organization) return;
    if (formOrganizationId.current !== organization.id) {
      formOrganizationId.current = organization.id;
      formEdits.current = {};
    }
    const next = getOrganizationFormValues(organization);
    synchronizeOrganizationForm(next);
  }, [activeOrganizationQuery.data, synchronizeOrganizationForm]);
  const canManageOrganization = ["owner", "administrator"].includes(activeOrganizationQuery.data?.role ?? "");
  const canManageUsers = currentUserQuery.data?.permissions.users.view ?? false;
  const canManageRoles = currentUserQuery.data?.user.role === "administrator";
  const refreshOrganizationCurrency = async (organizationSlug: string) => {
    const client = createApiClient(organizationSlug);
    await queryClient.cancelQueries({ queryKey: queryKeys.organizations.currency });
    await queryClient
      .fetchQuery({
        queryKey: queryKeys.organizations.currency,
        queryFn: () => client.organizations.currency.query(),
        staleTime: 0,
      })
      .catch(() => undefined);
  };
  const saveOrganizationDetails = useMutation({
    mutationFn: async ({
      name,
      slug,
      address,
      phone,
      email,
      timeZone,
      avatarChanges,
      currencyCode,
      organizationSlug,
    }: OrganizationFormValues & {
      organizationSlug: string;
      editRevisions: FormEdits;
      avatarChanges: AvatarChanges;
      currencyCode?: CurrencyCode;
    }) => {
      const client = createApiClient(organizationSlug);
      await Promise.all(
        (Object.entries(avatarChanges) as Array<[AvatarVariant, File | null]>).map(async ([variant, file]) => {
          if (file === null) return client.organizations.deleteAvatar.mutate({ variant });
          assertImageFileSize(file);
          const { fields, objectKey, uploadUrl } = await client.organizations.createAvatarUploadUrl.mutate({
            contentType: file.type as ImageContentType,
            fileSize: file.size,
            fileName: file.name,
            variant,
          });
          await uploadPresignedFile(file, { fields, uploadUrl }, "The organization avatar could not be uploaded.");
          await client.organizations.completeAvatarUpload.mutate({ objectKey, variant });
        }),
      );
      const hasAddress = Object.values(address).some((value) => value.trim().length > 0);
      const organization = await client.organizations.update.mutate({
        name,
        slug,
        address: hasAddress
          ? {
              line1: address.line1 || undefined,
              line2: address.line2 || undefined,
              city: address.city || undefined,
              region: address.region.toUpperCase() || undefined,
              postalCode: address.postalCode || undefined,
            }
          : null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        timeZone,
        currencyCode,
      });
      return organization;
    },
    onSuccess: async (organization, variables) => {
      const values = getOrganizationFormValues(organization);
      if (window.location.pathname === pathname) {
        for (const field of Object.keys(formEdits.current) as OrganizationFormField[]) {
          if (formEdits.current[field] === variables.editRevisions[field]) delete formEdits.current[field];
        }
        synchronizeOrganizationForm(values);
        setAvatarChanges({});
        setCurrencyCode(null);
      }
      await refreshOrganizationCurrency(organization.slug);
      const refetchType = () =>
        window.location.pathname.match(/^\/o\/([^/]+)/)?.[1] === variables.organizationSlug &&
        organization.slug === variables.organizationSlug
          ? ("active" as const)
          : ("none" as const);
      await queryClient.invalidateQueries({
        predicate: (query) => !["organizations", "auth"].includes(String(query.queryKey[0])),
        refetchType: refetchType(),
      });
      queryClient.setQueryData(queryKeys.organizations.list, (current: typeof accessibleOrganizationsQuery.data) =>
        current?.map((membership) =>
          membership.organization.id === organization.id
            ? { ...membership, organization: { ...membership.organization, ...organization } }
            : membership,
        ),
      );
      queryClient.setQueriesData(
        { queryKey: queryKeys.organizations.active },
        (current: typeof activeOrganizationQuery.data) =>
          current?.id === organization.id ? { ...current, ...organization } : current,
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.active,
        refetchType: refetchType(),
      });
      const currentPathname = window.location.pathname;
      if (currentPathname.match(/^\/o\/([^/]+)/)?.[1] !== variables.organizationSlug) return;
      const suffix = currentPathname.replace(/^(?:\/o\/[^/]+)+/, "");
      const nextPathname = `/o/${organization.slug}${suffix === "/" ? "" : suffix}`;
      if (nextPathname !== currentPathname) router.replace(nextPathname);
      toast.success(settingUpdatedMessage("Organization"));
    },
    onError: async (_error, variables) => {
      await refreshOrganizationCurrency(variables.organizationSlug);
    },
  });
  return (
    <main className="flex-1">
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="parcelis-mobile-nav-header sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/">Portfolio</Link>
            </Button>
          </div>
        </header>

        <div className="parcelis-page-shell">
          <SettingsPanel
            navigation={
              <SettingsRail
                active="organization"
                canManageInvoicing={currentUserQuery.data?.permissions.invoices.view ?? false}
                canManageRoles={canManageRoles}
                canManageUsers={canManageUsers}
              />
            }
            header={
              <SettingsPanelHeader
                title={<>Organization</>}
                description={<>Manage this business’s workspace details.</>}
              />
            }
          >
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
                      if (!activeOrganizationQuery.data) return;
                      saveOrganizationDetails.mutate({
                        organizationSlug: activeOrganizationQuery.data.slug,
                        editRevisions: { ...formEdits.current },
                        name,
                        slug,
                        address: addressForm,
                        phone,
                        email,
                        timeZone,
                        avatarChanges,
                        currencyCode:
                          currencySettings.canChangeCurrency &&
                          currencyCode !== null &&
                          currencyCode !== currencySettings.currencyCode
                            ? currencyCode
                            : undefined,
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
                          onImageChange={(file) => file && setAvatarChanges((current) => ({ ...current, light: file }))}
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
                          onImageChange={(file) => file && setAvatarChanges((current) => ({ ...current, dark: file }))}
                          previewBackground="dark"
                          previewImageFit="contain"
                        />
                      </div>
                    </div>
                    <Label>
                      Organization name
                      <Input
                        className="mt-1"
                        onChange={(event) => {
                          markFieldEdited("name");
                          setName(event.target.value);
                        }}
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
                          onChange={(event) => {
                            markFieldEdited("slug");
                            setSlug(event.target.value.toLowerCase());
                          }}
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
                        onChange={(event) => {
                          markFieldEdited("phone");
                          setPhone(event.target.value);
                        }}
                        type="tel"
                        value={phone}
                      />
                    </Label>
                    <Label>
                      Organization email address (optional)
                      <Input
                        autoComplete="email"
                        className="mt-1"
                        disabled={saveOrganizationDetails.isPending}
                        maxLength={320}
                        onChange={(event) => {
                          markFieldEdited("email");
                          setEmail(event.target.value);
                        }}
                        type="email"
                        value={email}
                      />
                    </Label>
                    <div>
                      <Label>Organization Timezone</Label>
                      <div className="mt-1">
                        <TimezoneSelect
                          onChange={(value) => {
                            markFieldEdited("timeZone");
                            setTimeZone(value);
                          }}
                          value={timeZone}
                        />
                      </div>
                      <p className="mt-1 text-xs text-parcelis-gray">
                        Notes and lease lifecycle dates use this timezone.
                      </p>
                    </div>
                    <OrganizationCurrencyField
                      settings={currencySettings}
                      value={currencyCode ?? currencySettings.currencyCode}
                      onChange={setCurrencyCode}
                      isPending={saveOrganizationDetails.isPending}
                    />
                    <Button
                      className="min-w-40 self-start"
                      aria-busy={saveOrganizationDetails.isPending}
                      disabled={saveOrganizationDetails.isPending}
                      type="submit"
                    >
                      Update organization
                    </Button>
                    {saveOrganizationDetails.isPending ? (
                      <p role="status" className="text-sm text-parcelis-gray">
                        Saving organization…
                      </p>
                    ) : null}
                  </form>
                ) : (
                  <div className="max-w-xl space-y-4 text-sm">
                    <p className="text-parcelis-gray">You have view-only access to this organization’s settings.</p>
                    <OrganizationCurrencyField settings={currencySettings} value={currencySettings.currencyCode} />
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
                      <p className="mt-1 text-parcelis-gray">{activeOrganizationQuery.data?.phone ?? "Not provided"}</p>
                    </div>
                    <div>
                      <p className="font-medium text-parcelis-charcoal">Organization email address</p>
                      <p className="mt-1 break-words text-parcelis-gray">
                        {activeOrganizationQuery.data?.email ?? "Not provided"}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-parcelis-charcoal">Timezone for lease dates</p>
                      <p className="mt-1 text-parcelis-gray">{activeOrganizationQuery.data?.timeZone}</p>
                    </div>
                  </div>
                )}
                {saveOrganizationDetails.error ? (
                  <p className="mt-3 text-sm font-medium text-red-700" role="alert">
                    <span>{saveOrganizationDetails.error.message}</span>{" "}
                    <span>Your entered settings have been kept. Review the saved currency before retrying.</span>
                  </p>
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
                        <li
                          className="flex flex-wrap items-center justify-between gap-4 px-4 py-3"
                          key={organization.id}
                        >
                          <div className="min-w-0 flex-1 basis-40">
                            <p className="break-words font-semibold text-parcelis-charcoal">{organization.name}</p>
                            <p className="mt-1 text-sm capitalize text-parcelis-gray">{role}</p>
                          </div>
                          <div className="flex min-w-0 flex-wrap items-center gap-3">
                            {isActive ? <Badge>Current</Badge> : null}
                            <OrganizationContactInformation organization={organization} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-parcelis-gray">You do not have access to any organizations.</p>
                )}
              </CardContent>
            </Card>
          </SettingsPanel>
        </div>
      </section>
    </main>
  );
}
