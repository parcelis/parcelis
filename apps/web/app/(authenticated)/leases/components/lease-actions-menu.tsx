"use client";

import { LeaseWorkflowMenu } from "./lease-workflow-menu";
import type { LeaseRowProps } from "./types";

export function LeaseActionsMenu({ lease, draftKey }: LeaseRowProps) {
  return <LeaseWorkflowMenu lease={{ ...lease, hasInvoices: lease.invoices.length > 0 }} draftKey={draftKey} />;
}
