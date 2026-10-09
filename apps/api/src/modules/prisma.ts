import { PrismaClient, PrismaPg } from "@parcelis/db";
import { getDatabaseConfig } from "./database-config";
import { registerApiCleanup } from "./runtime-cleanup";

const databaseGlobal = globalThis as typeof globalThis & { parcelisPrisma?: PrismaClient };

export function getPrisma() {
  if (!databaseGlobal.parcelisPrisma) {
    const { connectionString, schema } = getDatabaseConfig();
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
    registerApiCleanup(() => client.$disconnect());
    databaseGlobal.parcelisPrisma = client;
  }
  return databaseGlobal.parcelisPrisma;
}
