type EntityLabel = "Property" | "Tenant" | "Maintenance" | "Invoice" | "Unit";

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

export function entityReactivatedMessage(entity: EntityLabel, name: string) {
  return `${entity} “${name}” has been reactivated.`;
}
