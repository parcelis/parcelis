import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { PrismaService } from "../modules/prisma.service";

export function createContext(prisma: PrismaService) {
  return (_opts: CreateExpressContextOptions) => ({
    prisma,
  });
}

export type Context = Awaited<ReturnType<ReturnType<typeof createContext>>>;
