"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
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
import { Plus, Trash2 } from "lucide-react";
import { apiClient } from "./api-client";
import type { InvoiceActionInvoice } from "./invoice-actions";

type PaymentEntry = { amount: string; method: string; paidOn: string; tenantId: string };
const methods = [
  ["cash", "Cash"],
  ["money_order", "Money order"],
  ["check", "Check"],
  ["cashiers_check", "Cashier’s check"],
  ["paypal", "PayPal"],
  ["venmo", "Venmo"],
  ["zelle", "Zelle"],
  ["other", "Other"],
] as const;
function toCents(value: string) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? Math.max(Math.round(amount * 100), 0) : 0;
}
function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(value),
  );
}
function getLocalDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function RecordPaymentDrawer({
  invoice,
  onOpenChange,
  open,
}: {
  invoice: InvoiceActionInvoice;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const queryClient = useQueryClient();
  const [entries, setEntries] = React.useState<PaymentEntry[]>([]);
  const [snapshot, setSnapshot] = React.useState("");
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const subject = invoice.items[0]?.description || invoice.items[0]?.item || "Invoice payment";
  const createEntry = React.useCallback(
    (): PaymentEntry => ({
      amount: "",
      method: "",
      paidOn: getLocalDate(),
      tenantId: String(invoice.tenant.id),
    }),
    [invoice.tenant.id],
  );
  React.useEffect(() => {
    if (!open) return;
    const next = [createEntry()];
    setEntries(next);
    setSnapshot(JSON.stringify(next));
  }, [createEntry, open]);
  const dirty = snapshot !== "" && snapshot !== JSON.stringify(entries);
  const paymentTotalCents = entries.reduce((total, entry) => total + toCents(entry.amount), 0);
  const paymentTotalExceedsBalance = paymentTotalCents > invoice.balanceCents;
  const payment = useMutation({
    mutationFn: () =>
      apiClient.invoices.recordPayments.mutate({
        id: invoice.id,
        payments: entries.map((entry) => ({
          amountCents: toCents(entry.amount),
          paidOn: new Date(`${entry.paidOn}T00:00:00.000Z`),
          paidByTenantId: Number(entry.tenantId),
          paymentMethod: entry.method as
            "cash" | "money_order" | "check" | "cashiers_check" | "paypal" | "venmo" | "zelle" | "other",
        })),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["properties", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["activityEvents"] });
      onOpenChange(false);
    },
  });
  const { reset: resetPayment } = payment;
  React.useEffect(() => {
    if (open) resetPayment();
  }, [open, resetPayment]);
  const updateEntry = (index: number, update: Partial<PaymentEntry>) =>
    setEntries((current) => current.map((entry, itemIndex) => (itemIndex === index ? { ...entry, ...update } : entry)));
  const requestClose = () => (dirty ? setDiscardOpen(true) : onOpenChange(false));
  return (
    <Drawer onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : requestClose())} open={open}>
      <DrawerContent size="md">
        <AlertDialog onOpenChange={setDiscardOpen} open={discardOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Your changes will not be saved.</AlertDialogTitle>
              <AlertDialogDescription>Discard this payment entry and close the form?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDiscardOpen(false)}>
                Keep Editing
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setDiscardOpen(false);
                  onOpenChange(false);
                }}
              >
                Discard
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <DrawerHeader className="flex items-center gap-3">
          <DrawerClose />
          <DrawerTitle>Record payment</DrawerTitle>
        </DrawerHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            payment.mutate();
          }}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            <section className="rounded-md bg-parcelis-charcoal p-4 text-white">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Invoice ID</p>
                  <p className="mt-1 font-semibold">INV-{String(invoice.invoiceNumber).padStart(7, "0")}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Subject</p>
                  <p className="mt-1 font-semibold">{subject}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Due</p>
                  <p className="mt-1 font-semibold">{formatDate(invoice.dueOn)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Balance</p>
                  <p className="mt-1 font-semibold">{formatCurrency(invoice.balanceCents)}</p>
                </div>
              </div>
            </section>
            <div className="flex items-center justify-between rounded-md border border-parcelis-border px-4 py-3 text-sm">
              <span className="text-parcelis-gray">Payment total</span>
              <span
                className={
                  paymentTotalExceedsBalance ? "font-semibold text-red-700" : "font-semibold text-parcelis-charcoal"
                }
              >
                {formatCurrency(paymentTotalCents)} of {formatCurrency(invoice.balanceCents)}
              </span>
            </div>
            {entries.map((entry, index) => (
              <section className="rounded-md border border-parcelis-border p-4" key={index}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold text-parcelis-charcoal">
                    {entries.length > 1 ? `Payment ${index + 1}` : "Payment details"}
                  </h3>
                  {entries.length > 1 ? (
                    <Button
                      aria-label="Remove payment"
                      className="h-8 w-8 px-0"
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => setEntries((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Label className="gap-2">
                    Tenant who paid *
                    <Select
                      required
                      value={entry.tenantId}
                      onChange={(event) => updateEntry(index, { tenantId: event.target.value })}
                    >
                      <option value={invoice.tenant.id}>
                        {invoice.tenant.firstName} {invoice.tenant.lastName}
                      </option>
                    </Select>
                  </Label>
                  <Label className="gap-2">
                    Payment method *
                    <Select
                      required
                      value={entry.method}
                      onChange={(event) => updateEntry(index, { method: event.target.value })}
                    >
                      <option value="">Select payment method</option>
                      {methods.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Label>
                  <Label className="gap-2">
                    Amount *
                    <Input
                      min="0.01"
                      required
                      step="0.01"
                      type="number"
                      value={entry.amount}
                      onChange={(event) => updateEntry(index, { amount: event.target.value })}
                    />
                  </Label>
                  <Label className="gap-2">
                    Paid on *
                    <Input
                      required
                      type="date"
                      value={entry.paidOn}
                      onChange={(event) => updateEntry(index, { paidOn: event.target.value })}
                    />
                  </Label>
                </div>
              </section>
            ))}
            <Button
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => setEntries((current) => [...current, createEntry()])}
            >
              <Plus className="h-4 w-4" /> Add additional payment
            </Button>
            {payment.error ? <p className="text-sm text-red-700">{payment.error.message}</p> : null}
          </div>
          <DrawerFooter className="flex items-center justify-between">
            <Button type="button" variant="secondary" onClick={requestClose}>
              Cancel
            </Button>
            <Button className="min-w-40" disabled={payment.isPending || paymentTotalExceedsBalance} type="submit">
              Record payment{entries.length > 1 ? "s" : ""}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
