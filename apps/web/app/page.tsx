"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, CalendarClock, CircleDollarSign, ClipboardCheck, Loader2, Plus, Search, Wrench,} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, ParcelisLogo } from "@parcelis/ui";
import type { CreatePropertyInput } from "@parcelis/schemas";
import { PropertyDrawer, initialPropertyFormState, type PropertyFormState } from "../components/property-drawer";
import { apiClient, queryKeys } from "../components/api-client";
import { useShortcut } from "../components/shortcut-provider";
import { Sidebar } from "../components/sidebar";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

const tasks = [
  { label: "Renew lease for Unit 4B", due: "Today", icon: ClipboardCheck },
  { label: "Review HVAC quote", due: "Tomorrow", icon: Wrench },
  { label: "Send owner statement", due: "Fri", icon: CircleDollarSign },
];

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function Page() {
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
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<PropertyFormState>(initialPropertyFormState);
  useShortcut("Mod+Shift+P", () => setIsFormOpen(true));

  const properties = propertiesQuery.data ?? [];
  const totalUnits = properties.reduce((sum, property) => sum + property.unitCount, 0);
  const occupiedUnits = properties.reduce((sum, property) => sum + property.occupiedUnits, 0);
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 1000) / 10 : 0;
  const leasingCount = properties.filter((property) => property.status === "leasing").length;

  return (
    <main className="min-h-screen">
      <Sidebar active="portfolio" />
      <PropertyDrawer
        error={createProperty.error}
        form={form}
        isPending={createProperty.isPending}
        onFormChange={setForm}
        onOpenChange={setIsFormOpen}
        onSubmit={(input) => createProperty.mutate(input)}
        open={isFormOpen}
      />

      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="lg:hidden">
            <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
          </div>
          <div className="hidden min-w-80 items-center gap-2 rounded-md border border-parcelis-border bg-white px-3 py-2 text-sm text-parcelis-gray md:flex">
            <Search className="h-4 w-4" />
            Search properties, tenants, leases
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="sm">
              Invite
            </Button>
            <Button size="sm" onClick={() => setIsFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Property
            </Button>
          </div>
        </header>

        <div className="parcelis-page-shell">
          <section className="mb-6 grid gap-5 lg:grid-cols-[1.5fr_0.8fr]">
            <div className="rounded-lg bg-parcelis-charcoal p-6 text-white">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Parcelis command center</p>
              <h1 className="mt-5 max-w-3xl text-3xl font-bold tracking-normal md:text-5xl">
                Boutique operations, clean books, happier residents.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/75">
                Unify leasing, maintenance, rent collection, and owner reporting in a calm workspace built for modern property teams.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button onClick={() => setIsFormOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add property
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/properties">View properties</Link>
                </Button>
              </div>
            </div>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-parcelis-charcoal">July Rent Roll</h2>
                  <CalendarClock className="h-5 w-5 text-parcelis-green" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-parcelis-charcoal">$184,220</div>
                <p className="mt-2 text-sm text-parcelis-gray">Collected across {occupiedUnits} occupied units</p>
                <div className="mt-5 h-3 rounded-full bg-parcelis-porcelain">
                  <div className="h-3 rounded-full bg-parcelis-green" style={{ width: `${Math.min(occupancyRate, 100)}%` }} />
                </div>
                <p className="mt-3 text-sm font-medium text-parcelis-charcoal">{occupancyRate}% portfolio occupancy</p>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-5 md:grid-cols-3">
            {[
              ["Properties", String(properties.length), `${leasingCount} actively leasing`],
              ["Occupancy", `${occupancyRate}%`, `${occupiedUnits} of ${totalUnits} units occupied`],
              ["Open Work Orders", "18", "4 need owner approval"],
            ].map(([label, value, detail]) => (
              <Card key={label}>
                <CardContent>
                  <p className="text-sm font-medium text-parcelis-gray">{label}</p>
                  <p className="mt-2 text-3xl font-bold text-parcelis-charcoal">{value}</p>
                  <p className="mt-1 text-sm text-parcelis-gray">{detail}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-parcelis-charcoal">Portfolio Snapshot</h2>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {propertiesQuery.isLoading ? (
                  <div className="flex min-h-48 items-center justify-center gap-2 text-sm font-medium text-parcelis-gray">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading portfolio
                  </div>
                ) : propertiesQuery.error ? (
                  <div className="min-h-48 p-5 text-sm font-medium text-red-700">{propertiesQuery.error.message}</div>
                ) : properties.length === 0 ? (
                  <div className="min-h-48 p-5 text-sm text-parcelis-gray">No properties yet. Add your first property to start the portfolio.</div>
                ) : (
                  <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                    <thead className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Property</th>
                        <th className="px-5 py-3 font-semibold">Units</th>
                        <th className="px-5 py-3 font-semibold">Occupancy</th>
                        <th className="px-5 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {properties.map((property) => (
                        <tr className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60" key={property.id}>
                          <td className="px-5 py-4">
                            <Link className="flex items-center gap-3" href={`/properties/${property.id}`}>
                              <div className="grid h-9 w-9 place-items-center rounded-md bg-parcelis-porcelain text-parcelis-charcoal">
                                <Building2 className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="font-semibold text-parcelis-charcoal">{property.name}</div>
                                <div className="text-parcelis-gray">
                                  {property.city}, {property.region}
                                </div>
                              </div>
                            </Link>
                          </td>
                          <td className="px-5 py-4">{property.unitCount}</td>
                          <td className="px-5 py-4">
                            {property.unitCount > 0 ? Math.round((property.occupiedUnits / property.unitCount) * 100) : 0}%
                          </td>
                          <td className="px-5 py-4">
                            <span className="rounded-md bg-parcelis-porcelain px-2 py-1 text-xs font-semibold text-parcelis-charcoal">
                              {formatStatus(property.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="font-semibold text-parcelis-charcoal">Priority Queue</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                {tasks.map((task) => {
                  const Icon = task.icon;
                  return (
                    <div className="flex items-center gap-3 rounded-md border border-parcelis-border p-3" key={task.label}>
                      <div className="grid h-9 w-9 place-items-center rounded-md bg-parcelis-porcelain text-parcelis-green">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-parcelis-charcoal">{task.label}</p>
                        <p className="text-xs text-parcelis-gray">Due {task.due}</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </section>
        </div>
      </section>
    </main>
  );
}
