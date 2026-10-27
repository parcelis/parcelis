import assert from "node:assert/strict";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { migrationVolumes, parseOptions, upgrade } from "./upgrade-postgres.mjs";

const config = () => ({
  services: {
    "postgres-service": {
      image: "postgres:18-alpine",
      environment: {
        POSTGRES_USER: "parcelis",
        POSTGRES_PASSWORD: "private-password-fixture",
        POSTGRES_DB: "parcelis",
      },
      volumes: [
        { type: "volume", source: "postgres-data", target: "/legacy" },
        { type: "volume", source: "postgres18-data", target: "/var/lib/postgresql" },
      ],
    },
  },
  volumes: { "postgres-data": { name: "project_old" }, "postgres18-data": { name: "project_new" } },
});

test("upgrade defaults to preflight and preserves Compose project selection", () => {
  assert.deepEqual(parseOptions(["--", "-p", "existing", "-f", "docker-compose.yml"]), {
    execute: false,
    backupDirectory: undefined,
    composeArgs: ["-p", "existing", "-f", "docker-compose.yml"],
  });
  assert.equal(parseOptions(["--execute"]).execute, true);
  assert.throws(() => parseOptions(["--backup-dir"]));
  assert.throws(() => parseOptions(["--force"]));
});

test("upgrade resolves exact volume names and rejects unsafe layouts", () => {
  assert.equal(migrationVolumes(config()).sourceName, "project_old");
  const same = config();
  same.volumes["postgres18-data"].name = "project_old";
  assert.throws(() => migrationVolumes(same), /Distinct/);
  const bind = config();
  bind.services["postgres-service"].volumes[0].type = "bind";
  assert.throws(() => migrationVolumes(bind), /named/);
  const old = config();
  old.services["postgres-service"].image = "postgres:16-alpine";
  assert.throws(() => migrationVolumes(old), /updated/);
});

function mockMigration(t, failedCleanup) {
  const directory = mkdtempSync(resolve(tmpdir(), "parcelis-upgrade-cleanup-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const calls = [];
  const messages = [];
  const secrets = [];
  t.mock.method(console, "log", (message) => messages.push(message));
  t.mock.method(console, "error", (message) => messages.push(message));
  const executeDocker = (args, options) => {
    calls.push(args);
    const mountSuffix = ":/run/secrets/postgres-password:ro";
    const secretMount = args.find((arg) => arg.endsWith(mountSuffix));
    if (secretMount) {
      const path = secretMount.slice(0, -mountSuffix.length);
      const fd = openSync(path, "r");
      t.after(() => closeSync(fd));
      secrets.push({
        path,
        fd,
        password: readFileSync(path, "utf8"),
        mode: statSync(path).mode & 0o777,
        directoryMode: statSync(dirname(path)).mode & 0o777,
      });
    }
    if (args[0] === failedCleanup?.[0] && args[1] === failedCleanup?.[1]) {
      throw new Error("Simulated cleanup failure");
    }
    if (args.includes("config")) return JSON.stringify(config());
    if (args[0] === "volume" && args[2] === "project_new") throw new Error("No destination volume");
    if (args.includes("/data/PG_VERSION")) return "16";
    if (options?.input?.includes("json_agg(datname")) return "[]";
    return "";
  };
  return { calls, messages, secrets, backupDirectory: resolve(directory, "backup"), executeDocker };
}

for (const container of ["pg16", "pg18"]) {
  for (const command of ["stop", "rm"]) {
    test(`readiness stays blocked when ${command} fails for ${container}`, async (t) => {
      const failedContainer = `parcelis-${container}-upgrade-${process.pid}`;
      const fixture = mockMigration(t, [command, failedContainer]);
      await assert.rejects(
        upgrade({ execute: true, composeArgs: [], backupDirectory: fixture.backupDirectory }, fixture.executeDocker),
        /Stop and remove/,
      );
      assert.equal(
        fixture.calls.some((args) => args.includes("/var/lib/postgresql/.parcelis-pg18-migrated")),
        false,
      );
      assert.equal(
        fixture.messages.some((message) => message.includes("Restore verified")),
        false,
      );
      const other = `parcelis-${container === "pg16" ? "pg18" : "pg16"}-upgrade-${process.pid}`;
      assert.ok(fixture.calls.some((args) => args[0] === "rm" && args[1] === other));
      assert.equal(fixture.secrets.length, 1);
      assert.equal(existsSync(fixture.secrets[0].path), false);
      assert.equal(readFileSync(fixture.secrets[0].fd, "utf8"), "");
    });
  }
}

test("destination becomes ready only after both upgrade containers are removed", async (t) => {
  const fixture = mockMigration(t);
  await upgrade({ execute: true, composeArgs: [], backupDirectory: fixture.backupDirectory }, fixture.executeDocker);
  const readyIndex = fixture.calls.findIndex((args) => args.includes("/var/lib/postgresql/.parcelis-pg18-migrated"));
  assert.ok(readyIndex >= 0);
  for (const container of ["pg16", "pg18"]) {
    const removedIndex = fixture.calls.findIndex(
      (args) => args[0] === "rm" && args[1] === `parcelis-${container}-upgrade-${process.pid}`,
    );
    assert.ok(removedIndex >= 0 && removedIndex < readyIndex);
  }
  assert.ok(fixture.messages.some((message) => message.includes("Restore verified")));
});

test("temporary database receives a protected password file, which cleanup clears and removes", async (t) => {
  const fixture = mockMigration(t);
  await upgrade({ execute: true, composeArgs: [], backupDirectory: fixture.backupDirectory }, fixture.executeDocker);
  const password = config().services["postgres-service"].environment.POSTGRES_PASSWORD;
  assert.equal(JSON.stringify(fixture.calls).includes(password), false);
  const targetStart = fixture.calls.find(
    (args) => args.includes(`parcelis-pg18-upgrade-${process.pid}`) && args[0] === "run",
  );
  assert.ok(targetStart.includes("POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password"));
  assert.equal(fixture.secrets.length, 1);
  const secret = fixture.secrets[0];
  assert.equal(secret.password, password);
  assert.equal(secret.mode, 0o600);
  assert.equal(secret.directoryMode, 0o700);
  assert.equal(existsSync(dirname(secret.path)), false);
  assert.equal(readFileSync(secret.fd, "utf8"), "");
});

test("password file is cleared and removed if temporary destination startup fails", async (t) => {
  const fixture = mockMigration(t);
  const executeDocker = (args, options) => {
    const result = fixture.executeDocker(args, options);
    if (args[0] === "run" && args.includes(`parcelis-pg18-upgrade-${process.pid}`))
      throw new Error("Destination startup failed");
    return result;
  };
  await assert.rejects(
    upgrade({ execute: true, composeArgs: [], backupDirectory: fixture.backupDirectory }, executeDocker),
    /Destination startup failed/,
  );
  assert.equal(fixture.secrets.length, 1);
  assert.equal(existsSync(dirname(fixture.secrets[0].path)), false);
  assert.equal(readFileSync(fixture.secrets[0].fd, "utf8"), "");
});
