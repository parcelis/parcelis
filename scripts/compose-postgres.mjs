export function runPostgresCompose(runCompose, args) {
  try {
    runCompose(args);
  } catch (error) {
    try {
      runCompose(["logs", "--no-color", "--tail", "30", "postgres-service"]);
    } catch {
      console.error("[parcelis] Could not read PostgreSQL container logs.");
    }
    console.error(
      "[parcelis] If existing PostgreSQL 16 data blocked startup, follow https://docs.parcelis.dev/docs/upgrade-postgresql",
    );
    console.error("[parcelis] Migration preflight: node scripts/upgrade-postgres.mjs -- -f docker-compose-dev.yml");
    throw error;
  }
}
