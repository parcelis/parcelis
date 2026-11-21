"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EllipsisVertical,
  Eye,
  Pencil,
  RefreshCw,
  StickyNote,
  UserRoundCog,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button, DropdownMenuItem, DropdownMenuSeparator } from "@parcelis/ui";
import { apiClient, queryKeys } from "@/components/api-client";
import { EntityLifecycleControls } from "@/components/entity-lifecycle-controls";
import { NotesDrawer } from "@/components/notes-drawer";
import { hasPermission } from "@/components/property-access";
import { getLeaseDraftLink, getLeaseLink } from "@/lib/entity-links";
import { LeaseOperationDrawer, type LeaseOperation } from "./lease-operation-drawer";

export function LeaseWorkflowMenu({
  lease,
  draftKey,
  showView = true,
  children,
}: {
  lease: { id: number; status: string; archivedAt: Date | string | null; hasInvoices?: boolean };
  draftKey?: string;
  showView?: boolean;
  children?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const currentUser = useQuery({ queryKey: queryKeys.auth.me, queryFn: () => apiClient.auth.me.query() });
  const permissions = currentUser.data?.permissions;
  const canView = hasPermission(permissions, "leases", "view");
  const canEdit = canView && hasPermission(permissions, "leases", "edit");
  const canRenew = canEdit && hasPermission(permissions, "leases", "create");
  const canNotes = canView && hasPermission(permissions, "lease_notes", "view");
  const [operation, setOperation] = useState<LeaseOperation | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const mutable = !lease.archivedAt && lease.status !== "draft" && lease.status !== "ended";
  async function refresh() {
    await Promise.all(
      ["leases", "properties", "tenants", "invoices"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  }
  if (!canView) return null;
  return (
    <>
      <EntityLifecycleControls
        presentation="dropdown"
        dropdownTrigger={
          showView ? (
            <Button
              aria-label={`Open actions for lease #${lease.id}`}
              className="h-8 w-8 p-0"
              size="sm"
              variant="secondary"
            >
              <EllipsisVertical className="h-4 w-4" />
            </Button>
          ) : undefined
        }
        archiveDescription="Archiving hides this lease from the default directory. It preserves its status, tenants, and invoices; it does not terminate the lease."
        canArchive={hasPermission(permissions, "leases", "archive")}
        canDelete={
          hasPermission(permissions, "leases", "delete") && lease.status === "draft" && lease.hasInvoices === false
        }
        cancelDeleteLabel="Keep Lease"
        deleteDescription="This permanently deletes a draft lease and its tenant assignments. The draft must have no invoices. Tenant records remain available."
        entityLabel={`lease #${lease.id}`}
        isArchived={Boolean(lease.archivedAt)}
        isAvailable
        onArchive={() => apiClient.leases.archive.mutate({ id: lease.id })}
        onArchiveSuccess={async () => {
          await refresh();
          toast.success(`Lease #${lease.id} archived.`);
        }}
        onReactivate={() => apiClient.leases.reactivate.mutate({ id: lease.id })}
        onReactivateSuccess={async () => {
          await refresh();
          toast.success(`Lease #${lease.id} unarchived.`);
        }}
        onDelete={() => apiClient.leases.delete.mutate({ id: lease.id })}
        onDeleteSuccess={async () => {
          await refresh();
          toast.success(`Draft lease #${lease.id} deleted.`);
        }}
      >
        {showView ? (
          <DropdownMenuItem asChild>
            <Link href={getLeaseLink(lease.id)}>
              <Eye className="h-4 w-4 text-parcelis-green" />
              View
            </Link>
          </DropdownMenuItem>
        ) : null}
        {lease.status === "draft" && canEdit && draftKey ? (
          <DropdownMenuItem asChild>
            <Link href={getLeaseDraftLink(draftKey)}>
              <Pencil className="h-4 w-4 text-parcelis-green" />
              Resume draft
            </Link>
          </DropdownMenuItem>
        ) : null}
        {canEdit && lease.status !== "draft" ? (
          <DropdownMenuItem disabled={!mutable} onSelect={() => setOperation("edit")}>
            <Pencil className="h-4 w-4 text-parcelis-green" />
            Edit Lease
          </DropdownMenuItem>
        ) : null}
        {canRenew && lease.status !== "draft" ? (
          <DropdownMenuItem disabled={Boolean(lease.archivedAt)} onSelect={() => setOperation("renew")}>
            <RefreshCw className="h-4 w-4 text-parcelis-green" />
            Renew Lease
          </DropdownMenuItem>
        ) : null}
        {canEdit && lease.status !== "draft" && hasPermission(permissions, "tenants", "view") ? (
          <DropdownMenuItem disabled={!mutable} onSelect={() => setOperation("tenants")}>
            <UserRoundCog className="h-4 w-4 text-parcelis-green" />
            Edit Tenants
          </DropdownMenuItem>
        ) : null}
        {canNotes ? (
          <DropdownMenuItem onSelect={() => setNotesOpen(true)}>
            <StickyNote className="h-4 w-4 text-parcelis-green" />
            Notes
          </DropdownMenuItem>
        ) : null}
        {children}
        {canEdit && lease.status !== "draft" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!mutable} onSelect={() => setOperation("terminate")}>
              <XCircle className="h-4 w-4 text-parcelis-green" />
              Terminate
            </DropdownMenuItem>
          </>
        ) : null}
      </EntityLifecycleControls>
      {operation ? (
        <LeaseOperationDrawer leaseId={lease.id} operation={operation} onClose={() => setOperation(null)} />
      ) : null}
      {notesOpen ? (
        <NotesDrawer
          subject={{ leaseId: lease.id }}
          subjectLabel={`Lease #${lease.id}`}
          open
          onOpenChange={setNotesOpen}
        />
      ) : null}
    </>
  );
}
