import { propertyTypeValues, type PropertyType } from "@parcelis/schemas";
import type { PropertyFormState, UnitDetailsFormState } from "./property-drawer";

type DrawerProperty = {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  propertyType: string;
  status: PropertyFormState["status"];
  tags?: Array<{ id: number }>;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  unitCount: number;
  units: Array<{
    id: number;
    name: string;
    marketRateCents: number;
    unitType: string;
    bedrooms: number | null;
    bathrooms: number | null;
    squareFeet: number | null;
    utilityTypeIds: number[];
    amenityTypeIds: number[];
  }>;
};

export function parseContactAddress(contactAddress: string | null | undefined) {
  const [line1 = "", line2 = "", cityRegionPostal = ""] = contactAddress?.split("\n") ?? [];
  const [city = "", regionPostal = ""] = cityRegionPostal.split(", ");
  const [region = "", ...postalCodeParts] = regionPostal.split(" ");

  return {
    contactAddressLine1: line1,
    contactAddressLine2: line2,
    contactCity: city,
    contactRegion: region,
    contactPostalCode: postalCodeParts.join(" "),
  };
}

export function getPropertyType(value: string): PropertyType {
  return propertyTypeValues.includes(value as PropertyType) ? (value as PropertyType) : "Apartment";
}

export function getUnitType(value: string): UnitDetailsFormState["unitType"] {
  return value === "commercial" || value === "Commercial" ? "Commercial" : "Residential";
}

export function getPropertyFormState(property: DrawerProperty): PropertyFormState {
  return {
    name: property.name,
    line1: property.line1,
    line2: property.line2 ?? "",
    city: property.city,
    region: property.region,
    postalCode: property.postalCode,
    propertyType: getPropertyType(property.propertyType),
    status: property.status,
    tagIds: property.tags?.map((tag) => tag.id) ?? [],
    contactName: property.contactName ?? "",
    contactEmail: property.contactEmail ?? "",
    contactPhone: property.contactPhone ?? "",
    ...parseContactAddress(property.contactAddress),
    unitCount: String(property.unitCount),
  };
}

export function getUnitFormStates(property: DrawerProperty): UnitDetailsFormState[] {
  return property.units.map((unit) => ({
    id: unit.id,
    unitName: unit.name,
    marketRate: String(unit.marketRateCents / 100),
    unitType: getUnitType(unit.unitType),
    bedrooms: unit.bedrooms === null || unit.bedrooms === undefined ? "" : String(unit.bedrooms),
    bathrooms: unit.bathrooms === null || unit.bathrooms === undefined ? "" : String(unit.bathrooms),
    squareFeet: unit.squareFeet === null || unit.squareFeet === undefined ? "" : String(unit.squareFeet),
    utilities: unit.utilityTypeIds,
    amenities: unit.amenityTypeIds,
  }));
}

export function getSavedUnitIds(units: UnitDetailsFormState[]) {
  return units.flatMap(({ id }) => (typeof id === "number" ? [id] : []));
}
