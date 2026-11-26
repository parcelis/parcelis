"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { Badge, TableCell, TableRow } from "@parcelis/ui";
import { getLeaseLink, getTenantLink } from "@/lib/entity-links";
import { formatLeaseEndDate } from "@/lib/format";
import { LeaseActionsMenu } from "./lease-actions-menu";
import { formatCurrency, formatDate, formatStatus, leaseStatusBadges, neutralStatusClass } from "./lease-presentation";
import type { LeaseRowProps } from "./types";

export function LeaseRow({ lease, canView, canEdit, canArchive, canDelete, draftKey }: LeaseRowProps) {
  const statusBadge = Object.hasOwn(leaseStatusBadges, lease.status)
    ? leaseStatusBadges[lease.status]
    : { label: formatStatus(lease.status), className: neutralStatusClass, dotClassName: "bg-current" };

  return (
    <TableRow className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60">
      <TableCell className="px-5 py-4">
        <Link className="font-semibold text-parcelis-charcoal hover:text-parcelis-green" href={getLeaseLink(lease.id)}>
          Lease #{lease.id}
        </Link>
        <p className="mt-1 text-sm text-parcelis-gray">
          {lease.property.name} · Unit {lease.unitLabel}
        </p>
      </TableCell>
      <TableCell className="px-5 py-4">
        {lease.tenants.map((tenant) => (
          <Link
            className="mb-1 flex items-center gap-2 text-sm font-medium text-parcelis-charcoal hover:text-parcelis-green"
            href={getTenantLink(tenant.id)}
            key={tenant.id}
          >
            <UserRound className="h-4 w-4 text-parcelis-green" />
            {tenant.firstName} {tenant.lastName}
          </Link>
        ))}
      </TableCell>
      <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
        <p>{formatDate(lease.startsOn)}</p>
        <p className="mt-1">to {formatLeaseEndDate(lease.endsOn, lease.termType)}</p>
      </TableCell>
      <TableCell className="px-5 py-4 font-semibold text-parcelis-charcoal">
        {formatCurrency(lease.monthlyRentCents)}
      </TableCell>
      <TableCell className="px-5 py-4">
        <Badge className={`h-6 w-fit gap-1.5 whitespace-nowrap ${statusBadge.className}`} variant="secondary">
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusBadge.dotClassName}`} />
          {statusBadge.label}
        </Badge>
      </TableCell>
      <TableCell className="px-5 py-4 text-right">
        <LeaseActionsMenu
          lease={lease}
          canView={canView}
          canEdit={canEdit}
          canArchive={canArchive}
          canDelete={canDelete}
          draftKey={draftKey}
        />
      </TableCell>
    </TableRow>
  );
}
