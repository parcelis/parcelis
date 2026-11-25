"use client";

import { activateInstallationLicenseSchema, type ActivateInstallationLicense } from "@parcelis/schemas";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
} from "@parcelis/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { apiClient } from "../../../../../components/api-client";
import { LoadingState } from "../../../../../components/loading-state";

const statusKey = ["installation-license", "status"] as const;
const licenseLabels = {
  unlinked: "Not linked to Parcelis Portal.",
  active: "Linked to Parcelis Portal.",
  expired: "The saved license has expired. Refresh to check for a current license.",
  inactive: "Parcelis Portal marked this license inactive.",
};

function planName(tier: string) {
  return tier.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function LicenseCards({
  pathname,
  canManageLicense,
  installationUrl,
}: {
  pathname: string;
  canManageLicense: boolean;
  installationUrl: string | null;
}) {
  const queryClient = useQueryClient();
  const [activationError, setActivationError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const queryKey = [...statusKey, pathname];
  const statusQuery = useQuery({
    queryKey,
    queryFn: () => apiClient.installationLicense.status.query(),
    retry: false,
  });
  const status = statusQuery.data;
  const activate = useMutation({
    mutationFn: (input: ActivateInstallationLicense) => apiClient.installationLicense.activate.mutate(input),
    gcTime: 0,
  });
  const refresh = useMutation({ mutationFn: () => apiClient.installationLicense.refresh.mutate() });
  const unlink = useMutation({ mutationFn: () => apiClient.installationLicense.unlink.mutate() });
  const isWorking = activate.isPending || refresh.isPending || unlink.isPending;

  async function submitActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const input = activateInstallationLicenseSchema.safeParse(Object.fromEntries(fields));
    if (!input.success) {
      setActivationError(input.error.issues[0]?.message ?? "Check your activation details.");
      return;
    }

    setActivationError(null);
    try {
      const result = await activate.mutateAsync(input.data);
      form.reset();
      queryClient.setQueryData(queryKey, result);
      void queryClient.invalidateQueries({ queryKey: ["organizations", "installation-identity"] });
      toast.success("License activated.");
    } catch (error) {
      setActivationError(error instanceof TRPCClientError ? error.message : "Couldn’t activate the license.");
    } finally {
      activate.reset();
    }
  }

  async function refreshPlan() {
    setRefreshError(null);
    try {
      const result = await refresh.mutateAsync();
      queryClient.setQueryData(queryKey, result);
      if (result.state === "active") toast.success("Plan refreshed.");
    } catch (error) {
      setRefreshError(error instanceof TRPCClientError ? error.message : "Couldn’t refresh the plan.");
    }
  }

  async function unlinkInstallation() {
    setUnlinkError(null);
    try {
      const result = await unlink.mutateAsync();
      queryClient.setQueryData(queryKey, result);
      setRefreshError(null);
      setUnlinkOpen(false);
      toast.success("Installation unlinked.");
    } catch (error) {
      setUnlinkError(error instanceof TRPCClientError ? error.message : "Couldn’t unlink the installation.");
    }
  }

  return (
    <>
      <Card aria-labelledby="installation-plan-heading">
        <CardContent className="flex flex-col gap-4 text-sm">
          <h2 id="installation-plan-heading" className="text-lg font-semibold text-parcelis-charcoal">
            Plan
          </h2>
          {statusQuery.isPending ? (
            <LoadingState label="Loading plan…" />
          ) : statusQuery.isError || !status ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-red-700" role="alert">
                Couldn’t load the plan.
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={statusQuery.isFetching}
                onClick={() => void statusQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : (
            <>
              <p>
                {status.state === "active" ? "You are currently on the " : "This installation is using the "}
                <strong>{planName(status.tier)} Plan</strong>
                {status.state === "active" ? "." : " by default."}
              </p>
              {canManageLicense && status.state !== "unlinked" ? (
                <>
                  <p className="text-parcelis-gray">
                    After changing your plan in Parcelis Portal, use Refresh to sync those changes here.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    className="self-start"
                    disabled={isWorking}
                    onClick={() => void refreshPlan()}
                  >
                    {refresh.isPending ? "Refreshing…" : "Refresh"}
                  </Button>
                </>
              ) : null}
              {status.lastSyncedAt ? (
                <p className="text-xs text-parcelis-gray">
                  Last synced{" "}
                  <time dateTime={status.lastSyncedAt}>{new Date(status.lastSyncedAt).toLocaleString()}</time>
                </p>
              ) : null}
              {refreshError ? (
                <p className="text-red-700" role="alert">
                  {refreshError}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
      {status ? (
        <Card aria-labelledby="installation-license-heading">
          <CardContent className="flex flex-col gap-4 text-sm">
            <h2 id="installation-license-heading" className="text-lg font-semibold text-parcelis-charcoal">
              License
            </h2>
            <p className="text-parcelis-gray" role="status">
              {licenseLabels[status.state]}
            </p>
            {status.state === "unlinked" && canManageLicense ? (
              <form className="flex max-w-md flex-col gap-3" onSubmit={submitActivation}>
                <p className="text-parcelis-gray">
                  Generate a one-time activation code for your tenant in Parcelis Portal.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-1">
                    <Label htmlFor="license-name">Installation name</Label>
                    <Input id="license-name" name="name" required maxLength={100} disabled={isWorking} />
                  </div>
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-1">
                    <Label htmlFor="license-environment">Environment</Label>
                    <Select id="license-environment" name="environment" required defaultValue="" disabled={isWorking}>
                      <option value="" disabled>
                        Select an environment
                      </option>
                      <option value="production">Production</option>
                      <option value="staging">Staging</option>
                      <option value="development">Development</option>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="license-code">Activation code</Label>
                  <Input
                    id="license-code"
                    name="code"
                    type="password"
                    required
                    maxLength={80}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={isWorking}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="license-installation-url">Installation URL</Label>
                  <Input id="license-installation-url" value={installationUrl ?? ""} readOnly />
                  <p className="text-xs text-parcelis-gray">
                    {installationUrl
                      ? "This URL will be shared with Parcelis Portal."
                      : "Set NEXTAUTH_URL on this installation to share its public URL."}
                  </p>
                </div>
                {activationError ? (
                  <p className="text-red-700" role="alert">
                    {activationError}
                  </p>
                ) : null}
                <Button type="submit" className="self-start" disabled={isWorking}>
                  {activate.isPending ? "Activating…" : "Activate license"}
                </Button>
              </form>
            ) : status.state !== "unlinked" ? (
              <>
                <div className="flex max-w-md flex-col gap-2">
                  <Label htmlFor="linked-license-key">License key</Label>
                  <Input id="linked-license-key" type="password" readOnly value="••••••••••••" autoComplete="off" />
                </div>
                {canManageLicense ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled>
                      Activate license
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isWorking}
                      onClick={() => {
                        setUnlinkError(null);
                        setUnlinkOpen(true);
                      }}
                    >
                      Unlink installation
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}
            {!canManageLicense ? (
              <p className="text-parcelis-gray">An installation administrator can manage this license.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <AlertDialog
        open={unlinkOpen && canManageLicense}
        onOpenChange={(open) => {
          if (!unlink.isPending) setUnlinkOpen(open);
        }}
      >
        <AlertDialogContent aria-labelledby="unlink-license-title" aria-describedby="unlink-license-description">
          <div className="flex flex-col gap-4">
            <AlertDialogHeader>
              <AlertDialogTitle id="unlink-license-title">Unlink installation?</AlertDialogTitle>
              <AlertDialogDescription id="unlink-license-description">
                This disconnects the installation from Parcelis Portal and returns it to the Free plan. To link it
                again, generate a new activation code in Parcelis Portal.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {unlinkError ? (
              <p className="text-sm text-red-700" role="alert">
                {unlinkError}
              </p>
            ) : null}
          </div>
          <AlertDialogFooter className="justify-between">
            <Button
              type="button"
              className="min-w-40"
              variant="secondary"
              disabled={unlink.isPending}
              onClick={() => setUnlinkOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-w-40"
              disabled={unlink.isPending}
              onClick={() => void unlinkInstallation()}
            >
              {unlink.isPending ? "Unlinking…" : "Unlink installation"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
