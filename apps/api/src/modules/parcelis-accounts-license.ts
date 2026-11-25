import { createPublicKey, verify } from "node:crypto";
import { parcelisAccountsOrigin, type ActivateInstallationLicense } from "@parcelis/schemas";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getInstallationMetadata } from "./installation-metadata";

const jwtHeader = z.object({
  alg: z.literal("ES256"),
  typ: z.literal("parcelis-license+jwt"),
  kid: z.string().min(1).max(128),
});
const tier = z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/);
const jwtClaims = z.object({
  iss: z.literal("parcelis-accounts"),
  aud: z.literal("parcelis-self-hosted"),
  sub: z.uuid(),
  tier,
  iat: z.number().int(),
  exp: z.number().int(),
});
const snapshotSchema = z.object({
  installationId: z.uuid(),
  tier,
  license: z
    .string()
    .max(16_384)
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
  validUntil: z.iso.datetime(),
});
const keysSchema = z.record(z.string(), z.string().max(4096));
const sevenDays = 7 * 24 * 60 * 60;

function decode(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

function readP256Key(pem: string) {
  if (!pem.startsWith("-----BEGIN PUBLIC KEY-----")) throw new Error("Invalid public key");
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new Error("Invalid public key");
  }
  return key;
}

export function verifyAccountsLicense(payload: unknown, keys: unknown, installationId: string, now = Date.now()) {
  const snapshot = snapshotSchema.parse(payload);
  const [headerPart, claimsPart, signaturePart] = snapshot.license.split(".") as [string, string, string];
  const header = jwtHeader.parse(decode(headerPart));
  const publicKeys = keysSchema.parse(keys);
  if (!Object.hasOwn(publicKeys, header.kid)) throw new Error("Unknown signing key");
  const key = readP256Key(publicKeys[header.kid]!);
  const signature = Buffer.from(signaturePart, "base64url");
  if (
    signature.length !== 64 ||
    !verify("sha256", Buffer.from(`${headerPart}.${claimsPart}`), { key, dsaEncoding: "ieee-p1363" }, signature)
  ) {
    throw new Error("Invalid license signature");
  }

  const claims = jwtClaims.parse(decode(claimsPart));
  const nowSeconds = Math.floor(now / 1000);
  if (
    claims.sub !== installationId ||
    snapshot.installationId !== installationId ||
    claims.tier !== snapshot.tier ||
    claims.iat > nowSeconds + 60 ||
    claims.exp <= nowSeconds ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > sevenDays ||
    claims.exp * 1000 !== Date.parse(snapshot.validUntil)
  ) {
    throw new Error("Invalid license claims");
  }

  return { signedLicense: snapshot.license, tier: claims.tier, validUntil: new Date(claims.exp * 1000) };
}

export async function syncAccountsLicense(
  installationId: string,
  credential: string,
  activation?: ActivateInstallationLicense,
  request = fetch,
) {
  const timeout = AbortSignal.timeout(10_000);
  const loadSigningKeys = async () => {
    try {
      const response = await request(`${parcelisAccountsOrigin}/.well-known/parcelis-license-keys.json`, {
        redirect: "error",
        signal: timeout,
      });
      if (!response.ok) throw new Error("Signing keys unavailable");
      const keys = keysSchema.parse(await response.json());
      const entries = Object.values(keys);
      if (!entries.length || entries.length > 16) throw new Error("Invalid signing keys");
      entries.forEach(readP256Key);
      return keys;
    } catch {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: "Parcelis Portal signing keys are unavailable. Try again later.",
      });
    }
  };
  const activationKeys = activation ? await loadSigningKeys() : undefined;
  const { url, version } = getInstallationMetadata();

  let response: Response;
  let body: unknown;
  try {
    const path = activation ? "activate" : `${encodeURIComponent(installationId)}/refresh`;
    response = await request(`${parcelisAccountsOrigin}/api/installations/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(!activation && { Authorization: `Bearer ${credential}` }),
      },
      body: JSON.stringify(
        activation ? { ...activation, id: installationId, credential, url, version } : { url, version },
      ),
      redirect: "error",
      signal: timeout,
    });
    body = await response.json();
  } catch {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "Couldn’t reach Parcelis Portal. Try again." });
  }

  const code = z.object({ error: z.string() }).safeParse(body);
  if (!activation && response.status === 403 && code.data?.error === "license_inactive") {
    return { kind: "inactive" } as const;
  }
  if (activation && response.status === 409 && code.data?.error === "activation_unavailable") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This activation code is invalid, expired, or already used. Generate a new code in Parcelis Portal.",
    });
  }
  if (!activation && response.status === 401 && code.data?.error === "invalid_credential") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Parcelis Portal no longer recognizes this installation. Contact support.",
    });
  }
  if (!response.ok) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "Parcelis Portal couldn’t complete this request. Try again.",
    });
  }

  const keys = activationKeys ?? (await loadSigningKeys());
  try {
    return { kind: "verified", ...verifyAccountsLicense(body, keys, installationId) } as const;
  } catch {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "Couldn’t verify the license from Parcelis Portal. Try again.",
    });
  }
}

export async function unlinkAccountsInstallation(installationId: string, credential: string) {
  let response: Response;
  try {
    response = await fetch(`${parcelisAccountsOrigin}/api/installations/${encodeURIComponent(installationId)}/unlink`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credential}` },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "Couldn’t reach Parcelis Portal. Try again." });
  }
  if (response.status === 404 || response.status === 405) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "Unlinking isn’t available in the deployed version of Parcelis Portal.",
    });
  }
  if (response.status !== 204) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "Parcelis Portal couldn’t confirm the unlink. Try again or contact support.",
    });
  }
}
