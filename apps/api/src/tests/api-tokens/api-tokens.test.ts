import assert from "node:assert/strict";
import test from "node:test";
import {
  createApiToken,
  getApiTokenExpiration,
  hashApiToken,
  getApiTokenDisplayPrefix,
} from "../../modules/api-tokens";
import { apiTokenMetadataSchema, createApiTokenInputSchema, createApiTokenOutputSchema } from "@parcelis/schemas";

test("one month from January 31 ends on February 28", () => {
  const now = new Date("2026-01-31T12:30:00.000Z");

  const result = getApiTokenExpiration("1_month", now);

  assert.equal(result?.toISOString(), "2026-02-28T12:30:00.000Z");
  assert.equal(now.toISOString(), "2026-01-31T12:30:00.000Z");
});

test("one month from January 31 respects leap years", () => {
  const now = new Date("2028-01-31T12:30:00.000Z");

  const result = getApiTokenExpiration("1_month", now);

  assert.equal(result?.toISOString(), "2028-02-29T12:30:00.000Z");
});

test("seven days adds exactly 168 hours across a year boundary", () => {
  const now = new Date("2026-12-28T12:30:00.000Z");

  const result = getApiTokenExpiration("7_days", now);

  assert.equal(result?.toISOString(), "2027-01-04T12:30:00.000Z");
});

test("never returns no expiration date", () => {
  const result = getApiTokenExpiration("never");

  assert.equal(result, null);
});

test("generated tokens match the API credential format", () => {
  const token = createApiToken();

  const result = createApiTokenOutputSchema.shape.token.safeParse(token);

  assert.equal(result.success, true);
});

test("token hashing produces the expected SHA-256 fingerprint", () => {
  const result = hashApiToken("abc");

  assert.equal(result, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("display prefix includes only the first ten random characters", () => {
  const token = `pcls_api_0123456789${"A".repeat(33)}`;

  const result = getApiTokenDisplayPrefix(token);

  assert.equal(result, "pcls_api_0123456789");
});

const monthExpirationCases = [
  ["3_months", "2026-11-30T12:30:00.000Z"],
  ["6_months", "2027-02-28T12:30:00.000Z"],
  ["12_months", "2027-08-31T12:30:00.000Z"],
] as const;

for (const [expiration, expected] of monthExpirationCases) {
  test(`${expiration} calculates the correct expiration date`, () => {
    const now = new Date("2026-08-31T12:30:00.000Z");

    const result = getApiTokenExpiration(expiration, now);

    assert.equal(result?.toISOString(), expected);
  });
}

test("creation trims the name and defaults expiration to seven days", () => {
  const result = createApiTokenInputSchema.parse({
    name: "  Bruno  ",
  });

  assert.deepEqual(result, {
    name: "Bruno",
    expiration: "7_days",
  });
});

test("creation rejects a whitespace-only name", () => {
  const result = createApiTokenInputSchema.safeParse({
    name: "   ",
  });

  assert.equal(result.success, false);
});

test("creation rejects a name longer than 100 characters", () => {
  const result = createApiTokenInputSchema.safeParse({
    name: "A".repeat(101),
  });

  assert.equal(result.success, false);
});

test("creation rejects an unsupported expiration", () => {
  const result = createApiTokenInputSchema.safeParse({
    name: "Bruno",
    expiration: "2_years",
  });

  assert.equal(result.success, false);
});

test("metadata serialization excludes the credential and its hash", () => {
  const metadata = {
    id: "cjld2cjxh0000qzrmn831i7rn",
    name: "Bruno",
    tokenPrefix: "pcls_api_0123456789",
    createdByLabel: "Test administrator",
    createdAt: "2026-10-20T12:00:00.000Z",
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    revokedByLabel: null,
  };

  const result = apiTokenMetadataSchema.parse({
    ...metadata,
    token: `pcls_api_${"A".repeat(43)}`,
    tokenHash: "a".repeat(64),
  });

  assert.deepEqual(result, metadata);
});
