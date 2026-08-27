"use client";

import * as React from "react";
import { ChevronRight, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
} from "@parcelis/ui";
import { apiClient, queryKeys } from "./api-client";

type CreateLeaseInput = Parameters<typeof apiClient.leases.create.mutate>[0];

type LeaseDrawerProps = {
  error?: Error | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateLeaseInput) => void;
  open: boolean;
};

const initialForm = {
  propertyId: "",
  unitId: "",
  tenantIds: [] as number[],
  monthlyRent: "",
  startsOn: "",
  endsOn: "",
  status: "active" as "draft" | "active" | "notice" | "ended",
  generateInvoices: false,
};

export function LeaseDrawer({ error, isPending, onOpenChange, onSubmit, open }: LeaseDrawerProps) {
  const [form, setForm] = React.useState(initialForm);
  const propertiesQuery = useQuery({
    queryKey: queryKeys.properties.list,
    queryFn: () => apiClient.properties.list.query(),
  });
  const tenantsQuery = useQuery({ queryKey: queryKeys.tenants.list, queryFn: () => apiClient.tenants.list.query() });
  const property = propertiesQuery.data?.find((item) => item.id === Number(form.propertyId));
  const tenants = (tenantsQuery.data ?? []).filter((tenant) => tenant.tenantStatus !== "archived");
  const availableUnits = property?.units.filter(
    (unit) =>
      !property.leases.some((lease) => lease.unitLabel === unit.name && ["active", "notice"].includes(lease.status)),
  );

  React.useEffect(() => {
    if (!open) setForm(initialForm);
  }, [open]);

  function toggleTenant(id: number) {
    setForm((current) => ({
      ...current,
      tenantIds: current.tenantIds.includes(id)
        ? current.tenantIds.filter((tenantId) => tenantId !== id)
        : [...current.tenantIds, id],
    }));
  }

  const isComplete = Boolean(
    form.propertyId && form.unitId && form.tenantIds.length && form.monthlyRent && form.startsOn,
  );

  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent size="lg">
        <DrawerHeader className="flex items-center gap-3">
          <DrawerClose disabled={isPending} />
          <DrawerTitle>Add lease</DrawerTitle>
        </DrawerHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isComplete) return;
            onSubmit({
              propertyId: Number(form.propertyId),
              unitId: Number(form.unitId),
              tenantIds: form.tenantIds,
              monthlyRentCents: Math.round(Number(form.monthlyRent) * 100),
              startsOn: new Date(`${form.startsOn}T12:00:00`),
              endsOn: form.endsOn ? new Date(`${form.endsOn}T12:00:00`) : null,
              status: form.status,
              generateInvoices: form.generateInvoices,
            });
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <div className="rounded-lg bg-parcelis-charcoal p-4 text-white">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-md bg-white/10 text-parcelis-green">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold">New lease</p>
                  <p className="text-sm text-white/70">Assign residents, term, and monthly rent.</p>
                </div>
              </div>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Label className="gap-2">
                <span>Property *</span>
                <Select
                  required
                  value={form.propertyId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, propertyId: event.target.value, unitId: "" }))
                  }
                >
                  <option value="">Select property</option>
                  {(propertiesQuery.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Label>
              <Label className="gap-2">
                <span>Unit *</span>
                <Select
                  disabled={!property}
                  required
                  value={form.unitId}
                  onChange={(event) => setForm((current) => ({ ...current, unitId: event.target.value }))}
                >
                  <option value="">Select unit</option>
                  {availableUnits?.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      Unit {unit.name}
                    </option>
                  ))}
                </Select>
              </Label>
              <Label className="gap-2">
                <span>Monthly rent *</span>
                <Input
                  inputMode="decimal"
                  min="0.01"
                  onChange={(event) => setForm((current) => ({ ...current, monthlyRent: event.target.value }))}
                  placeholder="0.00"
                  required
                  step="0.01"
                  type="number"
                  value={form.monthlyRent}
                />
              </Label>
              <Label className="gap-2">
                <span>Status *</span>
                <Select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, status: event.target.value as typeof current.status }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="notice">Notice given</option>
                  <option value="ended">Ended</option>
                </Select>
              </Label>
              <Label className="gap-2">
                <span>Start date *</span>
                <Input
                  onChange={(event) => setForm((current) => ({ ...current, startsOn: event.target.value }))}
                  required
                  type="date"
                  value={form.startsOn}
                />
              </Label>
              <Label className="gap-2">
                <span>End date</span>
                <Input
                  min={form.startsOn || undefined}
                  onChange={(event) => setForm((current) => ({ ...current, endsOn: event.target.value }))}
                  type="date"
                  value={form.endsOn}
                />
              </Label>
            </div>
            <div className="mt-7 border-t border-parcelis-border pt-6">
              <p className="font-semibold text-parcelis-charcoal">Residents *</p>
              <p className="mt-1 text-sm text-parcelis-gray">Choose one or more residents for this lease.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {tenants.map((tenant) => (
                  <label
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-parcelis-border p-3 text-sm hover:bg-parcelis-porcelain"
                    key={tenant.id}
                  >
                    <Checkbox
                      checked={form.tenantIds.includes(tenant.id)}
                      onCheckedChange={() => toggleTenant(tenant.id)}
                    />
                    <span className="font-medium text-parcelis-charcoal">
                      {tenant.firstName} {tenant.lastName}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-md border border-parcelis-border p-4 text-sm">
              <Checkbox
                checked={form.generateInvoices}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, generateInvoices: checked === true }))
                }
              />
              <span>
                <span className="font-semibold text-parcelis-charcoal">Generate rent invoices</span>
                <span className="mt-1 block text-parcelis-gray">Create invoices for each month of the lease term.</span>
              </span>
            </label>
            {error ? <p className="mt-4 text-sm font-medium text-red-700">{error.message}</p> : null}
          </div>
          <DrawerFooter className="flex-row items-center justify-between border-t border-parcelis-border">
            <Button
              className="min-w-40"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
            <Button className="min-w-40" disabled={!isComplete || isPending} type="submit">
              {isPending ? "Creating…" : "Create lease"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
