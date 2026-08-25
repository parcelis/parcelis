export function getPropertyLink(propertyId: number) {
  return `/properties/${propertyId}`;
}

export function getUnitLink(propertyId: number, unitId: number | string) {
  return `${getPropertyLink(propertyId)}/units/${unitId}`;
}

export function getTenantLink(tenantId: number) {
  return `/tenants/${tenantId}`;
}

export function getLeaseLink(leaseId: number | string) {
  return `/leases/${leaseId}`;
}

export function getTenantInvoicesLink(tenantId: number) {
  return `/income?tenantId=${tenantId}`;
}

export function getInvoiceLink(invoiceId: number | string) {
  return `/income/invoices/${invoiceId}`;
}

export function getMaintenanceLink(ticketId: number) {
  return `/maintenance/${ticketId}`;
}

export function getApplicationLink(applicationId: number) {
  return `/applications/${applicationId}`;
}
