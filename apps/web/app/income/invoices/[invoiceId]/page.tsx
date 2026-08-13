"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileText,
  Trash2,
  UserRound,
} from "lucide-react";
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
} from "@parcelis/ui";
import { apiClient } from "../../../../components/api-client";
import { LoadingState } from "../../../../components/loading-state";
import { InvoiceActions } from "../../../../components/invoice-actions";
import { Sidebar } from "../../../../components/sidebar";
import { formatDate } from "../../../../lib/date";
import { getInvoiceLink, getPropertyLink } from "../../../../lib/entity-links";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function invoiceStatusClass(status: string) {
  if (status === "paid") return "bg-emerald-100 text-emerald-800";
  if (status === "overdue") return "bg-red-100 text-red-700";
  if (status === "void") return "bg-parcelis-porcelain text-parcelis-gray";
  return "bg-parcelis-green/20 text-parcelis-charcoal";
}

function getInvoiceStamp(invoice: { amountCents: number; balanceCents: number; status: string }) {
  if (invoice.status === "void") return { label: "Canceled", className: "border-slate-400 text-slate-400" };
  if (invoice.status === "paid" || invoice.balanceCents === 0) {
    return { label: "Paid", className: "border-emerald-500 text-emerald-500" };
  }
  if (invoice.balanceCents < invoice.amountCents) {
    return { label: "Partially Paid", className: "border-amber-500 text-amber-500" };
  }
  if (invoice.status === "overdue") return { label: "Overdue", className: "border-red-600 text-red-600" };
  return null;
}

