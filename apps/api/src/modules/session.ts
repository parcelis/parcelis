import type { PrismaClient } from "@parcelis/db";
import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";

export async function readSession(prisma: PrismaClient, request: { headers: { cookie?: string } }) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret?.trim()) return null;
  const token = await getToken({
    req: new NextRequest("http://localhost", { headers: { cookie: request.headers.cookie ?? "" } }),
    secret,
  });
  const id = Number(token?.sub);
  if (!token || !Number.isSafeInteger(id) || id <= 0) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      profileImageObjectKey: true,
      role: true,
      accountStatus: true,
      defaultOrganizationId: true,
    },
  });
  if (!user || user.accountStatus !== "active") {
    return null;
  }
  return { userId: user.id, user };
}
