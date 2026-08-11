export function getPropertyLink(propertyId: number) {
  return `/properties/${propertyId}`;
}

export function getUnitLink(propertyId: number, unitId: number | string) {
  return `${getPropertyLink(propertyId)}/units/${unitId}`;
}

export function getTenantLink(tenantId: number) {
  return `/tenants/${tenantId}`;
}

export function getTenantInvoicesLink(tenantId: number) {
  return `${getTenantLink(tenantId)}/invoices`;
}

export function getTenantInvoiceLink(tenantId: number, invoiceId: number | string) {
  return `${getTenantInvoicesLink(tenantId)}/${invoiceId}`;
}

export function getInvoiceLink(invoiceId: number | string) {
  return `/income/invoices/${invoiceId}`;
}

export function getMaintenanceLink(ticketId: number) {
  return `/maintenance/${ticketId}`;
}