function formatPaymentMethod(method: string) {
  return method
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function formatActivityAction(action: string) {
  const labels: Record<string, string> = {
    "invoice.created": "Invoice created",
    "invoice.updated": "Invoice updated",
    "invoice.payment_recorded": "Payment recorded",
    "invoice.payment_deleted": "Payment deleted",
  };
  return labels[action] ?? action;
}

type InvoiceActivityEvent = {
  id: number;
  action: string;
  subjectReference: string | null;
  actorLabel: string | null;
  metadata: unknown;
  createdAt: Date | string;
};

function getPaymentActivityMessage(event: InvoiceActivityEvent) {
  if (event.action !== "invoice.payment_recorded" || !event.metadata || typeof event.metadata !== "object") return null;
  const metadata = event.metadata as { amountCents?: number; paidOn?: string; paymentMethod?: string };
  if (typeof metadata.amountCents !== "number" || !metadata.paidOn || !metadata.paymentMethod) return null;
  return `Payment of ${formatCurrency(metadata.amountCents)} received on ${formatDate(metadata.paidOn)} through ${formatPaymentMethod(metadata.paymentMethod)}${event.actorLabel ? `. Recorded by ${event.actorLabel}` : ""}.`;
}

function DeletePaymentButton({ paymentId }: { paymentId: number }) {
  const [open, setOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const queryClient = useQueryClient();
  useEffect(() => setIsMounted(true), []);
  const deletePayment = useMutation({
    mutationFn: () => apiClient.invoices.deletePayment.mutate({ id: paymentId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["properties", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["activityEvents"] });
      setOpen(false);
    },
  });
  return (
    <>
      <Button
        aria-label="Delete payment"
        className="h-8 w-8 px-0"
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4 text-red-600" />
      </Button>
      {isMounted
        ? createPortal(
            <AlertDialog onOpenChange={setOpen} open={open}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete payment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. The payment amount will be restored to the invoice balance.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deletePayment.error ? <p className="text-sm text-red-700">{deletePayment.error.message}</p> : null}
                <AlertDialogFooter>
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={deletePayment.isPending}
                    type="button"
                    variant="destructive"
                    onClick={() => deletePayment.mutate()}
                  >
                    Delete payment
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>,
            document.body,
          )
        : null}
    </>
  );
}

export default function InvoiceDetailPage() {
  const params = useParams<{ invoiceId: string }>();
  const invoiceId = Number(params.invoiceId);
  const invoiceQuery = useQuery({
    queryKey: ["invoices", "byId", invoiceId],
    queryFn: () => apiClient.invoices.byId.query({ id: invoiceId }),
  });
  const invoicesQuery = useQuery({
    queryKey: ["invoices", "list"],
    queryFn: () => apiClient.invoices.list.query({}),
  });
  const invoice = invoiceQuery.data;
  const invoiceRows = invoicesQuery.data ?? [];
  const [collapsedPropertyIds, setCollapsedPropertyIds] = useState<Set<number>>(new Set());
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const activityQuery = useQuery({
    queryKey: ["activityEvents", "list", { subjectType: "invoice", subjectId: invoiceId, limit: 50 }],
    queryFn: () => apiClient.activityEvents.list.query({ subjectType: "invoice", subjectId: invoiceId, limit: 50 }),
    enabled: isHistoryOpen && invoiceId > 0,
  });
  const activityEvents = (activityQuery.data ?? []) as InvoiceActivityEvent[];

  function toggleProperty(propertyId: number) {
    setCollapsedPropertyIds((current) => {
      const next = new Set(current);
      if (next.has(propertyId)) next.delete(propertyId);
      else next.add(propertyId);
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-parcelis-porcelain dark:bg-parcelis-slate">
      <Sidebar active="income" />
      <section className="lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="flex min-h-16 items-center justify-between gap-4 border-b border-parcelis-border bg-white px-4 dark:bg-parcelis-slate md:px-8">
          <Button asChild className="min-w-40" variant="secondary">
            <Link href="/income">
              <ArrowLeft className="h-4 w-4" />
              Income
            </Link>
          </Button>
          {invoice ? <InvoiceActions invoice={invoice} /> : null}
        </header>
        <div className="parcelis-page-shell max-w-none">
          {invoiceQuery.isLoading ? (
            <LoadingState label="Loading invoice…" />
          ) : invoiceQuery.error ? (
            <Card>
              <CardContent>
                Unable to load this invoice. Please try again.
                <Button
                  className="ml-3"
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => invoiceQuery.refetch()}
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : !invoice ? (
            <Card>
              <CardContent>Invoice not found.</CardContent>
            </Card>
          ) : (
            (() => {
              const paidCents = Math.max(invoice.amountCents - invoice.balanceCents, 0);
              const payments = invoice.payments ?? [];
              const invoiceLabel = `INV-${String(invoice.invoiceNumber).padStart(7, "0")}`;
              const stamp = getInvoiceStamp(invoice);
              const items = invoice.items.length
                ? invoice.items
                : [
                    {
                      id: 0,
                      item: "Rent",
                      description: `Rent for ${formatDate(invoice.periodStartsOn)}`,
                      quantity: 1,
                      rateCents: invoice.amountCents,
                      amountCents: invoice.amountCents,
                    },
                  ];
              return (
                <div className="flex flex-col gap-5 lg:flex-row">
                  <aside className="w-full shrink-0 lg:w-60">
                    <Card className="lg:sticky lg:top-6 dark:bg-parcelis-slate">
                      <CardContent className="p-3">
                        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-parcelis-gray">
                          Properties
                        </p>
                        <div className="space-y-1">
                          {Array.from(
                            invoiceRows.reduce((groups, item) => {
                              const group = groups.get(item.property.id) ?? {
                                name: item.property.name,
                                invoices: [] as typeof invoiceRows,
                              };
                              group.invoices.push(item);
                              groups.set(item.property.id, group);
                              return groups;
                            }, new Map<number, { name: string; invoices: typeof invoiceRows }>()),
                          ).map(([propertyId, property]) => (
                            <div key={propertyId}>
                              <div className="flex items-center gap-1 rounded-md hover:bg-parcelis-porcelain">
                                <button
                                  aria-label={`Toggle ${property.name} invoices`}
                                  className="grid h-8 w-8 place-items-center text-parcelis-gray"
                                  onClick={() => toggleProperty(propertyId)}
                                  type="button"
                                >
                                  <ChevronRight
                                    className={`h-4 w-4 transition-transform ${collapsedPropertyIds.has(propertyId) ? "" : "rotate-90"}`}
                                  />
                                </button>
                                <Link
                                  className="min-w-0 flex-1 py-2 pr-2 text-sm font-semibold text-parcelis-charcoal"
                                  href={getPropertyLink(propertyId)}
                                >
                                  {property.name}
                                </Link>
                              </div>
                              {collapsedPropertyIds.has(propertyId) ? null : (
                                <div className="ml-3 border-l border-parcelis-border pl-2">
                                  {Array.from(
                                    property.invoices.reduce((groups, item) => {
                                      const rows = groups.get(item.lease.unitLabel) ?? [];
                                      rows.push(item);
                                      groups.set(item.lease.unitLabel, rows);
                                      return groups;
                                    }, new Map<string, typeof property.invoices>()),
                                  ).map(([unitLabel, invoices]) => (
                                    <div className="py-1" key={unitLabel}>
                                      <p className="px-2 py-1 text-xs font-semibold text-parcelis-gray">
                                        Unit {unitLabel}
                                      </p>
                                      {invoices.map((item) => (
                                        <Link
                                          className={`block rounded-md px-2 py-1.5 text-xs font-medium ${item.id === invoice.id ? "bg-parcelis-green/20 text-parcelis-charcoal" : "text-parcelis-gray hover:bg-parcelis-porcelain"}`}
                                          href={getInvoiceLink(item.id)}
                                          key={item.id}
                                        >
                                          INV-{String(item.invoiceNumber).padStart(7, "0")}
                                        </Link>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </aside>
                  <div className="min-w-0 flex-1 space-y-5">
                    <Card className="relative overflow-hidden dark:bg-parcelis-slate dark:text-parcelis-porcelain">
                      <section className="grid gap-6 bg-parcelis-charcoal p-6 text-white md:grid-cols-[1.2fr_1fr] md:p-8">
                        <div>
                          <div className="flex items-center gap-3 text-parcelis-green">
                            <FileText className="h-5 w-5" />
                            <p className="text-sm font-semibold uppercase tracking-[0.18em]">Invoice</p>
                          </div>
                          <h1 className="mt-4 text-3xl font-bold md:text-4xl">{invoiceLabel}</h1>
                          <p className="mt-2 text-sm text-white/70">
                            Unit {invoice.lease.unitLabel} · {formatDate(invoice.periodStartsOn)} —{" "}
                            {formatDate(invoice.periodEndsOn)}
                          </p>
                          {stamp ? (
                            <div className="mt-5 flex justify-center md:justify-start">
                              <div
                                className={`pointer-events-none select-none rotate-[-12deg] rounded-lg border-4 px-5 py-1.5 text-3xl font-black uppercase tracking-widest opacity-80 ${stamp.className}`}
                              >
                                {stamp.label}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-md bg-white/10 p-3">
                            <p className="text-white/65">Invoice generated on</p>
                            <p className="mt-1 font-semibold">{formatDate(invoice.createdAt)}</p>
                          </div>
                          <div className="rounded-md bg-white/10 p-3">
                            <p className="text-white/65">Due</p>
                            <p className="mt-1 font-semibold">{formatDate(invoice.dueOn)}</p>
                          </div>
                          <div className="rounded-md bg-white/10 p-3">
                            <p className="text-white/65">Balance</p>
                            <p className="mt-1 text-lg font-bold">{formatCurrency(invoice.balanceCents)}</p>
                          </div>
                        </div>
                      </section>
                      <CardContent className="p-0">
                        <section className="grid gap-5 border-b border-parcelis-border p-6 md:grid-cols-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-parcelis-gray">
                              Billed to
                            </p>
                            <div className="mt-3 flex items-center gap-3">
                              <UserRound className="h-5 w-5 text-parcelis-green" />
                              <Link
                                className="font-semibold text-parcelis-charcoal hover:text-parcelis-green"
                                href={`/tenants/${invoice.tenant.id}`}
                              >
                                {invoice.tenant.firstName} {invoice.tenant.lastName}
                              </Link>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-parcelis-gray">Property</p>
                            <div className="mt-3 flex items-center gap-3">
                              <Building2 className="h-5 w-5 text-parcelis-green" />
                              <Link
                                className="font-semibold text-parcelis-charcoal hover:text-parcelis-green"
                                href={getPropertyLink(invoice.property.id)}
                              >
                                {invoice.property.name}
                              </Link>
                            </div>
                            <p className="mt-2 pl-8 text-sm text-parcelis-gray">Unit {invoice.lease.unitLabel}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-parcelis-gray">
                              Invoice status
                            </p>
                            <span
                              className={`mt-3 inline-flex rounded-md px-2.5 py-1 text-sm font-semibold ${invoiceStatusClass(invoice.status)}`}
                            >
                              {invoice.status}
                            </span>
                          </div>
                        </section>
                        <section className="p-6">
                          <div className="mb-4 flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-parcelis-green" />
                            <h2 className="font-semibold text-parcelis-charcoal">Charges</h2>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] text-sm">
                              <thead className="border-b border-parcelis-border text-left text-xs uppercase text-parcelis-gray">
                                <tr>
                                  <th className="pb-3 font-semibold">Item</th>
                                  <th className="pb-3 font-semibold">Description</th>
                                  <th className="pb-3 text-right font-semibold">Quantity</th>
                                  <th className="pb-3 text-right font-semibold">Rate</th>
                                  <th className="pb-3 text-right font-semibold">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item) => (
                                  <tr className="border-b border-parcelis-border" key={item.id}>
                                    <td className="py-4 font-semibold text-parcelis-charcoal">{item.item}</td>
                                    <td className="py-4 text-parcelis-gray">{item.description ?? "—"}</td>
                                    <td className="py-4 text-right text-parcelis-gray">{item.quantity}</td>
                                    <td className="py-4 text-right text-parcelis-gray">
                                      {formatCurrency(item.rateCents)}
                                    </td>
                                    <td className="py-4 text-right font-semibold text-parcelis-charcoal">
                                      {formatCurrency(item.amountCents)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </section>
                        <section className="border-t border-parcelis-border bg-parcelis-porcelain/60 p-6 dark:bg-white/5">
                          <div>
                            <div className="flex items-center gap-3">
                              <h2 className="font-semibold text-parcelis-charcoal">Payment activity</h2>
                              <span className="rounded-full bg-parcelis-green/20 px-2 py-0.5 text-xs font-semibold text-parcelis-charcoal">
                                Payments received {payments.length}
                              </span>
                            </div>
                            {payments.length ? (
                              <div className="mt-3 overflow-x-auto">
                                <table className="w-full min-w-[520px] text-sm">
                                  <thead className="text-left text-xs uppercase text-parcelis-gray">
                                    <tr>
                                      <th className="pb-2 font-semibold">Payer</th>
                                      <th className="pb-2 font-semibold">Paid on</th>
                                      <th className="pb-2 font-semibold">Method</th>
                                      <th className="pb-2 text-right font-semibold">Amount</th>
                                      <th className="w-10 pb-2" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {payments.map((payment) => (
                                      <tr className="border-t border-parcelis-border" key={payment.id}>
                                        <td className="py-3 font-medium text-parcelis-charcoal">
                                          {payment.tenant.firstName} {payment.tenant.lastName}
                                        </td>
                                        <td className="py-3 text-parcelis-gray">{formatDate(payment.paidOn)}</td>
                                        <td className="py-3 text-parcelis-gray">
                                          {formatPaymentMethod(payment.paymentMethod)}
                                        </td>
                                        <td className="py-3 text-right font-semibold text-parcelis-charcoal">
                                          {formatCurrency(payment.amountCents)}
                                        </td>
                                        <td className="py-2 pl-2 text-right">
                                          <DeletePaymentButton paymentId={payment.id} />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="mt-2 text-sm text-parcelis-gray">
                                No payments have been recorded for this invoice.
                              </p>
                            )}
                          </div>
                          <dl className="ml-auto mt-6 w-full max-w-xs space-y-2 rounded-md border border-parcelis-border bg-white p-4 text-sm dark:bg-parcelis-slate">
                            <div className="flex justify-between">
                              <dt className="text-parcelis-gray">Invoice total</dt>
                              <dd className="font-semibold text-parcelis-charcoal dark:text-white">
                                {formatCurrency(invoice.amountCents)}
                              </dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-parcelis-gray">Paid</dt>
                              <dd className="font-semibold text-parcelis-charcoal dark:text-white">
                                {formatCurrency(paidCents)}
                              </dd>
                            </div>
                            <div className="flex justify-between border-t border-parcelis-border pt-3 text-base">
                              <dt className="font-semibold text-parcelis-charcoal dark:text-white">
                                Remaining balance
                              </dt>
                              <dd className="font-bold text-parcelis-charcoal dark:text-white">
                                {formatCurrency(invoice.balanceCents)}
                              </dd>
                            </div>
                          </dl>
                        </section>
                      </CardContent>
                    </Card>
                    <Card>
                      <button
                        aria-expanded={isHistoryOpen}
                        className="flex w-full items-center justify-between gap-4 p-6 text-left"
                        onClick={() => setIsHistoryOpen((open) => !open)}
                        type="button"
                      >
                        <div>
                          <h2 className="font-semibold text-parcelis-charcoal dark:text-white">Invoice history</h2>
                          <p className="mt-1 text-sm text-parcelis-gray">
                            Changes and payment activity for this invoice.
                          </p>
                        </div>
                        <ChevronDown
                          className={`h-5 w-5 text-parcelis-gray transition-transform ${isHistoryOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {isHistoryOpen ? (
                        <CardContent className="border-t border-parcelis-border p-0">
                          {activityQuery.isLoading ? (
                            <LoadingState className="min-h-28" label="Loading invoice history…" />
                          ) : activityQuery.error ? (
                            <p className="p-6 text-sm font-medium text-red-700">
                              Unable to load invoice history. Please try again.
                            </p>
                          ) : activityEvents.length ? (
                            <ul className="divide-y divide-parcelis-border">
                              {activityEvents.map((event) => (
                                <li
                                  className="flex flex-col gap-1 p-6 text-sm md:flex-row md:items-center md:justify-between"
                                  key={event.id}
                                >
                                  <div>
                                    <p className="font-semibold text-parcelis-charcoal dark:text-white">
                                      {event.action === "invoice.payment_recorded"
                                        ? "Payment received"
                                        : formatActivityAction(event.action)}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold text-parcelis-green">
                                      {event.subjectReference}
                                    </p>
                                    {getPaymentActivityMessage(event) ? (
                                      <p className="mt-1 text-parcelis-gray">{getPaymentActivityMessage(event)}</p>
                                    ) : null}
                                  </div>
                                  <time className="shrink-0 text-parcelis-gray">{formatDateTime(event.createdAt)}</time>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="p-6 text-sm text-parcelis-gray">No invoice history has been recorded yet.</p>
                          )}
                        </CardContent>
                      ) : null}
                    </Card>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </section>
    </main>
  );
}
