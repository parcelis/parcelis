import assert from "node:assert/strict";
import test from "node:test";
import { migrationVolumes, parseOptions } from "./upgrade-postgres.mjs";

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
