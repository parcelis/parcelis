"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Checkbox,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Input,
  Label,
  Textarea,
} from "@parcelis/ui";
import {
  leaseEditInputSchema,
  leaseEditTenantsInputSchema,
  leaseRenewInputSchema,
  leaseTerminateInputSchema,
} from "@parcelis/schemas";
import { apiClient, queryKeys } from "@/components/api-client";
import { LoadingState } from "@/components/loading-state";
import { getLeaseDraftLink, getLeaseLink } from "@/lib/entity-links";

export type LeaseOperation = "edit" | "tenants" | "renew" | "terminate";
const titles: Record<LeaseOperation, string> = {
  edit: "Edit Lease",
  tenants: "Edit Tenants",
  renew: "Renew Lease",
  terminate: "Terminate Lease",
};
type Lease = Awaited<ReturnType<typeof apiClient.leaseOperations.details.query>>;

export function LeaseOperationDrawer({
  leaseId,
  operation,
  onClose,
}: {
  leaseId: number;
  operation: LeaseOperation;
  onClose: () => void;
}) {
  const leaseQuery = useQuery({
    queryKey: ["leases", "operations", leaseId],
    queryFn: () => apiClient.leaseOperations.details.query({ id: leaseId }),
    staleTime: 0,
  });
  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent size="lg">
        <DrawerHeader>
          <DrawerClose />
          <DrawerTitle>
            {titles[operation]} · #{leaseId}
          </DrawerTitle>
        </DrawerHeader>
        {leaseQuery.isPending ? (
          <LoadingState label="Loading lease…" />
        ) : leaseQuery.error ? (
          <div className="p-6" role="alert">
            <p className="text-red-700">{leaseQuery.error.message}</p>
            <Button onClick={() => void leaseQuery.refetch()} variant="secondary">
              Retry
            </Button>
          </div>
        ) : leaseQuery.data ? (
          <LeaseOperationForm
            key={`${operation}-${leaseQuery.data.revision}`}
            lease={leaseQuery.data}
            operation={operation}
            onClose={onClose}
          />
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

function LeaseOperationForm({
  lease,
  operation,
  onClose,
}: {
  lease: Lease;
  operation: LeaseOperation;
  onClose: () => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [allowPartialPayments, setAllowPartialPayments] = useState(lease.allowPartialPayments);
  const [continueMonthToMonth, setContinueMonthToMonth] = useState(lease.continueMonthToMonthAfterEnd);
  const [tenantIds, setTenantIds] = useState(lease.tenants.map(({ tenantId }) => tenantId));
  const [date, setDate] = useState(() => {
    if (!lease.endsOn) return "";
    const value = new Date(lease.endsOn);
    if (operation === "renew") value.setUTCDate(value.getUTCDate() + 1);
    return value.toISOString().slice(0, 10);
  });
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const tenantsQuery = useQuery({
    queryKey: queryKeys.tenants.list,
    queryFn: () => apiClient.tenants.list.query(),
    enabled: operation === "tenants",
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const base = { id: lease.id, expectedRevision: lease.revision };
      if (operation === "edit") {
        await apiClient.leaseOperations.edit.mutate(
          leaseEditInputSchema.parse({
            ...base,
            endsOn: lease.endsOn,
            allowPartialPayments,
            continueMonthToMonthAfterEnd: continueMonthToMonth,
          }),
        );
      } else if (operation === "tenants") {
        await apiClient.leaseOperations.editTenants.mutate(leaseEditTenantsInputSchema.parse({ ...base, tenantIds }));
      } else if (operation === "renew") {
        return apiClient.leaseOperations.renew.mutate(
          leaseRenewInputSchema.parse({ ...base, startsOn: `${date}T00:00:00.000Z` }),
        );
      } else {
        if (!confirmed) throw new Error("Confirm the final-period policy before terminating.");
        await apiClient.leaseOperations.terminate.mutate(
          leaseTerminateInputSchema.parse({
            ...base,
            endsOn: `${date}T00:00:00.000Z`,
            reason,
            finalPeriodPolicy: "full_period",
          }),
        );
      }
      return null;
    },
    onSuccess: async (renewal) => {
      await Promise.all(
        ["leases", "properties", "tenants", "invoices"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      toast.success(operation === "renew" ? "Renewal draft ready for review." : "Lease updated.");
      onClose();
      if (renewal)
        router.push(renewal.status === "draft" ? getLeaseDraftLink(renewal.leaseDraftKey) : getLeaseLink(renewal.id));
    },
  });
  const pending = mutation.isPending;
  const error = validationError ?? mutation.error?.message;
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        setValidationError(null);
        if (operation === "tenants" && !tenantIds.length) {
          setValidationError("Select at least one resident.");
          return;
        }
        mutation.mutate();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
        {operation === "edit" ? (
          <>
            <p className="text-sm text-parcelis-gray">
              Update payment and continuation settings. Contract dates, rent, deposits, and individual billing
              allocations are preserved; use a renewal to agree new terms or Terminate to record an earlier end.
            </p>
            <label className="flex items-center gap-3">
              <Checkbox
                checked={allowPartialPayments}
                disabled={pending}
                onCheckedChange={(value) => setAllowPartialPayments(value === true)}
              />
              Allow partial payments
            </label>
            {lease.termType === "fixed" && lease.status !== "notice" ? (
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={continueMonthToMonth}
                  disabled={pending}
                  onCheckedChange={(value) => setContinueMonthToMonth(value === true)}
                />
                Continue month to month after the fixed term
              </label>
            ) : null}
          </>
        ) : null}
        {operation === "tenants" ? (
          <>
            <p className="text-sm text-parcelis-gray">
              Manage the current joint household. Existing invoices and recipients retain their history. Residents
              referenced by invoices cannot be removed. Changes to individual billing require a renewal.
            </p>
            {tenantsQuery.isPending ? (
              <LoadingState label="Loading residents…" />
            ) : tenantsQuery.error ? (
              <p role="alert" className="text-red-700">
                {tenantsQuery.error.message}
              </p>
            ) : (
              (tenantsQuery.data ?? []).map((tenant) => (
                <label key={tenant.id} className="flex items-center gap-3 rounded-md border border-parcelis-border p-3">
                  <Checkbox
                    disabled={pending || tenant.tenantStatus === "archived"}
                    checked={tenantIds.includes(tenant.id)}
                    onCheckedChange={(value) =>
                      setTenantIds((previous) =>
                        value === true ? [...previous, tenant.id] : previous.filter((id) => id !== tenant.id),
                      )
                    }
                  />
                  {tenant.firstName} {tenant.lastName}
                  {tenant.tenantStatus === "archived" ? " (archived)" : ""}
                </label>
              ))
            )}
          </>
        ) : null}
        {operation === "renew" ? (
          <>
            <p className="text-sm text-parcelis-gray">
              Create a linked draft with the same property, unit, residents, and billing settings. Review the new end
              date, rent, deposit, and allocations in the lease wizard before creating invoices. The current lease
              remains unchanged.
            </p>
            {lease.renewal ? (
              <p>A renewal already exists. Continue to its {lease.renewal.status === "draft" ? "draft" : "details"}.</p>
            ) : null}
            <div>
              <Label htmlFor={`${id}-date`}>Renewal start date</Label>
              <Input
                id={`${id}-date`}
                type="date"
                required
                disabled={pending}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </>
        ) : null}
        {operation === "terminate" ? (
          <>
            <p className="text-sm text-parcelis-gray">
              Record an end date and reason. Future notice ends the lease after its final day through the existing
              lifecycle worker. A scheduled lease can be canceled before move-in.
            </p>
            <div>
              <Label htmlFor={`${id}-date`}>Last day of lease</Label>
              <Input
                id={`${id}-date`}
                type="date"
                required
                disabled={pending}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`${id}-reason`}>Reason</Label>
              <Textarea
                id={`${id}-reason`}
                required
                maxLength={2000}
                disabled={pending}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <label className="flex items-start gap-3 rounded-md border border-parcelis-border p-4">
              <Checkbox
                checked={confirmed}
                disabled={pending}
                onCheckedChange={(value) => setConfirmed(value === true)}
              />
              <span>
                I agree to retain the existing charge for the final billing period, without proration. Only wholly
                unpaid invoices for later periods will be voided. Payments and historical invoices will be preserved.
              </span>
            </label>
          </>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
      <DrawerFooter className="flex justify-between gap-3">
        <Button className="min-w-40" disabled={pending} onClick={onClose} type="button" variant="secondary">
          Cancel
        </Button>
        <Button
          className="min-w-40"
          disabled={
            pending || (operation === "terminate" && !confirmed) || (operation === "tenants" && !tenantsQuery.data)
          }
          type="submit"
          variant="primary"
        >
          {pending
            ? "Saving…"
            : operation === "renew"
              ? "Continue to renewal"
              : operation === "terminate"
                ? "Confirm termination"
                : "Save changes"}
        </Button>
      </DrawerFooter>
    </form>
  );
}
