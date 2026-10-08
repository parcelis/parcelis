import { PrismaClient, PrismaPg } from "@parcelis/db";

const databaseGlobal = globalThis as typeof globalThis & { parcelisPrisma?: PrismaClient };
let prisma = databaseGlobal.parcelisPrisma;

export function getPrisma() {
  if (!prisma) {
    const connectionString =
      process.env.DATABASE_URL ??
      `postgresql://parcelis:parcelis@localhost:${process.env.POSTGRES_PORT ?? 54320}/parcelis?schema=public`;
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    if (process.env.NODE_ENV !== "production") databaseGlobal.parcelisPrisma = prisma;
  }
  return prisma;
}
