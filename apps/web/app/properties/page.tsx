"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  DoorOpen,
  EllipsisVertical,
  Filter,
  Loader2,
  Pencil,
  Plus,
  Search,
  StickyNote,
  Trash2,
  Wrench,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  CardHeader,
  Checkbox,
  Input,
  Label,
  ParcelisLogo,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
} from "@parcelis/ui";
import { propertyTypeValues, type CreatePropertyInput, type PropertyType, type UpdatePropertyInput } from "@parcelis/schemas";
import { PropertyDrawer, initialPropertyFormState, type PropertyFormState } from "../../components/property-drawer";
import { apiClient, queryKeys } from "../../components/api-client";
import { useShortcut } from "../../components/shortcut-provider";
import { Sidebar } from "../../components/sidebar";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

type PropertyFilters = {
  propertyId: string;
  city: string;
  region: string;
  postalCode: string;
  status: string;
  minimumUnits: string;
  hasOpenMaintenance: boolean;
  archivedOnly: boolean;
};

type PropertyListItem = Awaited<ReturnType<typeof apiClient.properties.list.query>>[number];

const initialFilters: PropertyFilters = {
  propertyId: "",
  city: "",
  region: "",
  postalCode: "",
  status: "all",
  minimumUnits: "",
  hasOpenMaintenance: false,
  archivedOnly: false,
};

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function getUnitRows(property: PropertyListItem) {
  const openTicketStatuses = new Set(["open", "in_progress", "waiting_vendor"]);
  const leaseByUnit = new Map(property.leases.map((lease) => [lease.unitLabel, lease]));
  const ticketCountsByUnit = new Map<string, number>();
  const now = new Date();
  const expiresBefore = new Date(now);
  expiresBefore.setDate(expiresBefore.getDate() + 90);

  for (const ticket of property.maintenanceTickets) {
    if (!ticket.unitLabel || !openTicketStatuses.has(ticket.status)) {
      continue;
    }
    ticketCountsByUnit.set(ticket.unitLabel, (ticketCountsByUnit.get(ticket.unitLabel) ?? 0) + 1);
  }

  return Array.from({ length: property.unitCount }, (_, index) => {
    const fallbackLabel = String(index + 1);
    const lease = property.leases[index];
    const unitLabel = lease?.unitLabel ?? fallbackLabel;
    const activeLease = leaseByUnit.get(unitLabel);
    const endsOn = activeLease ? new Date(activeLease.endsOn) : null;
    const isExpiring = Boolean(endsOn && endsOn >= now && endsOn <= expiresBefore);

    return {
      unitLabel,
      isOccupied: index < property.occupiedUnits,
      monthlyRentCents: activeLease?.monthlyRentCents ?? 0,
      amountOverdueCents: activeLease?.amountOverdueCents ?? 0,
      expiringLeases90Days: isExpiring ? 1 : 0,
      openMaintenanceTickets: ticketCountsByUnit.get(unitLabel) ?? 0,
      status: activeLease?.status ?? "vacant",
    };
  });
}

function parseContactAddress(contactAddress: string | null | undefined) {
  const [line1 = "", line2 = "", cityRegionPostal = ""] = contactAddress?.split("\n") ?? [];
  const [city = "", regionPostal = ""] = cityRegionPostal.split(", ");
  const [region = "", ...postalCodeParts] = regionPostal.split(" ");

  return {
    contactAddressLine1: line1,
    contactAddressLine2: line2,
    contactCity: city,
    contactRegion: region,
    contactPostalCode: postalCodeParts.join(" "),
  };
}

function getPropertyType(value: string): PropertyType {
  return propertyTypeValues.includes(value as PropertyType) ? (value as PropertyType) : "Apartment";
}

