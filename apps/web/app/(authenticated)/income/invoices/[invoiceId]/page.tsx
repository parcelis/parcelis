"use client";

import * as React from "react";
import { InvoiceDetailView } from "../../../../../components/invoice-detail-view";
import { LoadingState } from "../../../../../components/loading-state";

export default function InvoiceDetailPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading invoice…" />}>
      <InvoiceDetailView />
    </React.Suspense>
  );
}
