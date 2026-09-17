import assert from "node:assert/strict";
import test from "node:test";
import {
  leaseDraftCreateInputSchema,
  leaseDraftDataSchema,
  leaseDraftUpdateInputSchema,
} from "@parcelis/schemas";

test("lease draft creation requires a lease draft key and property selection", () => {
  const result = leaseDraftCreateInputSchema.safeParse({
    leaseDraftKey: "8f7c4b9a-7f50-4c9e-a5d1-3f5d9e3b2a10",
    propertyId: 2,
    unitId: 3,
  });

  assert.equal(result.success, true);
});

test("lease draft creation rejects an invalid lease draft key", () => {
  const result = leaseDraftCreateInputSchema.safeParse({
    leaseDraftKey: "retry-1",
    propertyId: 2,
    unitId: 3,
  });

  assert.equal(result.success, false);
});

test("lease draft updates distinguish cleared fields from omitted fields", () => {
  const result = leaseDraftUpdateInputSchema.safeParse({
    leaseId: 9,
    expectedRevision: 0,
    data: { unitId: null, draftStep: "property" },
  });

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.data.unitId, null);
});

test("lease draft updates require a revision and at least one field", () => {
  assert.equal(leaseDraftUpdateInputSchema.safeParse({ leaseId: 9, data: { draftStep: "terms" } }).success, false);
  assert.equal(
    leaseDraftUpdateInputSchema.safeParse({ leaseId: 9, expectedRevision: 0, data: {} }).success,
    false,
  );
});

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
