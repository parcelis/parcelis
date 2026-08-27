"use client";

import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle } from "@parcelis/ui";
import { InvoiceDetailView } from "../app/(authenticated)/income/invoices/[invoiceId]/page";

type InvoiceRecordDrawerProps = {
  invoiceId: number | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function InvoiceRecordDrawer({ invoiceId, onOpenChange, open }: InvoiceRecordDrawerProps) {
  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent size="lg">
        <DrawerHeader className="flex items-center gap-3">
          <DrawerClose />
          <DrawerTitle>Invoice Record</DrawerTitle>
        </DrawerHeader>
        {invoiceId ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <InvoiceDetailView embedded invoiceId={invoiceId} />
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
