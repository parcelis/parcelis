import assert from "node:assert/strict";
import test from "node:test";
import {
  createPropertyInputSchema,
  createUnitInputSchema,
  updatePropertyInputSchema,
  updateUnitInputSchema,
} from "@parcelis/schemas";

for (const marketRateCents of [0, 2_147_483_647, 2_147_483_648, Number.MAX_SAFE_INTEGER]) {
  test(`market rates ${marketRateCents <= 2_147_483_647 ? "accept" : "reject"} ${marketRateCents} cents`, () => {
    const unit = { name: "101", unitType: "Residential", marketRateCents };
    const property = {
      name: "Oak House",
      propertyType: "House",
      address: { line1: "123 Oak Street", city: "Chicago", region: "IL", postalCode: "60601" },
      unitCount: 1,
      units: [unit],
    };
    const inputs = [
      ["unit create", createUnitInputSchema, { ...unit, propertyId: 1 }],
      ["unit update", updateUnitInputSchema, { ...unit, id: 1 }],
      ["property create", createPropertyInputSchema, property],
      ["property update", updatePropertyInputSchema, { ...property, id: 1 }],
    ] as const;

    for (const [name, schema, input] of inputs) {
      assert.equal(schema.safeParse(input).success, marketRateCents <= 2_147_483_647, name);
    }
  });
}
