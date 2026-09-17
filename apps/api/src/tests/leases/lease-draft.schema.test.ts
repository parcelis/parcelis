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

test("lease drafts accept zero rent allocations before individual billing is complete", () => {
  const result = leaseDraftDataSchema.safeParse({
    tenantIds: [11],
    billingResponsibility: "individual",
    tenantAllocations: [{ tenantId: 11, rentShareCents: 0, depositShareCents: 0 }],
    draftStep: "residents",
  });

  assert.equal(result.success, true);
});

test("lease drafts normalize empty date inputs to null", () => {
  const result = leaseDraftDataSchema.safeParse({ startsOn: "", endsOn: "", draftStep: "terms" });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.startsOn, null);
    assert.equal(result.data.endsOn, null);
  }
});

test("lease drafts reject a unit without a property", () => {
  const result = leaseDraftDataSchema.safeParse({ unitId: 3, draftStep: "property" });

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.issues[0]?.path[0], "unitId");
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
