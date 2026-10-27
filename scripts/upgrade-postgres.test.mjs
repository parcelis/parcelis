import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { migrationVolumes, parseOptions, upgrade } from "./upgrade-postgres.mjs";

const config = () => ({
  services: {
    "postgres-service": {
      image: "postgres:18-alpine",
      environment: { POSTGRES_USER: "parcelis", POSTGRES_PASSWORD: "test", POSTGRES_DB: "parcelis" },
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
  t.mock.method(console, "log", (message) => messages.push(message));
  t.mock.method(console, "error", (message) => messages.push(message));
  const executeDocker = (args, options) => {
    calls.push(args);
    if (args[0] === failedCleanup?.[0] && args[1] === failedCleanup?.[1]) {
      throw new Error("Simulated cleanup failure");
    }
    if (args.includes("config")) return JSON.stringify(config());
    if (args[0] === "volume" && args[2] === "project_new") throw new Error("No destination volume");
    if (args.includes("/data/PG_VERSION")) return "16";
    if (options?.input?.includes("json_agg(datname")) return "[]";
    return "";
  };
  return { calls, messages, backupDirectory: resolve(directory, "backup"), executeDocker };
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
