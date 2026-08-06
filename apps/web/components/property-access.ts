export type PropertyAccess = "none" | "view" | "edit" | "delete" | "all";

const propertyAccessRank: Record<PropertyAccess, number> = {
  none: 0,
  view: 1,
  edit: 2,
  delete: 3,
  all: 4,
};

export function hasPropertyAccess(
  currentAccess: PropertyAccess | undefined,
  requiredAccess: PropertyAccess,
) {
  return propertyAccessRank[currentAccess ?? "none"] >= propertyAccessRank[requiredAccess];
}
