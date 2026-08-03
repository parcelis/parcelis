"use client";

import * as React from "react";
import {
  AirVent,
  Bath,
  Bug,
  CircleHelp,
  CookingPot,
  Droplets,
  Flame,
  House,
  Refrigerator,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  Textarea,
} from "@parcelis/ui";
import type { CreateMaintenanceTicketInput } from "@parcelis/schemas";
import { apiClient, queryKeys } from "./api-client";

type MaintenanceDrawerProps = {
  error?: Error | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateMaintenanceTicketInput) => void;
  open: boolean;
};

const initialForm = {
  ticketTitle: "",
  propertyId: "",
  unitIds: [] as number[],
  categoryId: "",
  description: "",
  requestedById: "",
  requestedByType: "tenant" as "tenant" | "landlord",
  isUrgent: false,
};

const categoryIcons: Record<string, LucideIcon> = {
  "A/C": AirVent,
  Appliance: Refrigerator,
  Plumbing: Droplets,
  Electrical: Zap,
  Heat: Flame,
  Kitchen: CookingPot,
  Other: CircleHelp,
  "Pest Control": Bug,
  Bathroom: Bath,
  Exterior: House,
};

export function MaintenanceDrawer({ error, isPending, onOpenChange, onSubmit, open }: MaintenanceDrawerProps) {
  const [form, setForm] = React.useState(initialForm);
  const propertiesQuery = useQuery({
    queryKey: queryKeys.properties.list,
    queryFn: () => apiClient.properties.list.query(),
  });
  const tenantsQuery = useQuery({ queryKey: queryKeys.tenants.list, queryFn: () => apiClient.tenants.list.query() });
  const categoriesQuery = useQuery({
    queryKey: queryKeys.maintenanceCategories.list,
    queryFn: () => apiClient.maintenanceCategories.list.query(),
  });
  const landlordsQuery = useQuery({
    queryKey: queryKeys.landlords.list,
    queryFn: () => apiClient.landlords.list.query(),
  });
  const property = propertiesQuery.data?.find((item) => item.id === Number(form.propertyId));
  const selectedUnitNames =
    property?.units.filter((unit) => form.unitIds.includes(unit.id)).map((unit) => unit.name) ?? [];
  const tenantRequesters = (tenantsQuery.data ?? []).filter((tenant) =>
    tenant.leases.some(
      (lease) => lease.propertyId === Number(form.propertyId) && selectedUnitNames.includes(lease.unitLabel),
    ),
  );
  const requesters = form.requestedByType === "tenant" ? tenantRequesters : (landlordsQuery.data ?? []);

  React.useEffect(() => {
    if (!open) setForm(initialForm);
  }, [open]);

  function toggleUnit(unitId: number) {
    setForm((current) => ({
      ...current,
      requestedById: "",
      unitIds: current.unitIds.includes(unitId)
        ? current.unitIds.filter((id) => id !== unitId)
        : [...current.unitIds, unitId],
    }));
  }

  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent size="lg">
        <DrawerHeader className="flex items-center gap-3">
          <DrawerClose disabled={isPending} />
          <DrawerTitle>New Maintenance Item</DrawerTitle>
        </DrawerHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({
              ticketTitle: form.ticketTitle,
              propertyId: Number(form.propertyId),
              unitIds: form.unitIds,
              categoryId: Number(form.categoryId),
              description: form.description || undefined,
              requestedById: Number(form.requestedById),
              requestedByType: form.requestedByType,
              isUrgent: form.isUrgent,
            });
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-4 py-5 md:px-6">
              <div className="grid gap-4 rounded-lg border border-parcelis-border bg-parcelis-charcoal p-4 text-white md:grid-cols-[3rem_minmax(0,1fr)_8rem_8rem] md:items-center dark:bg-parcelis-slate">
                <div className="grid h-12 w-12 place-items-center rounded-md bg-white/10 text-parcelis-green">
                  <Wrench className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-white">{form.ticketTitle || "Maintenance Item"}</p>
                  <p className="mt-1 truncate text-sm font-medium text-white/70">
                    {property?.name || "Property not selected"}
                  </p>
                  {property ? (
                    <p className="truncate text-sm font-medium text-white/70">
                      {selectedUnitNames.length > 0
                        ? selectedUnitNames.map((unitName) => `Unit ${unitName}`).join(" | ")
                        : "No units selected"}
                    </p>
                  ) : null}
                </div>
                <div className="border-white/15 md:border-l md:pl-8">
                  <p className="text-xs font-semibold uppercase text-white/55">Status</p>
                  <p className="mt-1 text-base font-semibold text-white">Open</p>
                </div>
                <div className="border-white/15 md:border-l md:pl-8">
                  <p className="text-xs font-semibold uppercase text-white/55">Priority</p>
                  <p className="mt-1 text-base font-semibold text-white">{form.isUrgent ? "Urgent" : "Standard"}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-5 px-4 pb-6 md:grid-cols-2 md:px-6">
              <Label className="gap-2 md:col-span-2">
                Ticket Title
                <Input
                  required
                  value={form.ticketTitle}
                  onChange={(event) => setForm({ ...form, ticketTitle: event.target.value })}
                />
              </Label>
              <Label className="gap-2">
                Property
                <Select
                  required
                  value={form.propertyId}
                  onChange={(event) =>
                    setForm({ ...form, propertyId: event.target.value, unitIds: [], requestedById: "" })
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
              <div className="grid gap-2">
                <Label>Units</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="flex h-10 w-full items-center justify-between rounded-md border border-parcelis-border bg-white px-3 text-left text-sm text-parcelis-charcoal disabled:cursor-not-allowed disabled:bg-parcelis-porcelain disabled:text-parcelis-gray"
                      disabled={!property}
                      type="button"
                    >
                      <span className="truncate">
                        {selectedUnitNames.length > 0
                          ? selectedUnitNames.map((unitName) => `Unit ${unitName}`).join(" | ")
                          : "Select units"}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72">
                    <div className="grid max-h-64 gap-2 overflow-y-auto">
                      {property?.units.map((unit) => (
                        <label className="flex items-center gap-2 text-sm text-parcelis-charcoal" key={unit.id}>
                          <Checkbox
                            checked={form.unitIds.includes(unit.id)}
                            onCheckedChange={() => toggleUnit(unit.id)}
                          />
                          Unit {unit.name}
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="md:col-span-2">
                <Label>Category</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(categoriesQuery.data ?? []).map((item) => {
                    const isSelected = form.categoryId === String(item.id);
                    const Icon = categoryIcons[item.label] ?? Wrench;
                    return (
                      <button
                        aria-pressed={isSelected}
                        className={`h-20 w-20 rounded-md border p-2 text-center text-xs font-semibold transition ${
                          isSelected
                            ? "border-parcelis-green bg-parcelis-green/15 text-parcelis-charcoal"
                            : "border-parcelis-border bg-white text-parcelis-gray hover:bg-parcelis-porcelain hover:text-parcelis-charcoal"
                        }`}
                        key={item.id}
                        onClick={() => setForm({ ...form, categoryId: String(item.id) })}
                        type="button"
                      >
                        <span className="flex h-full flex-col items-center justify-center gap-2">
                          <Icon className="h-6 w-6 text-parcelis-green" />
                          <span>{item.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <Label className="gap-2 md:col-span-2">
                Description
                <Textarea
                  rows={4}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </Label>
              <Label className="gap-2">
                Requested By Type
                <Select
                  value={form.requestedByType}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      requestedByType: event.target.value as "tenant" | "landlord",
                      requestedById: "",
                    })
                  }
                >
                  <option value="tenant">Tenant</option>
                  <option value="landlord">Landlord</option>
                </Select>
              </Label>
              <Label className="gap-2">
                Requested By
                <Select
                  required
                  value={form.requestedById}
                  onChange={(event) => setForm({ ...form, requestedById: event.target.value })}
                >
                  <option value="">Select requester</option>
                  {requesters.map((requester) => (
                    <option key={requester.id} value={requester.id}>
                      {requester.firstName} {requester.lastName}
                    </option>
                  ))}
                </Select>
              </Label>
              <label className="flex items-center gap-3 text-sm font-semibold text-parcelis-charcoal md:col-span-2">
                <Checkbox
                  checked={form.isUrgent}
                  onCheckedChange={(checked) => setForm({ ...form, isUrgent: checked === true })}
                />
                Urgent request
              </label>
              {error ? (
                <p className="text-sm font-medium text-red-700 md:col-span-2">
                  Unable to create maintenance item. Please try again.
                </p>
              ) : null}
            </div>
          </div>
          <DrawerFooter className="flex items-center justify-between gap-3">
            <Button className="min-w-40" type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="min-w-40" disabled={isPending} type="submit">
              Create Item
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
