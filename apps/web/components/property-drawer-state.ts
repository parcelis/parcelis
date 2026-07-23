import { propertyTypeValues, type PropertyType } from "@parcelis/schemas";
import type {
  PropertyFormState,
  UnitDetailsFormState,
} from "./property-drawer";

type DrawerProperty = {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  propertyType: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  unitCount: number;
  leases?: Array<{
    unitLabel: string;
    monthlyRentCents: number;
  }>;
  units: Array<{
    id: string;
    name: string;
    marketRateCents: number;
    unitType: string;
    bedrooms: number | null;
    bathrooms: number | null;
    squareFeet: number | null;
    rentIncludeOptionIds: string[];
    amenityOptionIds: string[];
  }>;
};

export function parseContactAddress(contactAddress: string | null | undefined) {
  const [line1 = "", line2 = "", cityRegionPostal = ""] =
    contactAddress?.split("\n") ?? [];
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
  return propertyTypeValues.includes(value as PropertyType)
    ? (value as PropertyType)
    : "Apartment";
}

export function getUnitType(value: string): UnitDetailsFormState["unitType"] {
  return value === "commercial" || value === "Commercial"
    ? "Commercial"
    : "Residential";
}

export function getPropertyFormState(
  property: DrawerProperty,
): PropertyFormState {
  return {
    name: property.name,
    line1: property.line1,
    line2: property.line2 ?? "",
    city: property.city,
    region: property.region,
    postalCode: property.postalCode,
    propertyType: getPropertyType(property.propertyType),
    contactName: property.contactName ?? "",
    contactEmail: property.contactEmail ?? "",
    contactPhone: property.contactPhone ?? "",
    ...parseContactAddress(property.contactAddress),
    unitCount: String(property.unitCount),
  };
}

export function getUnitFormStates(
  property: DrawerProperty,
): UnitDetailsFormState[] {
  if (property.units.length > 0) {
    return property.units.map((unit) => ({
      id: unit.id,
      unitName: unit.name,
      marketRate: String(unit.marketRateCents / 100),
      unitType: getUnitType(unit.unitType),
      bedrooms:
        unit.bedrooms === null || unit.bedrooms === undefined
          ? ""
          : String(unit.bedrooms),
      bathrooms:
        unit.bathrooms === null || unit.bathrooms === undefined
          ? ""
          : String(unit.bathrooms),
      squareFeet:
        unit.squareFeet === null || unit.squareFeet === undefined
          ? ""
          : String(unit.squareFeet),
      rentIncludes: unit.rentIncludeOptionIds,
      amenities: unit.amenityOptionIds,
    }));
  }

  const leases = property.leases ?? [];
  const unitLabels = Array.from(
    new Set(leases.map((lease) => lease.unitLabel).filter(Boolean)),
  );
  const unitTotal = Math.max(property.unitCount, unitLabels.length, 1);

  return Array.from({ length: unitTotal }, (_, index) => {
    const unitName = unitLabels[index] ?? String(index + 1);
    const lease = leases.find((item) => item.unitLabel === unitName);

    return {
      id: `synthetic-${index + 1}`,
      unitName,
      marketRate: lease ? String(lease.monthlyRentCents / 100) : "",
      unitType: "Residential",
      bedrooms: "",
      bathrooms: "",
      squareFeet: "",
      rentIncludes: [],
      amenities: [],
    };
  });
}
