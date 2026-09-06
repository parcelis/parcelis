type EntityLabel = "Property" | "Tenant" | "Maintenance" | "Invoice" | "Unit" | "Application" | "User";

type SettingsSection = "Organization" | "Profile" | "Permissions";

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

export function entityEnabledMessage(entity: EntityLabel, name: string) {
  return `${entity} “${name}” has been enabled.`;
}

export function entityDisabledMessage(entity: EntityLabel, name: string) {
  return `${entity} “${name}” has been disabled.`;
}

export function settingUpdatedMessage(section: SettingsSection) {
  return `${section} has been updated.`;
}
