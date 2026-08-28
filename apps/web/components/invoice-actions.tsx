"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { Eye, Pencil, ReceiptText, StickyNote, Trash2 } from "lucide-react";
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
import { toast } from "sonner";
import { apiClient } from "./api-client";
import { EditInvoiceDrawer } from "./edit-invoice-drawer";
import { InvoicePdfViewer } from "./invoice-pdf-viewer";
import { NotesDrawer } from "./notes-drawer";
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

type PdfPreview = { fileName: string; url: string };

function InvoicePdfPreviewDialog({
  open,
  preview,
  onOpenChange,
}: {
  open: boolean;
  preview: PdfPreview | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { engine, error, isLoading } = usePdfiumEngine({ fontFallback: null });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-labelledby="invoice-pdf-preview-title"
        className="h-[90vh] min-w-0 max-w-6xl grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden p-0"
      >
        <h2 className="sr-only" id="invoice-pdf-preview-title">
          Invoice PDF preview
        </h2>
        {preview ? (
          <div className="h-full min-h-0 min-w-0 max-w-full overflow-hidden">
            <InvoicePdfViewer
              engine={engine}
              engineError={error}
              fileName={preview.fileName}
              isEngineLoading={isLoading}
              source={preview.url}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function InvoiceActions({ invoice }: { invoice: InvoiceActionInvoice }) {
  const router = useRouter();
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [pdfPreview, setPdfPreview] = React.useState<PdfPreview | null>(null);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = React.useState(false);
  const [isPdfViewerReady, setIsPdfViewerReady] = React.useState(false);
  const [isOpeningPdf, setIsOpeningPdf] = React.useState(false);
  const isMountedRef = React.useRef(false);
  const pdfPreviewUrlRef = React.useRef<string | null>(null);
  const hasPayments = (invoice.payments ?? []).length > 0;
  const deleteInvoice = useMutation({
    mutationFn: () => apiClient.invoices.delete.mutate({ id: invoice.id }),
    onSuccess: () => router.push("/income"),
  });

  React.useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (pdfPreviewUrlRef.current) URL.revokeObjectURL(pdfPreviewUrlRef.current);
    };
  }, []);

  function closePdfPreview() {
    if (pdfPreviewUrlRef.current) {
      URL.revokeObjectURL(pdfPreviewUrlRef.current);
      pdfPreviewUrlRef.current = null;
    }
    setIsPdfPreviewOpen(false);
    setPdfPreview(null);
  }

  async function previewInvoicePdf() {
    setIsOpeningPdf(true);
    try {
      const result = await apiClient.invoices.pdf.query({ id: invoice.id });
      const bytes = Uint8Array.from(atob(result.contentBase64), (character) => character.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      if (!isMountedRef.current) return;

      const url = URL.createObjectURL(blob);
      if (!isMountedRef.current) {
        URL.revokeObjectURL(url);
        return;
      }

      if (pdfPreviewUrlRef.current) URL.revokeObjectURL(pdfPreviewUrlRef.current);
      pdfPreviewUrlRef.current = url;
      setPdfPreview({ fileName: result.fileName, url });
      setIsPdfViewerReady(true);
      setIsPdfPreviewOpen(true);
    } catch {
      if (isMountedRef.current) toast.error("Unable to prepare the invoice PDF. Please try again.");
    } finally {
      if (isMountedRef.current) setIsOpeningPdf(false);
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
        <Button size="sm" type="button" variant="secondary" onClick={() => setNotesOpen(true)}>
          <StickyNote className="h-4 w-4" /> Add note
        </Button>
        <Button size="sm" type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
        <Button size="sm" type="button" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" /> Edit invoice
        </Button>
      </div>
      <RecordPaymentDrawer invoice={invoice} open={paymentOpen} onOpenChange={setPaymentOpen} />
      <NotesDrawer
        onOpenChange={setNotesOpen}
        open={notesOpen}
        subject={{ invoiceId: invoice.id }}
        subjectLabel={`Invoice #${String(invoice.invoiceNumber).padStart(7, "0")}`}
      />
      <EditInvoiceDrawer invoice={invoice} open={editOpen} onOpenChange={setEditOpen} />
      {isPdfViewerReady ? (
        <InvoicePdfPreviewDialog open={isPdfPreviewOpen} preview={pdfPreview} onOpenChange={closePdfPreview} />
      ) : null}
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
