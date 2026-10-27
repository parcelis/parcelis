#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const image = "postgres:18-alpine";
const marker = "/var/lib/postgresql/.parcelis-pg18-migrated";
const snapshotSql = `
SELECT format('SELECT %L || count(*)::text FROM %I.%I;',
  'table:' || schemaname || '.' || tablename || ':', schemaname, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
\\gexec
SELECT format('SELECT %L || last_value::text || %L || is_called::text FROM %I.%I;',
  'sequence:' || schemaname || '.' || sequencename || ':', ':', schemaname, sequencename)
FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename;
\\gexec
`;

export function parseOptions(args) {
  const separator = args.indexOf("--");
  const options = separator < 0 ? args : args.slice(0, separator);
  let execute = false;
  let backupDirectory;
  for (let i = 0; i < options.length; i++) {
    if (options[i] === "--execute") execute = true;
    else if (options[i] === "--backup-dir" && options[i + 1]) backupDirectory = resolve(options[++i]);
    else
      throw new Error("Usage: node scripts/upgrade-postgres.mjs [--execute] [--backup-dir PATH] -- [Compose options]");
  }
  return { execute, backupDirectory, composeArgs: separator < 0 ? [] : args.slice(separator + 1) };
}

export function migrationVolumes(config) {
  const service = config.services?.["postgres-service"];
  const source = service?.volumes?.find((volume) => volume.target === "/legacy");
  const target = service?.volumes?.find((volume) => volume.target === "/var/lib/postgresql");
  if (service?.image !== image || source?.type !== "volume" || target?.type !== "volume") {
    throw new Error("Use the updated Parcelis PostgreSQL 18 Compose file with named legacy and destination volumes.");
  }
  const sourceName = config.volumes?.[source.source]?.name;
  const targetName = config.volumes?.[target.source]?.name;
  if (!sourceName || !targetName || sourceName === targetName) throw new Error("Distinct named volumes are required.");
  const { POSTGRES_USER: user, POSTGRES_PASSWORD: password, POSTGRES_DB: database } = service.environment ?? {};
  if (!user || !password || !database)
    throw new Error("POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB must be set.");
  return { sourceName, targetName, user, password, database };
}

function docker(args, options = {}) {
  try {
    return execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options });
  } catch (error) {
    // Do not include command arguments: container environment arguments contain credentials.
    throw new Error(
      `Docker ${args[0]} failed: ${error.stderr?.toString().trim() || "check Docker and container logs"}`,
    );
  }
}

async function waitForDatabase(container, user, database, executeDocker) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      executeDocker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", user, "-d", database]);
      return;
    } catch {
      await new Promise((done) => setTimeout(done, 1000));
    }
  }
  throw new Error(`Database did not become ready: inspect docker logs ${container}`);
}

