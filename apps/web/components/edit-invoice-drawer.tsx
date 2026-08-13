"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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
} from "@parcelis/ui";
import { apiClient } from "./api-client";
import type { InvoiceActionInvoice } from "./invoice-actions";
import { formatDate, toUtcDateInput } from "../lib/date";

type Line = { item: string; description: string; quantity: string; rate: string };

function createLine(): Line {
  return { item: "", description: "", quantity: "1", rate: "" };
}

function toCents(value: string) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? Math.max(Math.round(amount * 100), 0) : 0;
}
export function EditInvoiceDrawer({
  invoice,
  onOpenChange,
  open,
}: {
  invoice: InvoiceActionInvoice;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const queryClient = useQueryClient();
  const [dueOn, setDueOn] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [snapshot, setSnapshot] = React.useState("");
  const [discardOpen, setDiscardOpen] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    const nextDueOn = toUtcDateInput(invoice.dueOn);
    const nextLines = invoice.items.length
      ? invoice.items.map((item) => ({
          item: item.item,
          description: item.description ?? "",
          quantity: String(item.quantity),
          rate: (item.rateCents / 100).toFixed(2),
        }))
      : [createLine()];
    setDueOn(nextDueOn);
    setLines(nextLines);
    setSnapshot(JSON.stringify({ dueOn: nextDueOn, lines: nextLines }));
  }, [invoice, open]);
  const totalPaid = invoice.amountCents - invoice.balanceCents;
  const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * toCents(line.rate), 0);
  const dirty = snapshot !== "" && snapshot !== JSON.stringify({ dueOn, lines });
  const update = useMutation({
    mutationFn: (input: Parameters<typeof apiClient.invoices.update.mutate>[0]) =>
      apiClient.invoices.update.mutate(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["properties", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["activityEvents"] });
      onOpenChange(false);
    },
  });
  const requestClose = () => {
    if (dirty) setDiscardOpen(true);
    else onOpenChange(false);
  };
  const updateLine = (index: number, update: Partial<Line>) =>
    setLines((current) => current.map((line, itemIndex) => (itemIndex === index ? { ...line, ...update } : line)));
  return (
    <Drawer onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : requestClose())} open={open}>
      <DrawerContent size="lg">
        <AlertDialog onOpenChange={setDiscardOpen} open={discardOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Your changes will not be saved.</AlertDialogTitle>
              <AlertDialogDescription>Discard your invoice edits and close this form?</AlertDialogDescription>
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
          <DrawerTitle>Edit invoice</DrawerTitle>
        </DrawerHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate({
              id: invoice.id,
              dueOn: new Date(`${dueOn}T00:00:00.000Z`),
              items: lines.map((line) => ({
                item: line.item,
                description: line.description || undefined,
                quantity: Number(line.quantity),
                rateCents: toCents(line.rate),
              })),
            });
          }}
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            <section>
              <h3 className="font-semibold text-parcelis-charcoal dark:text-white">Property details</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Label className="gap-2">
                  Property
                  <Input readOnly value={invoice.property.name} />
                </Label>
                <Label className="gap-2">
                  Unit
                  <Input readOnly value={`Unit ${invoice.lease.unitLabel}`} />
                </Label>
                <Label className="gap-2">
                  Term / lease
                  <Input
                    readOnly
                    value={`${formatDate(invoice.lease.startsOn)} – ${invoice.lease.endsOn ? formatDate(invoice.lease.endsOn) : "No end date"}`}
                  />
                </Label>
                <Label className="gap-2">
                  Tenant
                  <Input readOnly value={`${invoice.tenant.firstName} ${invoice.tenant.lastName}`} />
                </Label>
              </div>
            </section>
            <Label className="max-w-xs gap-2">
              Due on *<Input required type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
            </Label>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-parcelis-charcoal dark:text-white">Charge lines</h3>
                <Button
                  disabled={lines.length >= 50}
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => setLines((current) => [...current, createLine()])}
                >
                  <Plus className="h-4 w-4" /> Add line item
                </Button>
              </div>
              <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_5rem_7rem_2rem] gap-3 px-1 text-xs font-semibold uppercase tracking-wide text-parcelis-gray md:grid">
                <span>Item</span>
                <span>Description</span>
                <span>Qty.</span>
                <span>Rate</span>
                <span className="sr-only">Remove</span>
              </div>
              {lines.map((line, index) => (
                <div
                  className="grid gap-3 rounded-md border border-parcelis-border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_5rem_7rem_2rem] md:items-center"
                  key={index}
                >
                  <Label className="gap-2 md:contents">
                    <span className="md:sr-only">Item</span>
                    <Input
                      aria-label="Item"
                      required
                      value={line.item}
                      onChange={(event) => updateLine(index, { item: event.target.value })}
                    />
                  </Label>
                  <Label className="gap-2 md:contents">
                    <span className="md:sr-only">Description</span>
                    <Input
                      aria-label="Description"
                      value={line.description}
                      onChange={(event) => updateLine(index, { description: event.target.value })}
                    />
                  </Label>
                  <Label className="gap-2 md:contents">
                    <span className="md:sr-only">Quantity</span>
                    <Input
                      aria-label="Quantity"
                      min="1"
                      required
                      type="number"
                      value={line.quantity}
                      onChange={(event) => updateLine(index, { quantity: event.target.value })}
                    />
                  </Label>
                  <Label className="gap-2 md:contents">
                    <span className="md:sr-only">Rate</span>
                    <Input
                      aria-label="Rate"
                      min="0"
                      required
                      step="0.01"
                      type="number"
                      value={line.rate}
                      onChange={(event) => updateLine(index, { rate: event.target.value })}
                    />
                  </Label>
                  <div className="flex justify-end">
                    {lines.length > 1 ? (
                      <Button
                        aria-label="Remove line item"
                        className="h-8 w-8 px-0"
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </section>
            <div className="ml-auto grid w-full max-w-xs gap-2 border-t border-parcelis-border pt-4 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>${(subtotal / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total paid</span>
                <span>${(totalPaid / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Balance due</span>
                <span>${(Math.max(subtotal - totalPaid, 0) / 100).toFixed(2)}</span>
              </div>
            </div>
            {update.error ? <p className="text-sm text-red-700">{update.error.message}</p> : null}
          </div>
          <DrawerFooter className="flex items-center justify-between">
            <Button type="button" variant="secondary" onClick={requestClose}>
              Cancel
            </Button>
            <Button
              className="min-w-40"
              disabled={update.isPending || subtotal <= 0 || subtotal < totalPaid}
              type="submit"
            >
              Save changes
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
