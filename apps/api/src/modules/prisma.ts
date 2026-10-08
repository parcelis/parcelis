import { PrismaClient, PrismaPg } from "@parcelis/db";
import { registerApiCleanup } from "./runtime-cleanup";

const databaseGlobal = globalThis as typeof globalThis & { parcelisPrisma?: PrismaClient };

export function getPrisma() {
  if (!databaseGlobal.parcelisPrisma) {
    const connectionString =
      process.env.DATABASE_URL ??
      `postgresql://parcelis:parcelis@localhost:${process.env.POSTGRES_PORT ?? 54320}/parcelis?schema=public`;
    const schema = new URL(connectionString).searchParams.get("schema") ?? "public";
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
    registerApiCleanup(() => client.$disconnect());
    databaseGlobal.parcelisPrisma = client;
  }
  return databaseGlobal.parcelisPrisma;
}
