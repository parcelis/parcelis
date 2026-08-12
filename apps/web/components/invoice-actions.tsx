"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, Pencil, ReceiptText, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@parcelis/ui";
import { useRouter } from "next/navigation";
import { apiClient } from "./api-client";
import { EditInvoiceDrawer } from "./edit-invoice-drawer";
import { RecordPaymentDrawer } from "./record-payment-drawer";

export type InvoiceActionInvoice = {
  id: number;
  invoiceNumber: number;
  amountCents: number;
  balanceCents: number;
  dueOn: Date | string;
  items: Array<{ id: number; item: string; description: string | null; quantity: number; rateCents: number }>;
  property: { name: string };
  tenant: { id: number; firstName: string; lastName: string };
  lease: { unitLabel: string; startsOn: Date | string; endsOn: Date | string | null };
  payments: Array<{
    id: number;
    amountCents: number;
    paidOn: Date | string;
    paymentMethod: string;
    tenant: { id: number; firstName: string; lastName: string };
  }>;
};

export function InvoiceActions({ invoice }: { invoice: InvoiceActionInvoice }) {
  const router = useRouter();
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const hasPayments = (invoice.payments ?? []).length > 0;
  const deleteInvoice = useMutation({
    mutationFn: () => apiClient.invoices.delete.mutate({ id: invoice.id }),
    onSuccess: () => router.push("/income"),
  });

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <Button disabled size="sm" title="Coming soon" type="button" variant="secondary">
          <Download className="h-4 w-4" /> Download
        </Button>
        <Button disabled size="sm" title="Coming soon" type="button" variant="secondary">
          Send reminder
        </Button>
        <Button disabled size="sm" title="Coming soon" type="button" variant="secondary">
          Waive late fee
        </Button>
        <Button
          disabled={invoice.balanceCents === 0}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => setPaymentOpen(true)}
        >
          <ReceiptText className="h-4 w-4" /> {hasPayments ? "Add payment" : "Record payment"}
        </Button>
        <Button size="sm" type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
        <Button size="sm" type="button" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" /> Edit invoice
        </Button>
      </div>
      <RecordPaymentDrawer invoice={invoice} open={paymentOpen} onOpenChange={setPaymentOpen} />
      <EditInvoiceDrawer invoice={invoice} open={editOpen} onOpenChange={setEditOpen} />
      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the invoice and its charge lines.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={deleteInvoice.isPending}
              type="button"
              variant="destructive"
              onClick={() => deleteInvoice.mutate()}
            >
              Delete invoice
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