export async function upgrade(options, executeDocker = docker) {
  const compose = ["compose", ...options.composeArgs];
  const config = JSON.parse(executeDocker([...compose, "config", "--format", "json"]));
  const { sourceName, targetName, user, password, database } = migrationVolumes(config);
  executeDocker(["volume", "inspect", sourceName]);
  executeDocker(["pull", image]);
  executeDocker(["pull", "postgres:16-alpine"]);
  const sourceVersion = executeDocker([
    "run",
    "--rm",
    "--network",
    "none",
    "-v",
    `${sourceName}:/data:ro`,
    "--entrypoint",
    "cat",
    image,
    "/data/PG_VERSION",
  ]).trim();
  if (sourceVersion !== "16")
    throw new Error(`Expected PostgreSQL 16 data; found ${sourceVersion}. Use a manual migration.`);
  let targetExists = true;
  try {
    executeDocker(["volume", "inspect", targetName]);
  } catch {
    targetExists = false;
  }
  if (targetExists) {
    const contents = executeDocker([
      "run",
      "--rm",
      "--network",
      "none",
      "-v",
      `${targetName}:/data:ro`,
      "--entrypoint",
      "sh",
      image,
      "-ec",
      "ls -A /data",
    ]).trim();
    if (contents)
      throw new Error(`Destination ${targetName} is not empty. Refusing to overwrite it; see recovery instructions.`);
  }
  console.log(
    `Source: ${sourceName} (PostgreSQL 16)\nDestination: ${targetName} (PostgreSQL 18)\nDatabase: ${database}`,
  );
  if (!options.execute) {
    console.log(
      "Preflight passed. Stop external writers and host watchers, drain traffic, then rerun with --execute. All services in this Compose project will be stopped; none will be restarted automatically.",
    );
    return;
  }
  const backupDirectory = options.backupDirectory ?? resolve(`postgres-upgrade-${Date.now()}`);
  mkdirSync(backupDirectory, { mode: 0o700 });
  const backup = resolve(backupDirectory, "parcelis.dump");
  const source = `parcelis-pg16-upgrade-${process.pid}`;
  const target = `parcelis-pg18-upgrade-${process.pid}`;
  const containers = [];
  const cleanupErrors = [];
  const psql = (container, sql) =>
    executeDocker(
      ["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database],
      {
        input: sql,
      },
    ).trim();
  try {
    executeDocker([...compose, "stop"]);
    if (
      executeDocker(["ps", "-q", "--filter", `volume=${sourceName}`]).trim() ||
      executeDocker(["ps", "-q", "--filter", `volume=${targetName}`]).trim()
    ) {
      throw new Error("Another container is using a database volume. Stop all writers before retrying.");
    }
    executeDocker([
      "run",
      "-d",
      "--name",
      source,
      "--network",
      "none",
      "-v",
      `${sourceName}:/var/lib/postgresql/data`,
      "postgres:16-alpine",
    ]);
    containers.push(source);
    await waitForDatabase(source, user, database, executeDocker);
    const extraDatabases = JSON.parse(
      psql(
        source,
        "SELECT coalesce(json_agg(datname ORDER BY datname), '[]'::json) FROM pg_database WHERE NOT datistemplate AND datname NOT IN ('postgres', current_database());",
      ),
    );
    const customRoles = psql(
      source,
      "SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_' AND rolname <> current_user;",
    );
    if (customRoles) throw new Error(`Custom roles detected: ${customRoles}. Use the manual migration procedure.`);
    if (extraDatabases.length) {
      console.log(
        `Other databases left in the PostgreSQL 16 volume: ${extraDatabases.map((name) => JSON.stringify(name)).join(", ")}. They will not be available on PostgreSQL 18 unless migrated separately.`,
      );
    }
    const customSchemas = psql(
      source,
      "SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public', 'information_schema');",
    );
    if (customSchemas)
      throw new Error(
        `Custom schemas detected in ${JSON.stringify(database)}: ${customSchemas}. Use the manual migration procedure.`,
      );
    const before = psql(source, snapshotSql);
    const dumpFd = openSync(backup, "wx", 0o600);
    try {
      executeDocker(["exec", source, "pg_dump", "-U", user, "-d", database, "--format=custom"], {
        stdio: ["ignore", dumpFd, "pipe"],
      });
    } finally {
      closeSync(dumpFd);
    }
    console.log(`Backup saved: ${backup}`);
    executeDocker([
      "run",
      "-d",
      "--name",
      target,
      "--network",
      "none",
      "-v",
      `${targetName}:/var/lib/postgresql`,
      "-e",
      `POSTGRES_USER=${user}`,
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      "-e",
      `POSTGRES_DB=${database}`,
      image,
    ]);
    containers.push(target);
    await waitForDatabase(target, user, database, executeDocker);
    const dumpInput = openSync(backup, "r");
    try {
      executeDocker(
        [
          "exec",
          "-i",
          target,
          "pg_restore",
          "-U",
          user,
          "-d",
          database,
          "--exit-on-error",
          "--single-transaction",
          "--no-owner",
          "--no-acl",
        ],
        { stdio: [dumpInput, "pipe", "pipe"] },
      );
    } finally {
      closeSync(dumpInput);
    }
    const after = psql(target, snapshotSql);
    if (before !== after)
      throw new Error("Table counts or sequence values differ. Destination remains blocked; keep traffic disabled.");
    psql(target, "ANALYZE;");
    writeFileSync(resolve(backupDirectory, "verification.txt"), `${before}\n`, { mode: 0o600 });
  } finally {
    for (const container of containers.reverse()) {
      try {
        executeDocker(["stop", container]);
        executeDocker(["rm", container]);
      } catch (error) {
        cleanupErrors.push(error.message);
        console.error(`Temporary container cleanup failed: ${container}. ${error.message}`);
      }
    }
  }
  if (cleanupErrors.length)
    throw new Error("Stop and remove the temporary upgrade containers before starting Compose.");
  executeDocker([
    "run",
    "--rm",
    "--network",
    "none",
    "-v",
    `${targetName}:/var/lib/postgresql`,
    "--entrypoint",
    "touch",
    image,
    marker,
  ]);
  console.log("Restore verified: public table counts and sequence values match. Original volume retained.");
  console.log(
    "Services remain stopped. Follow the guide to start PostgreSQL 18, apply Prisma migrations, and verify the app before restoring traffic.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await upgrade(parseOptions(process.argv.slice(2)));
  } catch (error) {
    console.error(
      `Upgrade stopped: ${error.message}\nDo not delete the original postgres-data volume. Keep traffic disabled and follow the recovery guide.`,
    );
    process.exitCode = 1;
  }
}
