"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  CircleX,
  EllipsisVertical,
  Eye,
  Filter,
  Pencil,
  Plus,
  Search,
  StickyNote,
  Trash2,
  Wrench,
  WrenchOff,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  ParcelisLogo,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@parcelis/ui";
import {
  isActiveMaintenanceTicketStatus,
  isTerminalMaintenanceTicketStatus,
  maintenanceTicketStatuses,
} from "@parcelis/schemas";
import { apiClient } from "../../components/api-client";
import { LoadingState } from "../../components/loading-state";
import { MaintenanceDrawer } from "../../components/maintenance-drawer";
import { uploadMaintenanceImage } from "../../components/maintenance-image-upload";
import { NotesDrawer } from "../../components/notes-drawer";
import { Sidebar } from "../../components/sidebar";
import { entityArchivedMessage, entityCreatedMessage, entityDeletedMessage } from "../../components/toast-messages";
import { getMaintenanceLink } from "../../lib/entity-links";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;
type TicketAction = {
  id: number;
  propertyName: string;
  status: "resolved" | "canceled";
  title: string;
  units: string;
};
type ActivityEventSummary = {
  id: number;
  subjectLabel: string;
  subjectReference: string | null;
  action: string;
  previousStatus: string | null;
  nextStatus: string | null;
  createdAt: Date | string;
};

