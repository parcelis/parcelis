import { createHash, randomBytes } from "node:crypto";

export async function seedApiTokens(prisma, organization, administrator, now = new Date()) {
  const dayMs = 24 * 60 * 60 * 1000;
  const samples = [
    {
      key: "active",
      name: "Demo active token",
      createdAt: new Date(now.getTime() - 2 * dayMs),
      expiresAt: null,
      lastUsedAt: new Date(now.getTime() - 60 * 60 * 1000),
      revokedAt: null,
      revokedById: null,
      revokedByLabel: null,
    },
    {
      key: "revoked",
      name: "Demo revoked token",
      createdAt: new Date(now.getTime() - 14 * dayMs),
      expiresAt: null,
      lastUsedAt: new Date(now.getTime() - 3 * dayMs),
      revokedAt: new Date(now.getTime() - 2 * dayMs),
      revokedById: administrator.id,
      revokedByLabel: administrator.name,
    },
  ];

  await prisma.$transaction(
    samples.map(({ key, ...sample }) => {
      const id = `c${createHash("sha256")
        .update(`parcelis-demo:${organization.id}:api-token:${key}`)
        .digest("hex")
        .slice(0, 24)}`;
      const token = `pcls_api_${randomBytes(32).toString("base64url")}`;
      const data = {
        ...sample,
        organizationId: organization.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        tokenPrefix: token.slice(0, "pcls_api_".length + 10),
        createdById: administrator.id,
        createdByLabel: administrator.name,
      };

      return prisma.apiToken.upsert({ where: { id }, create: { id, ...data }, update: {} });
    }),
  );
}
