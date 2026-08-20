"use client";

import * as React from "react";
import Image from "next/image";
import {
  AirVent,
  Bath,
  Bug,
  CircleHelp,
  ChevronRight,
  CookingPot,
  Droplets,
  Flame,
  House,
  ImagePlus,
  Refrigerator,
  Trash2,
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
  drawerTitle?: string;
  error?: Error | null;
  existingAttachments?: Array<{ id: number; fileName: string; imageUrl: string | null }>;
  isDeletingAttachment?: boolean;
  isPending: boolean;
  onDeleteExistingAttachment?: (attachmentId: number) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateMaintenanceTicketInput, attachments: File[]) => void;
  initialValues?: Partial<typeof initialForm>;
  statusLabel?: string;
  submitLabel?: string;
  ticketNumber?: number;
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
  priority: "medium" as "low" | "medium" | "high" | "urgent",
  isUrgent: false,
  consentToEnter: false,
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

export function MaintenanceDrawer({
  drawerTitle = "New Maintenance Item",
  error,
  existingAttachments = [],
  isDeletingAttachment = false,
  initialValues,
  isPending,
  onDeleteExistingAttachment,
  onOpenChange,
  onSubmit,
  open,
  statusLabel = "New",
  submitLabel = "Create Item",
  ticketNumber,
}: MaintenanceDrawerProps) {
  const [form, setForm] = React.useState(initialForm);
  const [section, setSection] = React.useState<"details" | "images">("details");
  const [attachments, setAttachments] = React.useState<Array<{ file: File; previewUrl: string }>>([]);
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);
  const wasOpen = React.useRef(false);
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
  const isDetailsComplete = Boolean(
    form.ticketTitle.trim() &&
    form.propertyId &&
    form.unitIds.length > 0 &&
    form.categoryId &&
    form.description.trim() &&
    form.requestedById,
  );

  React.useEffect(() => {
    if (!open) {
      setForm(initialForm);
      setSection("details");
      setAttachments((current) => {
        current.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
        return [];
      });
    }
  }, [open]);
  React.useEffect(() => {
    if (open && !wasOpen.current) setForm({ ...initialForm, ...initialValues });
    wasOpen.current = open;
  }, [initialValues, open]);

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
          <DrawerTitle>{drawerTitle}</DrawerTitle>
        </DrawerHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (section === "details") {
              if (isDetailsComplete) setSection("images");
              return;
            }
            if (!isDetailsComplete) return;
            onSubmit(
              {
                ticketTitle: form.ticketTitle,
                propertyId: Number(form.propertyId),
                unitIds: form.unitIds,
                categoryId: Number(form.categoryId),
                description: form.description || undefined,
                requestedById: Number(form.requestedById),
                requestedByType: form.requestedByType,
                priority: form.priority,
                isUrgent: form.isUrgent,
                consentToEnter: form.consentToEnter,
              },
              attachments.map((attachment) => attachment.file),
            );
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
                  <p className="mt-1 text-base font-semibold text-white">{statusLabel}</p>
                </div>
                <div className="border-white/15 md:border-l md:pl-8">
                  <p className="text-xs font-semibold uppercase text-white/55">Priority</p>
                  <p className="mt-1 text-base font-semibold text-white">{form.isUrgent ? "Urgent" : "Standard"}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-10 px-4 pb-6 md:px-6 lg:flex-row">
              <div className="lg:sticky lg:top-6 lg:w-[17rem] lg:shrink-0 lg:self-start">
                <aside className="overflow-hidden rounded-md border border-parcelis-border bg-white dark:bg-parcelis-slate">
                  <button
                    className={`flex w-full items-center gap-3 px-4 py-4 text-left text-sm font-semibold transition ${section === "details" ? "bg-parcelis-porcelain/70 text-parcelis-charcoal dark:bg-parcelis-charcoal/55 dark:text-white" : "text-parcelis-gray hover:bg-parcelis-porcelain/70"}`}
                    onClick={() => setSection("details")}
                    type="button"
                  >
                    <Wrench
                      className={`h-5 w-5 ${section === "details" ? "text-parcelis-green" : "text-parcelis-gray"}`}
                    />
                    Maintenance Details
                  </button>
                  <button
                    className={`flex w-full items-center gap-3 border-t border-parcelis-border px-4 py-4 text-left text-sm font-semibold transition ${section === "images" ? "bg-parcelis-porcelain/70 text-parcelis-charcoal dark:bg-parcelis-charcoal/55 dark:text-white" : "text-parcelis-gray hover:bg-parcelis-porcelain/70"}`}
                    onClick={() => setSection("images")}
                    type="button"
                  >
                    <ImagePlus
                      className={`h-5 w-5 ${section === "images" ? "text-parcelis-green" : "text-parcelis-gray"}`}
                    />
                    Maintenance Images
                    {existingAttachments.length + attachments.length
                      ? ` (${existingAttachments.length + attachments.length})`
                      : ""}
                  </button>
                </aside>
              </div>
              <div className="min-w-0 flex-1">
                <div className={section === "details" ? "grid gap-5 md:grid-cols-2" : "hidden"}>
                  {ticketNumber ? (
                    <Label className="gap-2 md:col-span-2">
                      Ticket Number
                      <Input readOnly value={`MNT-${ticketNumber.toString().padStart(7, "0")}`} />
                    </Label>
                  ) : null}
                  <Label className="gap-2 md:col-span-2">
                    Ticket Title *
                    <Input
                      required
                      value={form.ticketTitle}
                      onChange={(event) => setForm({ ...form, ticketTitle: event.target.value })}
                    />
                  </Label>
                  <Label className="gap-2">
                    Property *
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
                    <Label>Units *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className="flex h-10 w-full items-center justify-between rounded-md border border-parcelis-border bg-white px-3 text-left text-sm text-parcelis-charcoal disabled:cursor-not-allowed disabled:bg-parcelis-porcelain disabled:text-parcelis-gray dark:bg-parcelis-slate dark:text-white dark:disabled:bg-parcelis-charcoal"
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
                            <label
                              className="flex items-center gap-2 text-sm text-parcelis-charcoal dark:text-white"
                              key={unit.id}
                            >
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
                    <Label>Category *</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(categoriesQuery.data ?? []).map((item) => {
                        const isSelected = form.categoryId === String(item.id);
                        const Icon = categoryIcons[item.label] ?? Wrench;
                        return (
                          <button
                            aria-pressed={isSelected}
                            className={`h-20 w-20 rounded-md border p-2 text-center text-xs font-semibold transition ${
                              isSelected
                                ? "border-parcelis-green bg-parcelis-green/15 text-parcelis-charcoal dark:bg-parcelis-green/20 dark:text-white"
                                : "border-parcelis-border bg-white text-parcelis-gray hover:bg-parcelis-porcelain hover:text-parcelis-charcoal dark:bg-parcelis-slate dark:hover:bg-parcelis-charcoal dark:hover:text-white"
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
                  <Label className="gap-2">
                    Priority *
                    <Select
                      value={form.priority}
                      onChange={(event) => {
                        const priority = event.target.value as typeof form.priority;
                        setForm({ ...form, priority, isUrgent: priority === "urgent" });
                      }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </Select>
                  </Label>
                  <Label className="gap-2 md:col-span-2">
                    Description *
                    <Textarea
                      rows={4}
                      value={form.description}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                      required
                    />
                  </Label>
                  <Label className="gap-2">
                    Requested By Type *
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
                    Requested By *
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
                  <div className="flex items-center gap-3 text-sm font-semibold text-parcelis-charcoal md:col-span-2">
                    <Checkbox
                      checked={form.isUrgent}
                      onCheckedChange={(checked) => {
                        const isUrgent = checked === true;
                        setForm((current) => ({
                          ...current,
                          isUrgent,
                          priority: isUrgent ? "urgent" : "medium",
                        }));
                      }}
                      id="isUrgent"
                    />
                    <Label htmlFor="isUrgent">Urgent request</Label>
                  </div>
                  <div className="flex items-center gap-3 text-sm font-semibold text-parcelis-charcoal md:col-span-2">
                    <Checkbox
                      checked={form.consentToEnter}
                      id="consentToEnter"
                      onCheckedChange={(checked) =>
                        setForm((current) => ({ ...current, consentToEnter: checked === true }))
                      }
                    />
                    <Label htmlFor="consentToEnter">Consent to enter premises</Label>
                  </div>
                  {error ? (
                    <p className="text-sm font-medium text-red-700 md:col-span-2">
                      Unable to create maintenance item. Please try again.
                    </p>
                  ) : null}
                </div>
                {section === "images" ? (
                  <section className="rounded-lg border border-parcelis-border bg-parcelis-porcelain/50 p-5 dark:bg-parcelis-charcoal/55">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-parcelis-charcoal dark:text-white">Maintenance images</h3>
                        <p className="mt-1 text-sm text-parcelis-gray">Add images for this maintenance item.</p>
                      </div>
                      <span className="text-sm font-semibold text-parcelis-gray">
                        {existingAttachments.length + attachments.length}
                      </span>
                    </div>
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      multiple
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? []).filter((file) =>
                          file.type.startsWith("image/"),
                        );
                        setAttachments((current) => [
                          ...current,
                          ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
                        ]);
                        event.target.value = "";
                      }}
                      ref={imageInputRef}
                      type="file"
                    />
                    <button
                      className="mt-5 flex w-full flex-col items-center justify-center rounded-md border border-dashed border-parcelis-border bg-white px-4 py-10 text-center hover:border-parcelis-green dark:bg-parcelis-slate"
                      onClick={() => imageInputRef.current?.click()}
                      type="button"
                    >
                      <ImagePlus className="h-6 w-6 text-parcelis-green" />
                      <span className="mt-3 text-sm font-semibold text-parcelis-charcoal dark:text-white">
                        Add images
                      </span>
                      <span className="mt-1 text-xs text-parcelis-gray">JPG, PNG, or WebP</span>
                    </button>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {existingAttachments.map((attachment) => (
                        <div
                          className="flex items-center gap-3 rounded-md border border-parcelis-border bg-white p-3 dark:bg-parcelis-slate"
                          key={attachment.id}
                        >
                          {attachment.imageUrl ? (
                            <Image
                              alt={attachment.fileName}
                              className="h-14 w-14 rounded object-cover"
                              src={attachment.imageUrl}
                              height={56}
                              unoptimized
                              width={56}
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-parcelis-charcoal dark:text-white">
                              {attachment.fileName}
                            </span>
                            <span className="text-xs font-medium text-parcelis-gray">Attached</span>
                          </div>
                          {onDeleteExistingAttachment ? (
                            <button
                              aria-label={`Delete ${attachment.fileName}`}
                              className="text-parcelis-gray hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isDeletingAttachment}
                              onClick={() => onDeleteExistingAttachment(attachment.id)}
                              type="button"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      ))}
                      {attachments.map((attachment, index) => (
                        <div
                          className="flex items-center gap-3 rounded-md border border-parcelis-border bg-white p-3 dark:bg-parcelis-slate"
                          key={attachment.previewUrl}
                        >
                          <Image
                            alt="Selected attachment"
                            className="h-14 w-14 rounded object-cover"
                            src={attachment.previewUrl}
                            height={56}
                            unoptimized
                            width={56}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-parcelis-charcoal dark:text-white">
                            {attachment.file.name}
                          </span>
                          <button
                            aria-label={`Remove ${attachment.file.name}`}
                            className="text-parcelis-gray hover:text-red-700"
                            onClick={() =>
                              setAttachments((current) => {
                                const item = current[index];
                                if (item) URL.revokeObjectURL(item.previewUrl);
                                return current.filter((_, itemIndex) => itemIndex !== index);
                              })
                            }
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
          <DrawerFooter className="flex items-center justify-between gap-3">
            <Button className="min-w-40" type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {section === "details" ? (
              <Button className="min-w-40" disabled={!isDetailsComplete} type="submit">
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button className="min-w-40" disabled={isPending || !isDetailsComplete} type="submit">
                {submitLabel}
              </Button>
            )}
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
