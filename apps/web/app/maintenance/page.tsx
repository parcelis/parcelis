"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronRight,
  EllipsisVertical,
  Eye,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
} from "@parcelis/ui";
import { apiClient } from "../../components/api-client";
import { MaintenanceDrawer } from "../../components/maintenance-drawer";
import { Sidebar } from "../../components/sidebar";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

function label(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
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
  const [expandedPropertyIds, setExpandedPropertyIds] = React.useState<Set<number>>(new Set());
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const ticketsQuery = useQuery({
    queryKey: ["maintenance", "list"],
    queryFn: () => apiClient.maintenance.list.query(),
  });
  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof apiClient.maintenance.create.mutate>[0]) =>
      apiClient.maintenance.create.mutate(input),
    onSuccess: async () => {
      setDrawerOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "list"] });
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (id: number) => apiClient.maintenance.archive.mutate({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance", "list"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.maintenance.delete.mutate({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance", "list"] }),
  });
  const tickets = ticketsQuery.data ?? [];
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
  const activeTickets = tickets.filter((ticket) => ["new", "in_progress", "pending"].includes(ticket.status));
  const urgentTickets = tickets.filter((ticket) => ticket.isUrgent).length;
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
      next.has(propertyId) ? next.delete(propertyId) : next.add(propertyId);
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-parcelis-porcelain">
      <Sidebar active="maintenance" />
      <MaintenanceDrawer
        error={createMutation.error}
        isPending={createMutation.isPending}
        onOpenChange={setDrawerOpen}
        onSubmit={(input) => createMutation.mutate(input)}
        open={drawerOpen}
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
                        {["new", "in_progress", "pending", "resolved", "closed", "canceled"].map((status) => (
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
                <div className="min-h-48 p-5 text-sm text-parcelis-gray">Loading maintenance tickets…</div>
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
                                      href={`/maintenance/${ticket.id}`}
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
                                    <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-parcelis-charcoal">
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
                            href={`/maintenance/${ticket.id}`}
                          >
                            <span className="grid h-9 w-9 place-items-center rounded-md bg-parcelis-porcelain text-parcelis-green">
                              <Wrench className="h-4 w-4" />
                            </span>
                            {ticket.title}
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
                            className={`rounded-md px-2 py-1 text-xs font-semibold ${ticket.status === "new" ? "bg-parcelis-green/15 text-parcelis-charcoal" : "bg-parcelis-porcelain text-parcelis-gray"}`}
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
                                <Link href={`/maintenance/${ticket.id}`}>
                                  <Eye className="h-4 w-4 text-parcelis-green" />
                                  View
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Pencil className="h-4 w-4 text-parcelis-green" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => archiveMutation.mutate(ticket.id)}>
                                <Archive className="h-4 w-4 text-parcelis-green" />
                                Archive
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-700"
                                onSelect={() => deleteMutation.mutate(ticket.id)}
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
        </div>
      </section>
    </main>
  );
}
