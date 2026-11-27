"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { leaseAmendmentInputSchema, type LeaseAmendmentInput } from "@parcelis/schemas";
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
  Select,
  Textarea,
} from "@parcelis/ui";
import { apiClient, queryKeys } from "./api-client";

type Lease = NonNullable<Awaited<ReturnType<typeof apiClient.leases.byId.query>>>;
type Preview = Awaited<ReturnType<typeof apiClient.leases.previewAmendment.query>>;

function cents(value: string) {
  return /^(?:\d+|\d*\.\d{1,2})$/.test(value.trim()) ? Math.round(Number(value) * 100) : undefined;
}

function dollars(value: number | null) {
  return value === null ? "" : (value / 100).toFixed(2);
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (value: number | null) => (value === null ? "—" : currency.format(value / 100));
const dateValue = (value: Date | string | null) => (value ? new Date(value).toISOString().slice(0, 10) : "");

export function LeaseAmendmentDrawer({
  lease,
  mode,
  canViewTenants,
  onClose,
  onSaved,
}: {
  lease: Lease;
  mode: "terms" | "tenants";
  canViewTenants: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [effectiveOn, setEffectiveOn] = useState("");
  const [endsOn, setEndsOn] = useState(dateValue(lease.endsOn));
  const [monthlyRent, setMonthlyRent] = useState(dollars(lease.monthlyRentCents));
  const [rentDueDay, setRentDueDay] = useState(String(lease.rentDueDay));
  const [responsibility, setResponsibility] = useState(lease.billingResponsibility ?? "joint");
  const [tenantIds, setTenantIds] = useState(lease.tenants.map(({ id }) => id));
  const [shares, setShares] = useState(
    Object.fromEntries(
      lease.tenantAllocations.map((allocation) => [
        allocation.tenantId,
        { rent: dollars(allocation.rentShareCents), deposit: dollars(allocation.depositShareCents) },
      ]),
    ),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState<{ input: LeaseAmendmentInput; preview: Preview } | null>(null);
  const residents = useQuery({
    enabled: mode === "tenants" && canViewTenants,
    queryKey: queryKeys.tenants.list,
    queryFn: () => apiClient.tenants.list.query(),
  });
  const choices = new Map(lease.tenants.map((tenant) => [tenant.id, tenant]));
  if (mode === "tenants") {
    for (const tenant of residents.data ?? []) if (!tenant.archivedAt) choices.set(tenant.id, tenant);
  }
  const preview = useMutation({
    mutationFn: (input: LeaseAmendmentInput) => apiClient.leases.previewAmendment.query(input),
    onSuccess: (result, input) => setReview({ input, preview: result }),
    onError: (failure) => setError(failure.message),
  });
  const apply = useMutation({
    mutationFn: (value: NonNullable<typeof review>) =>
      apiClient.leases.applyAmendment.mutate({ ...value.input, previewToken: value.preview.previewToken }),
    onSuccess: onSaved,
    onError: (failure) => setError(failure.message),
  });
  const pending = preview.isPending || apply.isPending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (review) {
      apply.mutate(review);
      return;
    }
    const result = leaseAmendmentInputSchema.safeParse({
      leaseId: lease.id,
      expectedRevision: lease.revision,
      effectiveOn,
      endsOn: endsOn || null,
      monthlyRentCents: cents(monthlyRent),
      rentDueDay: Number(rentDueDay),
      billingResponsibility: responsibility,
      tenantIds,
      tenantAllocations:
        responsibility === "joint"
          ? []
          : tenantIds.map((tenantId) => ({
              tenantId,
              rentShareCents: cents(shares[tenantId]?.rent ?? ""),
              depositShareCents: cents(shares[tenantId]?.deposit || "0"),
            })),
      reason,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the amendment fields.");
      return;
    }
    preview.mutate(result.data);
  }

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DrawerContent size="lg">
        <DrawerHeader className="flex items-center gap-3">
          <DrawerClose disabled={pending} />
          <DrawerTitle>{mode === "terms" ? "Edit Lease" : "Edit Tenants"}</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            {review ? (
              <>
                <h3 className="font-semibold text-parcelis-charcoal">Invoice preview</h3>
                <p className="text-sm text-parcelis-gray">
                  Effective {review.input.effectiveOn}. Review the changes before applying.
                </p>
                {review.preview.changes.length === 0 ? (
                  <p className="text-sm">No existing invoices will change.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-parcelis-border rounded-md border border-parcelis-border">
                    {review.preview.changes.map((change) => (
                      <li
                        className="flex flex-wrap justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm"
                        key={change.sourceKey}
                      >
                        <span>
                          {change.invoiceNumber === null ? "New invoice" : `Invoice #${change.invoiceNumber}`} ·{" "}
                          {change.periodStartsOn}
                        </span>
                        <span>
                          {change.afterCents === null
                            ? "Remove"
                            : `${money(change.beforeCents)} → ${money(change.afterCents)}`}
                        </span>
                        {change.dueOn ? (
                          <span className="w-full text-parcelis-gray">
                            Due{" "}
                            {change.beforeDueOn && change.beforeDueOn !== change.dueOn
                              ? `${change.beforeDueOn} → `
                              : ""}
                            {change.dueOn}
                          </span>
                        ) : null}
                        {change.recipientTenantIds.length ? (
                          <span className="w-full text-parcelis-gray">
                            {change.recipientTenantIds
                              .map((id) => {
                                const tenant = choices.get(id);
                                return tenant ? `${tenant.firstName} ${tenant.lastName}` : `Tenant #${id}`;
                              })
                              .join(", ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <fieldset className="flex flex-col gap-4" disabled={pending}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="amendment-effective-on">Effective date</Label>
                  <Input
                    id="amendment-effective-on"
                    type="date"
                    required
                    value={effectiveOn}
                    onChange={(event) => setEffectiveOn(event.target.value)}
                  />
                  <p className="text-xs text-parcelis-gray">
                    Choose the lease start date or the first day of a future billing month.
                  </p>
                </div>
                {mode === "terms" ? (
                  <div className="flex flex-wrap gap-4">
                    <div className="flex min-w-32 flex-1 flex-col gap-1.5">
                      <Label htmlFor="amendment-rent">Monthly rent</Label>
                      <Input
                        id="amendment-rent"
                        inputMode="decimal"
                        required
                        value={monthlyRent}
                        onChange={(event) => setMonthlyRent(event.target.value)}
                      />
                    </div>
                    <div className="flex min-w-32 flex-1 flex-col gap-1.5">
                      <Label htmlFor="amendment-due-day">Rent due day</Label>
                      <Input
                        id="amendment-due-day"
                        type="number"
                        min={1}
                        max={31}
                        required
                        value={rentDueDay}
                        onChange={(event) => setRentDueDay(event.target.value)}
                      />
                    </div>
                    {lease.termType === "fixed" ? (
                      <div className="flex min-w-36 flex-1 flex-col gap-1.5">
                        <Label htmlFor="amendment-ends-on">Lease end date</Label>
                        <Input
                          id="amendment-ends-on"
                          type="date"
                          required
                          value={endsOn}
                          onChange={(event) => setEndsOn(event.target.value)}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-2 text-sm font-medium">Residents</legend>
                    {residents.isLoading ? (
                      <p role="status" className="text-sm">
                        Loading residents…
                      </p>
                    ) : null}
                    {residents.error ? (
                      <p role="alert" className="text-sm text-red-700">
                        {residents.error.message}
                      </p>
                    ) : null}
                    {choices.size === 0 && !residents.isLoading && !residents.error ? (
                      <p className="text-sm">No eligible residents found.</p>
                    ) : null}
                    <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                      {[...choices.values()].map((tenant) => (
                        <Label key={tenant.id} className="flex items-center gap-2">
                          <Checkbox
                            checked={tenantIds.includes(tenant.id)}
                            onCheckedChange={(checked) =>
                              setTenantIds((current) =>
                                checked === true ? [...current, tenant.id] : current.filter((id) => id !== tenant.id),
                              )
                            }
                          />
                          {tenant.firstName} {tenant.lastName}
                        </Label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="amendment-responsibility">Billing responsibility</Label>
                  <Select
                    id="amendment-responsibility"
                    value={responsibility}
                    onChange={(event) =>
                      setResponsibility(event.target.value === "individual" ? "individual" : "joint")
                    }
                  >
                    <option value="joint">Joint</option>
                    <option value="individual">Individual</option>
                  </Select>
                </div>
                {responsibility === "individual"
                  ? tenantIds.map((id) => {
                      const tenant = choices.get(id);
                      return (
                        <fieldset
                          className="flex flex-wrap gap-3 rounded-md border border-parcelis-border p-3"
                          key={id}
                        >
                          <legend className="px-1 text-sm font-medium">
                            {tenant ? `${tenant.firstName} ${tenant.lastName}` : `Tenant #${id}`}
                          </legend>
                          {(["rent", "deposit"] as const).map((field) =>
                            field === "deposit" && lease.securityDepositCents === 0 ? null : (
                              <div className="flex min-w-32 flex-1 flex-col gap-1.5" key={field}>
                                <Label htmlFor={`amendment-${field}-${id}`}>
                                  {field === "rent" ? "Rent share" : "Deposit share"}
                                </Label>
                                <Input
                                  id={`amendment-${field}-${id}`}
                                  inputMode="decimal"
                                  required={field === "rent"}
                                  value={shares[id]?.[field] ?? ""}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setShares((current) => ({
                                      ...current,
                                      [id]: { rent: "", deposit: "", ...current[id], [field]: value },
                                    }));
                                  }}
                                />
                              </div>
                            ),
                          )}
                        </fieldset>
                      );
                    })
                  : null}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="amendment-reason">Reason for change</Label>
                  <Textarea
                    id="amendment-reason"
                    required
                    maxLength={1000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </div>
              </fieldset>
            )}
            {error ? (
              <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            ) : null}
          </div>
          <DrawerFooter className="flex-row items-center justify-between border-t border-parcelis-border">
            <Button
              className="min-w-40"
              disabled={pending}
              variant="secondary"
              onClick={() => {
                if (!review) return onClose();
                setReview(null);
                setError("");
              }}
              type="button"
            >
              {review ? "Back" : "Cancel"}
            </Button>
            <Button className="min-w-40" disabled={pending} type="submit">
              {apply.isPending
                ? "Applying…"
                : preview.isPending
                  ? "Loading preview…"
                  : review
                    ? "Apply amendment"
                    : "Preview invoices"}
              {!review ? <ChevronRight className="h-4 w-4" /> : null}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
