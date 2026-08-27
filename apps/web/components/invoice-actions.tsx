"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Eye, Pencil, ReceiptText, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
} from "@parcelis/ui";
import { useRouter } from "next/navigation";
import { apiClient } from "./api-client";
import { EditInvoiceDrawer } from "./edit-invoice-drawer";
import { InvoicePdfViewer } from "./invoice-pdf-viewer";
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
  const [pdfPreview, setPdfPreview] = React.useState<{ fileName: string; url: string } | null>(null);
  const [isOpeningPdf, setIsOpeningPdf] = React.useState(false);
  const hasPayments = (invoice.payments ?? []).length > 0;
  const deleteInvoice = useMutation({
    mutationFn: () => apiClient.invoices.delete.mutate({ id: invoice.id }),
    onSuccess: () => router.push("/income"),
  });

  React.useEffect(() => {
    return () => {
      if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
    };
  }, [pdfPreview]);

  async function previewInvoicePdf() {
    setIsOpeningPdf(true);
    try {
      const result = await apiClient.invoices.pdf.query({ id: invoice.id });
      const bytes = Uint8Array.from(atob(result.contentBase64), (character) => character.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      setPdfPreview({ fileName: result.fileName, url: URL.createObjectURL(blob) });
    } catch {
      setPdfPreview(null);
    } finally {
      setIsOpeningPdf(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <Button disabled={isOpeningPdf} size="sm" type="button" variant="secondary" onClick={previewInvoicePdf}>
          <Eye className="h-4 w-4" /> {isOpeningPdf ? "Preparing..." : "Preview PDF"}
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
      <Dialog
        open={Boolean(pdfPreview)}
        onOpenChange={(open) => {
          if (!open) setPdfPreview(null);
        }}
      >
        <DialogContent
          aria-labelledby="invoice-pdf-preview-title"
          className="h-[90vh] min-w-0 max-w-6xl grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden p-0"
        >
          <h2 className="sr-only" id="invoice-pdf-preview-title">
            Invoice PDF preview
          </h2>
          {pdfPreview ? (
            <div className="h-full min-h-0 min-w-0 max-w-full overflow-hidden">
              <InvoicePdfViewer fileName={pdfPreview.fileName} source={pdfPreview.url} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the invoice and its charge lines.</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteInvoice.error ? <p className="text-sm text-red-700">{deleteInvoice.error.message}</p> : null}
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
