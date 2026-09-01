"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleUserRound } from "lucide-react";
import { Button, Card, CardContent, CardHeader, Input, Label, ParcelisLogo } from "@parcelis/ui";
import type { UserRole } from "@parcelis/schemas";
import { apiClient, queryKeys } from "../../../../../components/api-client";
import { LoadingState } from "../../../../../components/loading-state";
import { SettingsRail } from "../../../../../components/settings-rail";
import { ImageUploadPanel } from "../../../../../components/image-upload-panel";
import { AccountInfoCard } from "../../../../../components/account-info-card";
import { deleteUserProfileImage, uploadUserProfileImage } from "../../../../../components/user-profile-image-upload";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

function formatRole(role: UserRole | undefined) {
  return role
    ? role
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "Not set";
}

export default function UserProfilePage() {
  const { id: idParam } = useParams<{ id: string }>();
  const userId = Number(idParam);
  const queryClient = useQueryClient();
  const currentUserQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => apiClient.auth.me.query(),
  });
  const profileQuery = useQuery({
    queryKey: ["users", "profile", userId],
    queryFn: () => apiClient.users.profile.query({ id: userId }),
    enabled: Number.isInteger(userId) && userId > 0,
  });
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [profileImageFile, setProfileImageFile] = React.useState<File | null>(null);
  const profileImagePreviewUrl = React.useMemo(
    () => (profileImageFile ? URL.createObjectURL(profileImageFile) : null),
    [profileImageFile],
  );

  React.useEffect(
    () => () => {
      if (profileImagePreviewUrl) URL.revokeObjectURL(profileImagePreviewUrl);
    },
    [profileImagePreviewUrl],
  );

  React.useEffect(() => {
    const user = profileQuery.data;
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setPhone(user.phone ?? "");
  }, [profileQuery.data]);

  const isOwnProfile = currentUserQuery.data?.user.id === userId;
  const organizationRole = currentUserQuery.data?.organizationRole;
  const canEditEmail = !isOwnProfile && (organizationRole === "owner" || organizationRole === "administrator");
  const updateProfileMutation = useMutation({
    scope: { id: `user-profile-${userId}` },
    mutationFn: async () => {
      const profile = await apiClient.users.updateProfile.mutate({
        id: userId,
        name,
        ...(canEditEmail ? { email } : {}),
        phone: phone.trim() || null,
      });
      if (profileImageFile) await uploadUserProfileImage(userId, profileImageFile);
      return profile;
    },
    onSuccess: async () => {
      setProfileImageFile(null);
      deleteProfileImageMutation.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["users", "profile", userId] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.users.list }),
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.me }),
      ]);
    },
  });
  const deleteProfileImageMutation = useMutation({
    scope: { id: `user-profile-${userId}` },
    mutationFn: () => deleteUserProfileImage(userId),
    onSuccess: async () => {
      setProfileImageFile(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["users", "profile", userId] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.users.list }),
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.me }),
      ]);
    },
  });
  const isProfileChangePending = updateProfileMutation.isPending || deleteProfileImageMutation.isPending;

  return (
    <main className="flex-1">
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/settings">Back to users</Link>
            </Button>
          </div>
        </header>

        <div className="parcelis-page-shell">
          <div className="flex flex-col gap-6 md:flex-row">
            <SettingsRail active="none" canManageUsers={currentUserQuery.data?.user.role === "administrator"} />
            <div className="min-w-0 flex-1">
              <section className="mb-6 rounded-lg bg-parcelis-charcoal p-6 text-white">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Users</p>
                <h1 className="mt-2 text-3xl font-bold md:text-5xl">{profileQuery.data?.name ?? "Profile"}</h1>
                <p className="mt-3 max-w-2xl text-sm text-white/75">
                  {isOwnProfile ? "Manage the details shown for your account." : "Manage this user's account details."}
                </p>
              </section>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-semibold text-parcelis-charcoal">Personal details</h2>
                      <p className="mt-1 text-sm text-parcelis-gray">
                        {canEditEmail
                          ? "Update the name, email address, and phone number."
                          : "Update the name and phone number."}
                      </p>
                    </div>
                    <CircleUserRound className="h-5 w-5 text-parcelis-green" />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-8 lg:flex-row">
                  {profileQuery.isLoading ? (
                    <LoadingState label="Loading profile…" />
                  ) : profileQuery.error ? (
                    <p className="text-sm font-medium text-red-700">{profileQuery.error.message}</p>
                  ) : (
                    <>
                      <div className="w-full shrink-0 lg:w-64">
                        <ImageUploadPanel
                          acceptedImageDescription="GIF, JPG, PNG, or WebP"
                          alt={`${profileQuery.data?.name ?? "User"} profile photo`}
                          hasPendingImage={Boolean(profileImageFile)}
                          imagePreviewUrl={profileImagePreviewUrl ?? profileQuery.data?.imageUrl ?? null}
                          isDeletePending={isProfileChangePending}
                          onDelete={() => {
                            if (profileImageFile) setProfileImageFile(null);
                            else deleteProfileImageMutation.mutate();
                          }}
                          onImageChange={setProfileImageFile}
                          title="Profile photo"
                        />
                        {deleteProfileImageMutation.error ? (
                          <p className="mt-3 text-sm font-medium text-red-700" role="alert">
                            {deleteProfileImageMutation.error.message}
                          </p>
                        ) : null}
                      </div>
                      <form
                        className="flex w-full max-w-2xl flex-wrap gap-5"
                        onSubmit={(event) => {
                          event.preventDefault();
                          updateProfileMutation.mutate();
                        }}
                      >
                        <Label className="w-full md:basis-[calc((100%-1.25rem)/2)]">
                          Name
                          <Input
                            className="mt-1"
                            onChange={(event) => setName(event.target.value)}
                            required
                            value={name}
                          />
                        </Label>
                        {canEditEmail ? (
                          <Label className="w-full md:basis-[calc((100%-1.25rem)/2)]">
                            Email
                            <Input
                              className="mt-1"
                              onChange={(event) => setEmail(event.target.value)}
                              required
                              type="email"
                              value={email}
                            />
                          </Label>
                        ) : null}
                        <Label className="w-full md:basis-[calc((100%-1.25rem)/2)]">
                          Phone
                          <Input
                            className="mt-1"
                            onChange={(event) => setPhone(event.target.value)}
                            type="tel"
                            value={phone}
                          />
                        </Label>
                        <Label className="w-full md:basis-[calc((100%-1.25rem)/2)]">
                          User role
                          <Input className="mt-1" readOnly value={formatRole(profileQuery.data?.role)} />
                        </Label>
                        {updateProfileMutation.error ? (
                          <p className="w-full text-sm font-medium text-red-700">
                            {updateProfileMutation.error.message}
                          </p>
                        ) : null}
                        <div className="flex w-full justify-end">
                          <Button disabled={isProfileChangePending} type="submit">
                            Save changes
                          </Button>
                        </div>
                      </form>
                    </>
                  )}
                </CardContent>
              </Card>
              {isOwnProfile ? (
                <AccountInfoCard
                  email={profileQuery.data?.email ?? ""}
                  onEmailChanged={async () => {
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ["users", "profile", userId] }),
                      queryClient.invalidateQueries({ queryKey: queryKeys.users.list }),
                      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me }),
                    ]);
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