function getPropertyFormState(property: PropertyListItem): PropertyFormState {
  return {
    name: property.name,
    line1: property.line1,
    line2: property.line2 ?? "",
    city: property.city,
    region: property.region,
    postalCode: property.postalCode,
    propertyType: getPropertyType(property.propertyType),
    contactName: property.contactName ?? "",
    contactEmail: property.contactEmail ?? "",
    contactPhone: property.contactPhone ?? "",
    ...parseContactAddress(property.contactAddress),
    unitCount: String(property.unitCount),
  };
}

function PropertyActionsMenu({
  onArchive,
  onDelete,
  onEdit,
  onNotes,
  property,
}: {
  onArchive: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onNotes: () => void;
  property: PropertyListItem;
}) {
  const [open, setOpen] = React.useState(false);

  function runAction(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`Open actions for ${property.name}`}
          className="inline-grid h-8 w-8 place-items-center rounded-md border border-parcelis-border text-parcelis-gray transition hover:bg-parcelis-porcelain hover:text-parcelis-charcoal"
          type="button"
        >
          <EllipsisVertical className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="left-auto right-0 w-48 p-1 text-left">
        <button
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-parcelis-charcoal hover:bg-parcelis-porcelain"
          onClick={() => runAction(onEdit)}
          type="button"
        >
          <Pencil className="h-4 w-4 text-parcelis-green" />
          Edit
        </button>
        <button
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-parcelis-charcoal hover:bg-parcelis-porcelain"
          onClick={() => runAction(onNotes)}
          type="button"
        >
          <StickyNote className="h-4 w-4 text-parcelis-green" />
          Add Notes
        </button>
        <button
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-parcelis-charcoal hover:bg-parcelis-porcelain disabled:cursor-not-allowed disabled:opacity-50"
          disabled={property.status === "archived"}
          onClick={() => runAction(onArchive)}
          type="button"
        >
          <Archive className="h-4 w-4 text-parcelis-green" />
          Archive
        </button>
        <button
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          onClick={() => runAction(onDelete)}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </PopoverContent>
    </Popover>
  );
}

