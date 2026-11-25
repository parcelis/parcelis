import { generateKeyPairSync, sign } from "node:crypto";

export function accountsLicenseSigner() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const keys = { fixture: publicKey.export({ type: "spki", format: "pem" }).toString() };
  return {
    keys,
    issue(installationId: string, tier: string, now = Date.now()) {
      const iat = Math.floor(now / 1000);
      const exp = iat + 7 * 24 * 60 * 60;
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const header = encode({ alg: "ES256", typ: "parcelis-license+jwt", kid: "fixture" });
      const claims = encode({
        iss: "parcelis-accounts",
        aud: "parcelis-self-hosted",
        sub: installationId,
        tier,
        iat,
        exp,
      });
      const payload = `${header}.${claims}`;
      const signature = sign("sha256", Buffer.from(payload), { key: privateKey, dsaEncoding: "ieee-p1363" });
      return {
        installationId,
        tier,
        validUntil: new Date(exp * 1000).toISOString(),
        license: `${payload}.${signature.toString("base64url")}`,
      };
    },
  };
}
