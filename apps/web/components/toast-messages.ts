type EntityLabel = "Property" | "Tenant" | "Maintenance" | "Invoice";

export function entityCreatedMessage(entity: EntityLabel, name: string) {
  return `${entity} “${name}” has been created.`;
}

export function entityUpdatedMessage(entity: EntityLabel, name: string) {
  return `${entity} “${name}” has been updated.`;
}

export function entityDeletedMessage(entity: EntityLabel, name: string) {
  return `${entity} “${name}” has been deleted.`;
}

export function entityArchivedMessage(entity: EntityLabel, name: string) {
  return `${entity} “${name}” has been archived.`;
}

export function paymentEntityAddedMessage(name: string) {
  return `Payment for “${name}” has been recorded.`;
}

export function paymentEntityDeletedMessage(name: string) {
  return `Payment for “${name}” has been deleted.`;
}
