export function validateOutboxTestDatabaseUrl(databaseUrl: string, configuredDatabaseUrl?: string): void;
export function createIsolatedTestSchema(
  prisma: { $executeRawUnsafe(query: string): PromiseLike<number> },
  databaseUrl: string,
  prefix: string,
): Promise<{ schema: string; cleanup: () => PromiseLike<number> }>;
export function createOutboxTestSchema(
  prisma: { $executeRawUnsafe(query: string): PromiseLike<number> },
  databaseUrl: string,
): Promise<{ schema: string; cleanup: () => PromiseLike<number> }>;
