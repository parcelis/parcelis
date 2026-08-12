"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
import { apiClient } from "./api-client";
import type { InvoiceActionInvoice } from "./invoice-actions";

function toCents(value: string) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? Math.max(Math.round(amount * 100), 0) : 0;
}
function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
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
  const [amount, setAmount] = React.useState("");
  const [paidByTenantId, setPaidByTenantId] = React.useState("");
  const [paidOn, setPaidOn] = React.useState(new Date().toISOString().slice(0, 10));
  const tenantsQuery = useQuery({ queryKey: ["tenants", "list"], queryFn: () => apiClient.tenants.list.query() });
  React.useEffect(() => {
    if (open) setPaidByTenantId(String(invoice.tenant.id));
  }, [invoice.tenant.id, open]);
  const payment = useMutation({
    mutationFn: (input: Parameters<typeof apiClient.invoices.recordPayment.mutate>[0]) =>
      apiClient.invoices.recordPayment.mutate(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["properties", "list"] });
      setAmount("");
      onOpenChange(false);
    },
  });
  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent size="md">
        <DrawerHeader className="flex items-center gap-3">
          <DrawerClose />
          <DrawerTitle>Record payment</DrawerTitle>
        </DrawerHeader>
        <form
          className="flex flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            payment.mutate({
              id: invoice.id,
              amountCents: toCents(amount),
              paidOn: new Date(`${paidOn}T12:00:00`),
              paidByTenantId: Number(paidByTenantId),
            });
          }}
        >
          <div className="flex-1 space-y-4 p-6">
            <section className="rounded-md bg-parcelis-charcoal p-4 text-white">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Invoice ID</p>
                  <p className="mt-1 font-semibold">INV-{String(invoice.invoiceNumber).padStart(7, "0")}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Subject</p>
                  <p className="mt-1 font-semibold">
                    {invoice.property.name} · Unit {invoice.lease.unitLabel}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Due</p>
                  <p className="mt-1 font-semibold">{formatDate(invoice.dueOn)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Paid</p>
                  <p className="mt-1 font-semibold">{formatCurrency(invoice.amountCents - invoice.balanceCents)}</p>
                </div>
              </div>
              <div className="mt-4 flex justify-between border-t border-white/15 pt-3">
                <span className="text-sm font-semibold text-white/70">Balance due</span>
                <span className="text-lg font-bold text-parcelis-green">{formatCurrency(invoice.balanceCents)}</span>
              </div>
            </section>
            <Label className="gap-2">
              Tenant who paid *
              <Select required value={paidByTenantId} onChange={(event) => setPaidByTenantId(event.target.value)}>
                <option value="">Select tenant</option>
                {(tenantsQuery.data ?? []).map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.firstName} {tenant.lastName}
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
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Label>
            <Label className="gap-2">
              Paid on *<Input required type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
            </Label>
            {payment.error ? <p className="text-sm text-red-700">{payment.error.message}</p> : null}
          </div>
          <DrawerFooter className="flex items-center justify-between">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="min-w-40" disabled={payment.isPending} type="submit">
              Record payment
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
