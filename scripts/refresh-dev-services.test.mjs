import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

for (const service of ["proxy-service", "redis-service", "minio-service", "postgres-service"]) {
  test(`refresh scopes PostgreSQL diagnostics when ${service} fails`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), "parcelis-refresh-test-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const callsPath = join(directory, "calls.jsonl");
    writeFileSync(
      join(directory, "docker"),
      `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.CALLS_PATH, JSON.stringify(args) + "\\n");
if (args.includes("up") && args.includes(process.env.FAIL_SERVICE)) process.exit(1);
`,
      { mode: 0o700 },
    );
    const result = spawnSync(process.execPath, ["scripts/refresh-dev-services.mjs"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        CALLS_PATH: callsPath,
        FAIL_SERVICE: service,
      },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Could not refresh local services/);
    const calls = readFileSync(callsPath, "utf8").trim().split("\n").map(JSON.parse);
    const logs = calls.filter((args) => args.includes("logs"));
    if (service === "postgres-service") {
      assert.equal(logs.length, 1);
      assert.equal(logs[0].at(-1), "postgres-service");
      assert.match(result.stderr, /Migration preflight/);
      const postgresStart = calls.find((args) => args.includes("postgres-service"));
      assert.deepEqual(postgresStart.slice(3), ["up", "-d", "--wait", "--force-recreate", "postgres-service"]);
    } else {
      assert.equal(logs.length, 0);
      assert.doesNotMatch(result.stderr, /Migration preflight|upgrade-postgresql/);
    }
  });
}
