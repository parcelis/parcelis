export function getDatabaseConfig(env: Record<string, string | undefined> = process.env) {
  let connectionString = env.DATABASE_URL;
  if (connectionString === undefined) {
    if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") {
      throw new Error("DATABASE_URL is required.");
    }
    connectionString = `postgresql://parcelis:parcelis@localhost:${env.POSTGRES_PORT ?? 54320}/parcelis?schema=public`;
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  return { connectionString, schema: url.searchParams.get("schema") ?? "public" };
}
