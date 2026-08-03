"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Wrench } from "lucide-react";
import { Button, Card, CardContent, CardHeader, ParcelisLogo } from "@parcelis/ui";
import { apiClient } from "../../../components/api-client";
import { Sidebar } from "../../../components/sidebar";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;
const label = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
const formatDate = (value: Date | string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));

export default function MaintenanceTicketPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const queryClient = useQueryClient();
  const ticketQuery = useQuery({
    queryKey: ["maintenance", "byId", id],
    queryFn: () => apiClient.maintenance.byId.query({ id }),
    enabled: id > 0,
  });
  const acknowledgeMutation = useMutation({
    mutationFn: () => apiClient.maintenance.updateStatus.mutate({ id, status: "in_progress" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance", "byId", id] }),
  });
  const ticket = ticketQuery.data;
  const requester = ticket?.requestedByTenant ?? ticket?.requestedByLandlord;
  return (
    <main className="min-h-screen bg-parcelis-porcelain">
      <Sidebar active="maintenance" />
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/maintenance">
                <ArrowLeft className="h-4 w-4" />
                Maintenance
              </Link>
            </Button>
          </div>
          {ticket?.status === "new" ? (
            <Button
              className="min-w-40"
              disabled={acknowledgeMutation.isPending}
              onClick={() => acknowledgeMutation.mutate()}
            >
              <Check className="h-4 w-4" />
              Acknowledge
            </Button>
          ) : null}
        </header>
        <div className="parcelis-page-shell">
          {ticketQuery.isLoading ? (
            <p className="text-sm text-parcelis-gray">Loading maintenance ticket…</p>
          ) : !ticket ? (
            <p className="text-sm text-parcelis-gray">Maintenance ticket not found.</p>
          ) : (
            <>
              <section className="mb-6 rounded-lg bg-parcelis-charcoal p-6 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-4">
                    <span className="grid h-12 w-12 place-items-center rounded-md bg-white/10 text-parcelis-green">
                      <Wrench className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">
                        Maintenance Ticket
                      </p>
                      <h1 className="mt-3 text-3xl font-bold">{ticket.title}</h1>
                      <p className="mt-2 text-sm text-white/75">
                        {ticket.property.name} ·{" "}
                        {ticket.units.length
                          ? ticket.units.map((item) => `Unit ${item.unit.name}`).join(" | ")
                          : "Property-wide"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 text-sm font-semibold">
                    <span className="rounded-md bg-white/10 px-3 py-2">
                      {ticket.status === "in_progress" ? "Acknowledged · In Progress" : label(ticket.status)}
                    </span>
                    <span className="rounded-md bg-white/10 px-3 py-2">
                      Requested by {requester ? `${requester.firstName} ${requester.lastName}` : "Not set"}
                    </span>
                    <span className="rounded-md bg-white/10 px-3 py-2">Issue date {formatDate(ticket.openedOn)}</span>
                  </div>
                </div>
              </section>
              <Card>
                <CardHeader>
                  <h2 className="font-semibold text-parcelis-charcoal">Ticket details</h2>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-parcelis-gray">Category</p>
                      <p className="mt-1 font-semibold text-parcelis-charcoal">{ticket.category?.label ?? "Not set"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-parcelis-gray">Priority</p>
                      <p className="mt-1 font-semibold text-parcelis-charcoal">
                        {ticket.isUrgent ? "Urgent" : label(ticket.priority)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-parcelis-gray">Requested by</p>
                      <p className="mt-1 font-semibold text-parcelis-charcoal">
                        {requester ? `${requester.firstName} ${requester.lastName}` : "Not set"}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-parcelis-border pt-5">
                    <p className="text-xs font-semibold uppercase text-parcelis-gray">Description</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-parcelis-charcoal">
                      {ticket.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
