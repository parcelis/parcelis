import assert from "node:assert/strict";
import test from "node:test";
import { leaseDraftDataSchema } from "@parcelis/schemas";

test("lease drafts accept a property-only selection", () => {
  const result = leaseDraftDataSchema.safeParse({ propertyId: 2, draftStep: "property" });

  assert.equal(result.success, true);
});

test("lease drafts accept incomplete fixed terms", () => {
  const result = leaseDraftDataSchema.safeParse({
    propertyId: 2,
    termType: "fixed",
    startsOn: null,
    endsOn: null,
    draftStep: "terms",
  });

  assert.equal(result.success, true);
});

for (const [name, input] of [
  ["zero monthly rent", { monthlyRentCents: 0 }],
  ["duplicate residents", { tenantIds: [11, 11] }],
  ["an invalid draft step", { draftStep: "billing" }],
] as const) {
  test(`lease drafts reject ${name}`, () => {
    assert.equal(leaseDraftDataSchema.safeParse(input).success, false);
  });
}