export default function PropertiesPage() {
  const queryClient = useQueryClient();
  const propertiesQuery = useQuery({
    queryKey: queryKeys.properties.list,
    queryFn: () => apiClient.properties.list.query(),
  });
  const createProperty = useMutation({
    mutationFn: (input: CreatePropertyInput) => apiClient.properties.create.mutate(input),
    onSuccess: async () => {
      setForm(initialPropertyFormState);
      setIsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.properties.list });
    },
  });
  const updateProperty = useMutation({
    mutationFn: (input: UpdatePropertyInput) => apiClient.properties.update.mutate(input),
    onSuccess: async (_property, input) => {
      setIsFormOpen(false);
      setEditingPropertyId(null);
      setEditInitialForm(initialPropertyFormState);
      setForm(initialPropertyFormState);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.list }),
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.byId(input.id) }),
      ]);
    },
  });
  const archiveProperty = useMutation({
    mutationFn: (input: { id: string }) => apiClient.properties.archive.mutate(input),
    onSuccess: async (_property, input) => {
      setArchivePropertyId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.list }),
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.byId(input.id) }),
      ]);
    },
  });
  const deleteProperty = useMutation({
    mutationFn: (input: { id: string }) => apiClient.properties.delete.mutate(input),
    onSuccess: async (_property, input) => {
      setDeletePropertyId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.list }),
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.byId(input.id) }),
      ]);
    },
  });
  const updatePropertyNotes = useMutation({
    mutationFn: (input: { id: string; notes?: string }) => apiClient.properties.updateNotes.mutate(input),
    onSuccess: async (_property, input) => {
      setNotesPropertyId(null);
      setNotesDraft("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.list }),
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.byId(input.id) }),
      ]);
    },
  });
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [draftFilters, setDraftFilters] = React.useState<PropertyFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = React.useState<PropertyFilters>(initialFilters);
  const [expandedPropertyIds, setExpandedPropertyIds] = React.useState<Set<string>>(() => new Set());
  const [editingPropertyId, setEditingPropertyId] = React.useState<string | null>(null);
  const [editInitialForm, setEditInitialForm] = React.useState<PropertyFormState>(initialPropertyFormState);
  const [archivePropertyId, setArchivePropertyId] = React.useState<string | null>(null);
  const [deletePropertyId, setDeletePropertyId] = React.useState<string | null>(null);
  const [notesPropertyId, setNotesPropertyId] = React.useState<string | null>(null);
  const [notesDraft, setNotesDraft] = React.useState("");
  const [form, setForm] = React.useState<PropertyFormState>(initialPropertyFormState);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  useShortcut("Mod+Shift+P", () => setIsFormOpen(true));
  useShortcut("/", () => searchInputRef.current?.focus(), { enabled: !isFormOpen });

  const properties = propertiesQuery.data ?? [];
  const editingProperty = properties.find((property) => property.id === editingPropertyId) ?? null;
  const archivePropertyTarget = properties.find((property) => property.id === archivePropertyId) ?? null;
  const deletePropertyTarget = properties.find((property) => property.id === deletePropertyId) ?? null;
  const notesPropertyTarget = properties.find((property) => property.id === notesPropertyId) ?? null;
  const filteredProperties = properties.filter((property) => {
    const query = search.toLowerCase();
    const matchesSearch = [property.name, property.city, property.region, property.propertyType, property.status].some((value) =>
      value.toLowerCase().includes(query),
    );
    const matchesProperty = !appliedFilters.propertyId || property.id === appliedFilters.propertyId;
    const matchesCity = !appliedFilters.city || property.city === appliedFilters.city;
    const matchesRegion = !appliedFilters.region || property.region === appliedFilters.region;
    const matchesPostalCode =
      !appliedFilters.postalCode || property.postalCode.includes(appliedFilters.postalCode);
    const matchesStatus = appliedFilters.status === "all" || property.status === appliedFilters.status;
    const matchesUnits =
      !appliedFilters.minimumUnits || property.unitCount >= Number(appliedFilters.minimumUnits);
    const matchesMaintenance = !appliedFilters.hasOpenMaintenance || property.openMaintenanceTickets > 0;
    const matchesArchived = appliedFilters.archivedOnly
      ? property.status === "archived"
      : appliedFilters.status === "archived" || property.status !== "archived";

    return (
      matchesSearch &&
      matchesProperty &&
      matchesCity &&
      matchesRegion &&
      matchesPostalCode &&
      matchesStatus &&
      matchesUnits &&
      matchesMaintenance &&
      matchesArchived
    );
  });
  const uniqueCities = Array.from(new Set(properties.map((property) => property.city))).sort();
  const uniqueRegions = Array.from(new Set(properties.map((property) => property.region))).sort();
  const activeFilterCount = Object.entries(appliedFilters).filter(([key, value]) => {
    if (key === "status") {
      return value !== "all";
    }
    return Boolean(value);
  }).length;
  const totalUnits = properties.reduce((sum, property) => sum + property.unitCount, 0);
  const occupiedUnits = properties.reduce((sum, property) => sum + property.occupiedUnits, 0);
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 1000) / 10 : 0;
  const monthlyRentCents = properties.reduce((sum, property) => sum + property.monthlyRentCents, 0);
  const overdueCents = properties.reduce((sum, property) => sum + property.amountOverdueCents, 0);

  function updateFilter<Key extends keyof PropertyFilters>(field: Key, value: PropertyFilters[Key]) {
    setDraftFilters((current) => ({ ...current, [field]: value }));
  }

  function clearFilters() {
    setDraftFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setIsFilterOpen(false);
  }

  function applyFilters() {
    setAppliedFilters(draftFilters);
    setIsFilterOpen(false);
  }

  function togglePropertyUnits(propertyId: string) {
    setExpandedPropertyIds((current) => {
      const next = new Set(current);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  }

  function openEditProperty(property: PropertyListItem) {
    const nextForm = getPropertyFormState(property);
    setEditInitialForm(nextForm);
    setForm(nextForm);
    setEditingPropertyId(property.id);
    setIsFormOpen(true);
  }

  function closePropertyDrawer(open: boolean) {
    setIsFormOpen(open);
    if (!open) {
      setEditingPropertyId(null);
      setEditInitialForm(initialPropertyFormState);
    }
  }

  function openNotes(property: PropertyListItem) {
    setNotesPropertyId(property.id);
    setNotesDraft(property.notes ?? "");
  }

  return (
    <main className="min-h-screen">
      <Sidebar active="properties" />
      <PropertyDrawer
        cancelDescription={editingProperty ? "Are you sure you'd like to cancel editing?" : undefined}
        drawerTitle={editingProperty ? "Edit Property" : "Add Property"}
        error={editingProperty ? updateProperty.error : createProperty.error}
        form={form}
        initialFormState={editingProperty ? editInitialForm : initialPropertyFormState}
        isPending={editingProperty ? updateProperty.isPending : createProperty.isPending}
        onFormChange={setForm}
        onOpenChange={closePropertyDrawer}
        onSubmit={(input) => {
          if (editingProperty) {
            updateProperty.mutate({ ...input, id: editingProperty.id });
          } else {
            createProperty.mutate(input);
          }
        }}
        open={isFormOpen}
        submitLabel={editingProperty ? "Save" : "Next"}
      />
      <AlertDialog open={Boolean(archivePropertyTarget)} onOpenChange={(open) => !open && setArchivePropertyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive property?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide {archivePropertyTarget?.name ?? "this property"} from the default properties view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="secondary" onClick={() => setArchivePropertyId(null)}>
              Keep Active
            </Button>
            <Button
              disabled={archiveProperty.isPending}
              onClick={() => archivePropertyTarget && archiveProperty.mutate({ id: archivePropertyTarget.id })}
              type="button"
            >
              {archiveProperty.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
              Archive
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(deletePropertyTarget)} onOpenChange={(open) => !open && setDeletePropertyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete property?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {deletePropertyTarget?.name ?? "this property"} and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDeletePropertyId(null)}>
              Keep Property
            </Button>
            <Button
              disabled={deleteProperty.isPending}
              onClick={() => deletePropertyTarget && deleteProperty.mutate({ id: deletePropertyTarget.id })}
              type="button"
            >
              {deleteProperty.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(notesPropertyTarget)} onOpenChange={(open) => !open && setNotesPropertyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Property notes</AlertDialogTitle>
            <AlertDialogDescription>
              Add internal notes for {notesPropertyTarget?.name ?? "this property"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <textarea
            className="mt-4 min-h-32 w-full resize-y rounded-md border border-parcelis-border bg-white p-3 text-sm text-parcelis-charcoal outline-none transition focus:border-parcelis-green"
            onChange={(event) => setNotesDraft(event.target.value)}
            value={notesDraft}
          />
          <AlertDialogFooter>
            <Button type="button" variant="secondary" onClick={() => setNotesPropertyId(null)}>
              Cancel
            </Button>
            <Button
              disabled={updatePropertyNotes.isPending}
              onClick={() =>
                notesPropertyTarget &&
                updatePropertyNotes.mutate({ id: notesPropertyTarget.id, notes: notesDraft || undefined })
              }
              type="button"
            >
              {updatePropertyNotes.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <StickyNote className="h-4 w-4" />}
              Save Notes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="lg:hidden">
            <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/">Portfolio</Link>
            </Button>
            <Button size="sm" onClick={() => setIsFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Property
            </Button>
          </div>
        </header>

        <div className="parcelis-page-shell">
          <section className="mb-6 flex flex-col gap-5 rounded-lg bg-parcelis-charcoal p-6 text-white md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Properties</p>
              <h1 className="mt-5 text-3xl font-bold md:text-5xl">Portfolio directory</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                Browse every property, review occupancy, and open detail records for units, leases, maintenance, and financials.
              </p>
            </div>
            <div className="grid gap-2 text-sm text-white/75 sm:grid-cols-5 md:min-w-[700px]">
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{properties.length}</div>
                Properties
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{totalUnits}</div>
                Units
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{occupancyRate}%</div>
                Occupancy
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{formatCurrency(monthlyRentCents)}</div>
                Rent Roll
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{formatCurrency(overdueCents)}</div>
                Overdue
              </div>
            </div>
          </section>

          <Card>
            <CardHeader>
              <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="font-semibold text-parcelis-charcoal">All Properties</h2>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex h-10 items-center gap-2 rounded-md border border-parcelis-border bg-white px-3 text-sm text-parcelis-gray md:min-w-80">
                    <Search className="h-4 w-4" />
                    <Input
                      className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 focus:border-transparent"
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search name, city, state, status"
                      ref={searchInputRef}
                      value={search}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setDraftFilters(appliedFilters);
                      setIsFilterOpen((value) => !value);
                    }}
                  >
                    <Filter className="h-4 w-4" />
                    Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                  </Button>
                </div>
                {isFilterOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-3 w-full max-w-3xl rounded-lg border border-parcelis-border bg-white p-5 shadow-lg">
                    <div className="grid gap-4 md:grid-cols-6">
                      <Label className="gap-2 md:col-span-6">
                        <span className="text-sm font-semibold text-parcelis-charcoal">Property</span>
                        <Select
                          className="h-11"
                          onChange={(event) => updateFilter("propertyId", event.target.value)}
                          value={draftFilters.propertyId}
                        >
                          <option value="">Select Property</option>
                          {properties.map((property) => (
                            <option key={property.id} value={property.id}>
                              {property.name}
                            </option>
                          ))}
                        </Select>
                      </Label>

                      <Label className="gap-2 md:col-span-2">
                        <span className="text-sm font-semibold text-parcelis-charcoal">City</span>
                        <Input
                          className="h-11"
                          list="property-cities"
                          onChange={(event) => updateFilter("city", event.target.value)}
                          placeholder="Select"
                          value={draftFilters.city}
                        />
                        <datalist id="property-cities">
                          {uniqueCities.map((city) => (
                            <option key={city} value={city} />
                          ))}
                        </datalist>
                      </Label>

                      <Label className="gap-2 md:col-span-2">
                        <span className="text-sm font-semibold text-parcelis-charcoal">State</span>
                        <Select
                          className="h-11"
                          onChange={(event) => updateFilter("region", event.target.value)}
                          value={draftFilters.region}
                        >
                          <option value="">Select</option>
                          {uniqueRegions.map((region) => (
                            <option key={region} value={region}>
                              {region}
                            </option>
                          ))}
                        </Select>
                      </Label>

                      <Label className="gap-2 md:col-span-2">
                        <span className="text-sm font-semibold text-parcelis-charcoal">Zip</span>
                        <Input
                          className="h-11"
                          onChange={(event) => updateFilter("postalCode", event.target.value)}
                          placeholder="0"
                          value={draftFilters.postalCode}
                        />
                      </Label>

                      <Label className="gap-2 md:col-span-3">
                        <span className="text-sm font-semibold text-parcelis-charcoal">Status</span>
                        <Select
                          className="h-11"
                          onChange={(event) => updateFilter("status", event.target.value)}
                          value={draftFilters.status}
                        >
                          <option value="all">All</option>
                          <option value="active">Active</option>
                          <option value="leasing">Leasing</option>
                          <option value="maintenance">Maintenance</option>
                          <option value="archived">Archived</option>
                        </Select>
                      </Label>

                      <Label className="gap-2 md:col-span-3">
                        <span className="text-sm font-semibold text-parcelis-charcoal">Number of Units</span>
                        <Input
                          className="h-11"
                          min={0}
                          onChange={(event) => updateFilter("minimumUnits", event.target.value)}
                          placeholder="0"
                          type="number"
                          value={draftFilters.minimumUnits}
                        />
                      </Label>

                      <label className="flex items-center gap-3 md:col-span-6">
                        <Checkbox
                          checked={draftFilters.hasOpenMaintenance}
                          onChange={(event) => updateFilter("hasOpenMaintenance", event.target.checked)}
                        />
                        <span className="text-sm font-semibold text-parcelis-charcoal">Has open maintenance requests</span>
                      </label>

                      <label className="flex items-center gap-3 md:col-span-6">
                        <Checkbox
                          checked={draftFilters.archivedOnly}
                          onChange={(event) => updateFilter("archivedOnly", event.target.checked)}
                        />
                        <span className="text-sm font-semibold text-parcelis-charcoal">View Archived Properties Only</span>
                      </label>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-parcelis-border pt-4">
                      <button className="text-sm font-semibold text-red-600 hover:underline" onClick={clearFilters} type="button">
                        Clear Filters
                      </button>
                      <Button onClick={applyFilters} type="button">
                        Apply Filters
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {propertiesQuery.isLoading ? (
                <div className="flex min-h-48 items-center justify-center gap-2 text-sm font-medium text-parcelis-gray">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading properties
                </div>
              ) : propertiesQuery.error ? (
                <div className="min-h-48 p-5 text-sm font-medium text-red-700">{propertiesQuery.error.message}</div>
              ) : filteredProperties.length === 0 ? (
                <div className="min-h-48 p-5 text-sm text-parcelis-gray">No properties match your search.</div>
              ) : (
                <table className="w-full min-w-[1380px] border-collapse text-left text-sm">
                  <thead className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                    <tr>
                      <th className="w-72 px-5 py-3 font-semibold">Property</th>
                      <th className="w-36 px-5 py-3 font-semibold">Type</th>
                      <th className="w-56 px-5 py-3 font-semibold">Address</th>
                      <th className="px-5 py-3 font-semibold">Units</th>
                      <th className="px-5 py-3 font-semibold">Occupancy</th>
                      <th className="px-5 py-3 font-semibold">Rent</th>
                      <th className="px-5 py-3 font-semibold">Overdue</th>
                      <th className="w-40 px-5 py-3 font-semibold">90-Day Exp.</th>
                      <th className="w-32 px-5 py-3 font-semibold">Tickets</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="w-20 px-5 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProperties.map((property) => {
                      const isExpanded = expandedPropertyIds.has(property.id);
                      const unitRows = getUnitRows(property);
                      return (
                        <React.Fragment key={property.id}>
                          <tr className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60">
                            <td className="w-72 px-5 py-4">
                              <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3">
                                <button
                                  aria-label={isExpanded ? `Collapse ${property.name} units` : `Expand ${property.name} units`}
                                  className={`grid h-8 w-8 place-items-center rounded-md border border-parcelis-border text-parcelis-gray ${
                                    property.unitCount > 1 ? "hover:bg-white" : "cursor-not-allowed opacity-40"
                                  }`}
                                  disabled={property.unitCount <= 1}
                                  onClick={() => togglePropertyUnits(property.id)}
                                  type="button"
                                >
                                  <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                </button>
                                <Link
                                  className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3"
                                  href={`/properties/${property.id}`}
                                >
                                  <div className="grid h-9 w-9 place-items-center rounded-md bg-parcelis-porcelain text-parcelis-charcoal">
                                    <Building2 className="h-4 w-4" />
                                  </div>
                                  <span className="min-w-0 font-semibold leading-6 text-parcelis-charcoal">{property.name}</span>
                                </Link>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <span className="rounded-md bg-parcelis-porcelain px-2 py-1 text-xs font-semibold text-parcelis-charcoal">
                                {property.propertyType}
                              </span>
                            </td>
                            <td className="max-w-56 whitespace-normal px-5 py-4 text-parcelis-gray">
                              {property.line1}, {property.city}, {property.region}
                            </td>
                            <td className="px-5 py-4">
                              <span className="inline-flex items-center gap-1">
                                <DoorOpen className="h-4 w-4 text-parcelis-green" />
                                {property.unitCount}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              {property.unitCount > 0 ? Math.round((property.occupiedUnits / property.unitCount) * 100) : 0}%
                            </td>
                            <td className="px-5 py-4">
                              <span className="inline-flex items-center gap-1 font-semibold text-parcelis-charcoal">
                                <CircleDollarSign className="h-4 w-4 text-parcelis-green" />
                                {formatCurrency(property.monthlyRentCents)}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex items-center gap-1 font-semibold ${
                                  property.amountOverdueCents > 0 ? "text-red-700" : "text-parcelis-gray"
                                }`}
                              >
                                {property.amountOverdueCents > 0 ? <AlertTriangle className="h-4 w-4" /> : null}
                                {formatCurrency(property.amountOverdueCents)}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                                  property.expiringLeases90Days > 0
                                    ? "bg-parcelis-green/15 text-parcelis-charcoal"
                                    : "bg-parcelis-porcelain text-parcelis-gray"
                                }`}
                              >
                                <CalendarClock className="h-4 w-4" />
                                {property.expiringLeases90Days > 0 ? `${property.expiringLeases90Days} expiring` : "Clear"}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex items-center gap-1 font-semibold ${
                                  property.openMaintenanceTickets > 0 ? "text-parcelis-charcoal" : "text-parcelis-gray"
                                }`}
                              >
                                <Wrench className="h-4 w-4 text-parcelis-green" />
                                {property.openMaintenanceTickets} open
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="rounded-md bg-parcelis-porcelain px-2 py-1 text-xs font-semibold text-parcelis-charcoal">
                                {formatStatus(property.status)}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <PropertyActionsMenu
                                onArchive={() => setArchivePropertyId(property.id)}
                                onDelete={() => setDeletePropertyId(property.id)}
                                onEdit={() => openEditProperty(property)}
                                onNotes={() => openNotes(property)}
                                property={property}
                              />
                            </td>
                          </tr>
                          {isExpanded
                            ? unitRows.map((unit) => (
                                <tr className="border-t border-parcelis-border bg-parcelis-porcelain/45" key={`${property.id}-${unit.unitLabel}`}>
                                  <td className="w-72 px-5 py-3">
                                    <div className="grid grid-cols-[2rem_2.25rem_minmax(0,1fr)] items-center gap-3">
                                      <span aria-hidden="true" />
                                      <div className="grid h-8 w-8 place-items-center rounded-md bg-white text-parcelis-charcoal">
                                        <DoorOpen className="h-4 w-4" />
                                      </div>
                                      <div className="min-w-0">
                                        <div className="font-semibold text-parcelis-charcoal">Unit {unit.unitLabel}</div>
                                        <div className="text-xs text-parcelis-gray">{property.name}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3 text-parcelis-gray">Unit</td>
                                  <td className="max-w-56 whitespace-normal px-5 py-3 text-parcelis-gray">{property.city}, {property.region}</td>
                                  <td className="px-5 py-3">1</td>
                                  <td className="px-5 py-3">{unit.isOccupied ? "100%" : "0%"}</td>
                                  <td className="px-5 py-3">
                                    <span className="font-semibold text-parcelis-charcoal">{formatCurrency(unit.monthlyRentCents)}</span>
                                  </td>
                                  <td className="px-5 py-3">
                                    <span className={unit.amountOverdueCents > 0 ? "font-semibold text-red-700" : "text-parcelis-gray"}>
                                      {formatCurrency(unit.amountOverdueCents)}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3">
                                    <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-parcelis-gray">
                                      {unit.expiringLeases90Days ? "Expiring" : "Clear"}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3">
                                    <span className="inline-flex items-center gap-1 text-parcelis-gray">
                                      <Wrench className="h-4 w-4 text-parcelis-green" />
                                      {unit.openMaintenanceTickets} open
                                    </span>
                                  </td>
                                  <td className="px-5 py-3">
                                    <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-parcelis-charcoal">
                                      {formatStatus(unit.status)}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3" />
                                </tr>
                              ))
                            : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
