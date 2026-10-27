import assert from "node:assert/strict";
import test from "node:test";
import { runPostgresCompose } from "./compose-postgres.mjs";

test("failed PostgreSQL startup displays container logs and migration guidance", (t) => {
  const messages = [];
  t.mock.method(console, "error", (message) => messages.push(message));
  const failure = new Error("container exited");
  const calls = [];
  const runCompose = (args) => {
    calls.push(args);
    if (args[0] === "up") throw failure;
    console.error("Existing database detected; startup blocked to protect your data.");
  };
  assert.throws(
    () => runPostgresCompose(runCompose, ["up", "-d", "--wait", "postgres-service"]),
    (error) => error === failure,
  );
  assert.deepEqual(calls[1], ["logs", "--no-color", "--tail", "30", "postgres-service"]);
  assert.match(messages.join("\n"), /Existing database detected/);
  assert.match(messages.join("\n"), /https:\/\/docs.parcelis.dev\/getting-started\/upgrade-postgresql/);
  assert.match(messages.join("\n"), /node scripts\/upgrade-postgres.mjs -- -f docker-compose-dev.yml/);
});

test("migration guidance remains visible when Docker cannot return logs", (t) => {
  const messages = [];
  t.mock.method(console, "error", (message) => messages.push(message));
  assert.throws(() =>
    runPostgresCompose(() => {
      throw new Error("Docker unavailable");
    }, ["up"]),
  );
  assert.match(messages.join("\n"), /Could not read PostgreSQL container logs/);
  assert.match(messages.join("\n"), /Migration preflight/);
});
