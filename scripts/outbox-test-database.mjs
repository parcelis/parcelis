function databaseIdentity(value) {
  const url = new URL(value);
  return JSON.stringify([
    url.hostname.toLowerCase(),
    url.port || "5432",
    decodeURIComponent(url.pathname.slice(1)),
    url.searchParams.get("schema") || "public",
  ]);
}

export function validateOutboxTestDatabaseUrl(databaseUrl, configuredDatabaseUrl) {
  const url = new URL(databaseUrl);
  if (!decodeURIComponent(url.pathname.slice(1)).toLowerCase().includes("test")) {
    throw new Error("OUTBOX_TEST_DATABASE_URL must point to a database with 'test' in its name.");
  }
  if (configuredDatabaseUrl && databaseIdentity(databaseUrl) === databaseIdentity(configuredDatabaseUrl)) {
    throw new Error("OUTBOX_TEST_DATABASE_URL must be different from DATABASE_URL.");
  }
}