function label(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
function formatTicketNumber(ticketNumber: number) {
  return `MNT-${ticketNumber.toString().padStart(7, "0")}`;
}
function ticketUnits(ticket: { units: Array<{ unit: { name: string } }> }) {
  return ticket.units.length ? ticket.units.map((item) => `Unit ${item.unit.name}`).join(" | ") : "Property-wide";
}
function statusBadgeClass(status: string) {
  if (status === "new") return "bg-parcelis-green/15 text-parcelis-charcoal";
  if (status === "in_progress") return "bg-sky-500/15 text-sky-700";
  if (status === "pending") return "bg-amber-500/15 text-amber-700";
  if (status === "scheduled") return "bg-violet-500/15 text-violet-700";
  if (status === "resolved") return "bg-emerald-500/15 text-emerald-700";
  if (status === "canceled") return "bg-red-500/15 text-red-700";
  return "bg-parcelis-porcelain text-parcelis-gray";
}

export default function MaintenancePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [propertyFilter, setPropertyFilter] = React.useState("all");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [urgencyFilter, setUrgencyFilter] = React.useState("all");
  const [groupByProperty, setGroupByProperty] = React.useState(false);
  const [isLoggingOpen, setIsLoggingOpen] = React.useState(false);
  const [expandedPropertyIds, setExpandedPropertyIds] = React.useState<Set<number>>(new Set());
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [notesTicket, setNotesTicket] = React.useState<{
    id: number;
    propertyName: string;
    status: string;
    title: string;
    units: string;
  } | null>(null);
  const [ticketAction, setTicketAction] = React.useState<TicketAction | null>(null);
  const [ticketActionNote, setTicketActionNote] = React.useState("");
  const ticketsQuery = useQuery({
    queryKey: ["maintenance", "list"],
    queryFn: () => apiClient.maintenance.list.query(),
  });
  const activityEventsQuery = useQuery({
    queryKey: ["activityEvents", "list", { limit: 50 }],
    queryFn: () => apiClient.activityEvents.list.query({ limit: 50 }),
    enabled: isLoggingOpen,
  });
  const createTicket = useMutation({
    mutationFn: async ({
      input,
      attachments,
    }: {
      input: Parameters<typeof apiClient.maintenance.create.mutate>[0];
      attachments: File[];
    }) => {
      const ticket = await apiClient.maintenance.create.mutate(input);
      await Promise.all(attachments.map((file) => uploadMaintenanceImage(ticket.id, file)));
      return ticket;
    },
    onSuccess: async (ticket) => {
      setDrawerOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "list"] });
      toast.success(entityCreatedMessage("Maintenance", ticket.title));
    },
  });
  const archiveTicket = useMutation({
    mutationFn: (id: number) => apiClient.maintenance.archive.mutate({ id }),
    onSuccess: async (ticket) => {
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "list"] });
      toast.success(entityArchivedMessage("Maintenance", ticket.title));
    },
  });
  const deleteTicket = useMutation({
    mutationFn: (id: number) => apiClient.maintenance.delete.mutate({ id }),
    onSuccess: async (ticket) => {
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "list"] });
      toast.success(entityDeletedMessage("Maintenance", ticket.title));
    },
  });
  const latestActionNoteQuery = useQuery({
    queryKey: ["notes", "list", { maintenanceTicketId: ticketAction?.id ?? 0, limit: 1 }],
    queryFn: () => apiClient.notes.list.query({ maintenanceTicketId: ticketAction!.id, limit: 1 }),
    enabled: ticketAction?.status === "resolved",
  });
  const changeTicketStatus = useMutation({
    mutationFn: ({ id, noteBody, status }: { id: number; noteBody?: string; status: "resolved" | "canceled" }) =>
      apiClient.maintenance.updateStatus.mutate({ id, noteBody, status }),
    onSuccess: async () => {
      const ticketId = ticketAction?.id;
      setTicketAction(null);
      setTicketActionNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["maintenance", "list"] }),
        queryClient.invalidateQueries({ queryKey: ["activityEvents", "list"] }),
        ...(ticketId
          ? [
              queryClient.invalidateQueries({
                queryKey: ["notes", "list", { maintenanceTicketId: ticketId, limit: 1 }],
              }),
            ]
          : []),
      ]);
    },
  });
  const reopenTicket = useMutation({
    mutationFn: (id: number) => apiClient.maintenance.updateStatus.mutate({ id, status: "in_progress" }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["maintenance", "list"] }),
        queryClient.invalidateQueries({ queryKey: ["activityEvents", "list"] }),
      ]),
  });
  const tickets = ticketsQuery.data ?? [];
  const activityEvents = (activityEventsQuery.data ?? []) as ActivityEventSummary[];
  const normalizedSearch = search.toLowerCase();
  const activeFilterCount = [statusFilter, propertyFilter, categoryFilter, urgencyFilter].filter(
    (value) => value !== "all",
  ).length;
  const filteredTickets = tickets.filter((ticket) =>
    [
      [ticket.title, ticket.property.name, ticket.category?.label ?? "", ticket.status].some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      ),
      statusFilter === "all" || ticket.status === statusFilter,
      propertyFilter === "all" || ticket.propertyId === Number(propertyFilter),
      categoryFilter === "all" || ticket.category?.label === categoryFilter,
      urgencyFilter === "all" ||
        (urgencyFilter === "urgent" && ticket.isUrgent) ||
        (urgencyFilter === "standard" && !ticket.isUrgent),
    ].every(Boolean),
  );
  const activeTickets = tickets.filter((ticket) => isActiveMaintenanceTicketStatus(ticket.status));
  const urgentTickets = tickets.filter((ticket) => ticket.isUrgent).length;
  const latestActionNote = latestActionNoteQuery.data?.[0];
  const actionHasRecentNote = latestActionNote
    ? Date.now() - new Date(latestActionNote.createdAt).getTime() <= 24 * 60 * 60 * 1000
    : false;
  const actionRequiresNote = ticketAction?.status === "canceled" || !actionHasRecentNote;
  const groupedTickets = Array.from(
    filteredTickets.reduce((groups, ticket) => {
      const group = groups.get(ticket.property.id) ?? {
        name: ticket.property.name,
        tickets: [] as typeof filteredTickets,
      };
      group.tickets.push(ticket);
      groups.set(ticket.property.id, group);
      return groups;
    }, new Map<number, { name: string; tickets: typeof filteredTickets }>()),
  );

  function toggleProperty(propertyId: number) {
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

  return (
    <main className="min-h-screen bg-parcelis-porcelain">
      <Sidebar active="maintenance" />
      <MaintenanceDrawer
        error={createTicket.error}
        isPending={createTicket.isPending}
        onOpenChange={setDrawerOpen}
        onSubmit={(input, attachments) => createTicket.mutate({ input, attachments })}
        open={drawerOpen}
      />
      <NotesDrawer
        maintenanceSummary={
          notesTicket
            ? { propertyName: notesTicket.propertyName, status: label(notesTicket.status), units: notesTicket.units }
            : undefined
        }
        onOpenChange={(open) => !open && setNotesTicket(null)}
        open={Boolean(notesTicket)}
        subject={{ maintenanceTicketId: notesTicket?.id ?? 0 }}
        subjectLabel={notesTicket?.title ?? "Maintenance Ticket"}
      />
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
          <Button className="min-w-40" onClick={() => setDrawerOpen(true)}>
            <Plus className="h-4 w-4" />
            New Maintenance Item
          </Button>
        </header>
        <div className="parcelis-page-shell">
          <section className="mb-6 flex flex-col gap-5 rounded-lg bg-parcelis-charcoal p-6 text-white md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Maintenance</p>
              <h1 className="mt-5 text-3xl font-bold md:text-5xl">Maintenance dashboard</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                Review, acknowledge, and resolve maintenance tickets across the portfolio.
              </p>
            </div>
            <div className="grid gap-2 text-sm text-white/75 sm:grid-cols-4 md:min-w-[540px]">
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{tickets.length}</div>Tickets
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{activeTickets.length}</div>Active
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{urgentTickets}</div>Urgent
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">
                  {tickets.filter((ticket) => ticket.status === "new").length}
                </div>
                New
              </div>
            </div>
          </section>
          <Card>
            <CardHeader>
              <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="font-semibold text-parcelis-charcoal">Maintenance tickets</h2>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex h-10 items-center gap-2 rounded-md border border-parcelis-border bg-white px-3 text-sm text-parcelis-gray md:min-w-80">
                    <Search className="h-4 w-4" />
                    <Input
                      className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 focus:border-transparent"
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search ticket, property, category, status"
                      value={search}
                    />
                  </label>
                  <Button onClick={() => setIsFilterOpen((open) => !open)} type="button" variant="secondary">
                    <Filter className="h-4 w-4" />
                    Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
                  </Button>
                  <Button onClick={() => setGroupByProperty((grouped) => !grouped)} type="button" variant="secondary">
                    Group by
                    {groupByProperty ? " Property" : ""}
                  </Button>
                </div>
                {isFilterOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-3 grid w-full max-w-3xl gap-4 rounded-lg border border-parcelis-border bg-white p-5 shadow-lg md:grid-cols-4 dark:bg-parcelis-slate">
                    <Label>
                      Status
                      <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                        <option value="all">All statuses</option>
                        {maintenanceTicketStatuses.map((status) => (
                          <option key={status} value={status}>
                            {label(status)}
                          </option>
                        ))}
                      </Select>
                    </Label>
                    <Label>
                      Property
                      <Select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)}>
                        <option value="all">All properties</option>
                        {Array.from(
                          new Map(tickets.map((ticket) => [ticket.property.id, ticket.property.name])).entries(),
                        ).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </Select>
                    </Label>
                    <Label>
                      Category
                      <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                        <option value="all">All categories</option>
                        {Array.from(new Set(tickets.map((ticket) => ticket.category?.label).filter(Boolean))).map(
                          (category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ),
                        )}
                      </Select>
                    </Label>
                    <Label>
                      Priority
                      <Select value={urgencyFilter} onChange={(event) => setUrgencyFilter(event.target.value)}>
                        <option value="all">All priorities</option>
                        <option value="urgent">Urgent</option>
                        <option value="standard">Standard</option>
                      </Select>
                    </Label>
                    <div className="flex items-center justify-between border-t border-parcelis-border pt-4 md:col-span-4">
                      <button
                        className="text-sm font-semibold text-red-600 hover:underline"
                        onClick={() => {
                          setStatusFilter("all");
                          setPropertyFilter("all");
                          setCategoryFilter("all");
                          setUrgencyFilter("all");
                        }}
                        type="button"
                      >
                        Clear Filters
                      </button>
                      <Button onClick={() => setIsFilterOpen(false)} type="button">
                        Apply Filters
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {ticketsQuery.isLoading ? (
                <LoadingState label="Loading maintenance tickets…" />
              ) : ticketsQuery.error ? (
                <div className="min-h-48 p-5 text-sm font-medium text-red-700">
                  Unable to load maintenance tickets. Please try again.
                </div>
              ) : groupByProperty ? (
                <Table className="min-w-[860px] border-collapse text-left">
                  <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                    <TableRow className="border-0">
                      <TableHead className="w-[40%] px-5 py-3 font-semibold">Property / Unit</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Issue Date</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Status</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedTickets.map(([propertyId, group]) => {
                      const isExpanded = expandedPropertyIds.has(propertyId);
                      return (
                        <React.Fragment key={propertyId}>
                          <TableRow className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60">
                            <TableCell className="px-5 py-4">
                              <button
                                className="flex items-center gap-3 font-semibold text-parcelis-charcoal"
                                onClick={() => toggleProperty(propertyId)}
                                type="button"
                              >
                                <span className="grid h-8 w-8 place-items-center rounded-md border border-parcelis-border">
                                  <ChevronRight
                                    className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                  />
                                </span>
                                <Wrench className="h-4 w-4 text-parcelis-green" />
                                {group.name}
                                <span className="text-sm font-medium text-parcelis-gray">({group.tickets.length})</span>
                              </button>
                            </TableCell>
                            <TableCell className="px-5 py-4 text-parcelis-gray">—</TableCell>
                            <TableCell className="px-5 py-4 text-parcelis-gray">—</TableCell>
                            <TableCell className="px-5 py-4 text-parcelis-gray">—</TableCell>
                          </TableRow>
                          {isExpanded
                            ? group.tickets.map((ticket) => (
                                <TableRow
                                  className="border-t border-parcelis-border bg-parcelis-porcelain/45"
                                  key={ticket.id}
                                >
                                  <TableCell className="px-5 py-3">
                                    <Link
                                      className="grid grid-cols-[2rem_2rem_minmax(0,1fr)] items-center gap-3 font-semibold text-parcelis-charcoal hover:text-parcelis-green"
                                      href={getMaintenanceLink(ticket.id)}
                                    >
                                      <span />
                                      <Wrench className="h-4 w-4 text-parcelis-green" />
                                      <span>
                                        {ticket.units.length
                                          ? ticket.units.map((item) => `Unit ${item.unit.name}`).join(" | ")
                                          : "Property-wide"}
                                        <span className="ml-2 text-sm font-medium text-parcelis-gray">
                                          · {ticket.title}
                                        </span>
                                      </span>
                                    </Link>
                                  </TableCell>
                                  <TableCell className="px-5 py-3 text-sm text-parcelis-gray">
                                    {formatDate(ticket.openedOn)}
                                  </TableCell>
                                  <TableCell className="px-5 py-3">
                                    <span
                                      className={`rounded-md px-2 py-1 text-xs font-semibold ${statusBadgeClass(ticket.status)}`}
                                    >
                                      {label(ticket.status)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="px-5 py-3 text-sm text-parcelis-gray">
                                    {ticket.category?.label ?? "—"}
                                  </TableCell>
                                </TableRow>
                              ))
                            : null}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <Table className="min-w-[1050px] border-collapse text-left">
                  <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                    <TableRow className="border-0">
                      <TableHead className="w-72 px-5 py-3 font-semibold">Ticket</TableHead>
                      <TableHead className="w-52 px-5 py-3 font-semibold">Property</TableHead>
                      <TableHead className="w-36 px-5 py-3 font-semibold">Category</TableHead>
                      <TableHead className="w-36 px-5 py-3 font-semibold">Status</TableHead>
                      <TableHead className="w-32 px-5 py-3 font-semibold">Issue Date</TableHead>
                      <TableHead className="w-28 px-5 py-3 font-semibold">Priority</TableHead>
                      <TableHead className="w-20 px-5 py-3 text-right font-semibold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTickets.map((ticket) => (
                      <TableRow
                        className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60"
                        key={ticket.id}
                      >
                        <TableCell className="px-5 py-4">
                          <Link
                            className="flex items-center gap-3 font-semibold text-parcelis-charcoal hover:text-parcelis-green"
                            href={getMaintenanceLink(ticket.id)}
                          >
                            <span className="grid h-9 w-9 place-items-center rounded-md bg-parcelis-porcelain text-parcelis-green">
                              <Wrench className="h-4 w-4" />
                            </span>
                            <span>
                              {ticket.title}
                              <span className="mt-1 block text-xs font-medium text-parcelis-gray">
                                {formatTicketNumber(ticket.ticketNumber)}
                              </span>
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                          <p className="font-medium text-parcelis-charcoal">{ticket.property.name}</p>
                          <p className="mt-1">
                            {ticket.units.length > 0
                              ? ticket.units.map((item) => `Unit ${item.unit.name}`).join(" | ")
                              : "Property-wide"}
                          </p>
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                          {ticket.category?.label ?? "—"}
                        </TableCell>
                        <TableCell className="px-5 py-4">
                          <span
                            className={`rounded-md px-2 py-1 text-xs font-semibold ${statusBadgeClass(ticket.status)}`}
                          >
                            {label(ticket.status)}
                          </span>
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                          {formatDate(ticket.openedOn)}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm font-semibold">
                          {ticket.isUrgent ? "Urgent" : label(ticket.priority)}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                aria-label={`Actions for ${ticket.title}`}
                                className="grid h-8 w-8 place-items-center rounded-md border border-parcelis-border text-parcelis-gray"
                                type="button"
                              >
                                <EllipsisVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={getMaintenanceLink(ticket.id)}>
                                  <Eye className="h-4 w-4 text-parcelis-green" />
                                  View
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Pencil className="h-4 w-4 text-parcelis-green" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() =>
                                  setNotesTicket({
                                    id: ticket.id,
                                    propertyName: ticket.property.name,
                                    status: ticket.status,
                                    title: ticket.title,
                                    units: ticketUnits(ticket),
                                  })
                                }
                              >
                                <StickyNote className="h-4 w-4 text-parcelis-green" />
                                Notes
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {!isTerminalMaintenanceTicketStatus(ticket.status) ? (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setTicketAction({
                                      id: ticket.id,
                                      propertyName: ticket.property.name,
                                      status: "resolved",
                                      title: ticket.title,
                                      units: ticketUnits(ticket),
                                    })
                                  }
                                >
                                  <Check className="h-4 w-4 text-parcelis-green" />
                                  Resolve
                                </DropdownMenuItem>
                              ) : null}
                              {ticket.status === "resolved" ? (
                                <DropdownMenuItem onSelect={() => reopenTicket.mutate(ticket.id)}>
                                  <Wrench className="h-4 w-4 text-parcelis-green" />
                                  Reopen Ticket
                                </DropdownMenuItem>
                              ) : null}
                              {(isActiveMaintenanceTicketStatus(ticket.status) || ticket.status === "resolved") && (
                                <DropdownMenuSeparator />
                              )}
                              {!isTerminalMaintenanceTicketStatus(ticket.status) ? (
                                <DropdownMenuItem
                                  className="text-red-700"
                                  onSelect={() =>
                                    setTicketAction({
                                      id: ticket.id,
                                      propertyName: ticket.property.name,
                                      status: "canceled",
                                      title: ticket.title,
                                      units: ticketUnits(ticket),
                                    })
                                  }
                                >
                                  <CircleX className="h-4 w-4" />
                                  Cancel Ticket
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem onSelect={() => archiveTicket.mutate(ticket.id)}>
                                <Archive className="h-4 w-4 text-parcelis-green" />
                                Archive
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-700"
                                onSelect={() => deleteTicket.mutate(ticket.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card className="mt-6">
            <CardHeader className="border-b-0 p-0">
              <button
                aria-controls="maintenance-logging"
                aria-expanded={isLoggingOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                onClick={() => setIsLoggingOpen((open) => !open)}
                type="button"
              >
                <div>
                  <h2 className="font-semibold text-parcelis-charcoal">Logging</h2>
                  <p className="mt-1 text-sm text-parcelis-gray">Recent maintenance ticket activity.</p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 text-parcelis-gray transition-transform ${isLoggingOpen ? "rotate-180" : ""}`}
                />
              </button>
            </CardHeader>
            {isLoggingOpen ? (
              <CardContent className="border-t border-parcelis-border p-0" id="maintenance-logging">
                {activityEventsQuery.isLoading ? (
                  <LoadingState className="min-h-32" label="Loading activity…" />
                ) : activityEventsQuery.error ? (
                  <p className="p-5 text-sm font-medium text-red-700">Unable to load activity. Please try again.</p>
                ) : activityEvents.length ? (
                  <ul className="divide-y divide-parcelis-border">
                    {activityEvents.map((event) => {
                      return (
                        <li
                          className="flex flex-col gap-1 px-5 py-4 text-sm md:flex-row md:items-center md:justify-between"
                          key={event.id}
                        >
                          <div>
                            <p className="font-semibold text-parcelis-charcoal">
                              {label(event.action.replace("maintenance.", ""))}
                            </p>
                            <p className="mt-1 text-parcelis-gray">
                              {event.subjectLabel}
                              {event.previousStatus && event.nextStatus
                                ? ` · ${label(event.previousStatus)} → ${label(event.nextStatus)}`
                                : ""}
                            </p>
                            {event.subjectReference ? (
                              <p className="mt-1 text-xs font-semibold text-parcelis-green">{event.subjectReference}</p>
                            ) : null}
                          </div>
                          <time className="shrink-0 text-parcelis-gray">{formatDateTime(event.createdAt)}</time>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="m-5 flex flex-col items-center rounded-md border border-dashed border-parcelis-border px-4 py-8 text-center">
                    <WrenchOff className="h-10 w-10 text-parcelis-green" />
                    <p className="mt-3 text-sm font-semibold text-parcelis-charcoal">
                      No maintenance activity has been recorded yet.
                    </p>
                  </div>
                )}
              </CardContent>
            ) : null}
          </Card>
        </div>
      </section>
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setTicketAction(null);
            setTicketActionNote("");
          }
        }}
        open={Boolean(ticketAction)}
      >
        <DialogContent>
          {ticketAction ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-parcelis-charcoal">
                  {ticketAction.status === "canceled" ? "Cancel ticket" : "Resolve ticket"}
                </h2>
                <p className="mt-1 text-sm text-parcelis-gray">{ticketAction.title}</p>
              </div>
              {ticketAction.status === "resolved" && latestActionNoteQuery.isLoading ? (
                <p className="text-sm text-parcelis-gray">Checking recent notes…</p>
              ) : actionRequiresNote ? (
                <div>
                  <p className="mb-3 text-sm text-parcelis-gray">
                    {ticketAction.status === "canceled"
                      ? "A cancellation note is required before updating this ticket."
                      : "A note from the last 24 hours is required before resolving this ticket."}
                  </p>
                  <Textarea
                    onChange={(event) => setTicketActionNote(event.target.value)}
                    placeholder={
                      ticketAction.status === "canceled"
                        ? "Explain why this ticket is being canceled."
                        : "Describe the work completed or the resolution."
                    }
                    rows={4}
                    value={ticketActionNote}
                  />
                </div>
              ) : (
                <p className="text-sm text-parcelis-gray">A recent maintenance note is on file.</p>
              )}
              {changeTicketStatus.error ? (
                <p className="text-sm font-medium text-red-700">{changeTicketStatus.error.message}</p>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <Button onClick={() => setTicketAction(null)} type="button" variant="secondary">
                  Cancel
                </Button>
                <Button
                  className={
                    ticketAction.status === "canceled" ? "border-red-200 text-red-700 hover:bg-red-50" : undefined
                  }
                  disabled={
                    latestActionNoteQuery.isLoading ||
                    changeTicketStatus.isPending ||
                    (actionRequiresNote && !ticketActionNote.trim())
                  }
                  onClick={() =>
                    changeTicketStatus.mutate({
                      id: ticketAction.id,
                      noteBody: actionRequiresNote ? ticketActionNote.trim() : undefined,
                      status: ticketAction.status,
                    })
                  }
                  type="button"
                  variant={ticketAction.status === "canceled" ? "secondary" : "primary"}
                >
                  {ticketAction.status === "canceled" ? <CircleX className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  {ticketAction.status === "canceled" ? "Save Note & Cancel" : "Resolve Ticket"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
