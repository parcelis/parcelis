import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { selectPostgresIntegrationSuites } from "./postgres-integration-changes.mjs";

const selected = (files, force) => selectPostgresIntegrationSuites(files, force).map(({ suite }) => suite);
const all = ["database", "worker", "api-tokens"];

for (const [file, expected] of [
  ["apps/web/app/page.tsx", []],
  ["packages/ui/src/button.tsx", []],
  ["CONTRIBUTING.md", []],
  ["apps/api/src/status/theme.ts", []],
  ["apps/api/src/tests/invoices/invoice.test.ts", []],
  ["apps/worker/src/outbox-dispatcher.ts", ["worker"]],
  ["apps/worker/src/tests/outbox-dispatcher.integration.ts", ["worker"]],
  ["packages/jobs/src/contracts.ts", ["worker", "api-tokens"]],
  ["apps/api/src/modules/permissions.ts", ["api-tokens"]],
  ["apps/api/src/modules/api-tokens.ts", ["api-tokens"]],
  ["apps/api/src/router/public.router.ts", ["api-tokens"]],
  ["apps/api/src/app/api/v1/[...path]/route.ts", ["api-tokens"]],
  ["apps/api/src/tests/auth/session-cookie.ts", ["api-tokens"]],
  ["apps/api/src/tests/api-tokens/api-tokens.integration.ts", ["api-tokens"]],
  ["apps/api/package.json", ["api-tokens"]],
  ["packages/schemas/src/index.ts", ["api-tokens"]],
  ["packages/email/src/service.ts", ["api-tokens"]],
  ["packages/db/src/outbox.ts", all],
  ["packages/db/prisma/schema.prisma", all],
  ["packages/db/prisma/migrations/example/migration.sql", all],
  ["scripts/outbox-test-database.mjs", all],
  ["scripts/prisma-with-env.mjs", all],
  ["scripts/postgres-integration-changes.mjs", all],
  ["scripts/postgres-integration-changes.test.mjs", all],
  [".github/workflows/postgres-integration.yml", all],
  ["pnpm-lock.yaml", all],
  ["package.json", all],
  ["packages/config/tsconfig.base.json", all],
  [".npmrc", all],
]) {
  test(`selects suites for ${file}`, () => assert.deepEqual(selected([file]), expected));
}

test("combines changes without duplicate suites and supports manual runs", () => {
  assert.deepEqual(selected([]), []);
  assert.deepEqual(selected([], true), all);
  assert.deepEqual(
    selected([
      "apps/worker/src/outbox-dispatcher.ts",
      "apps/api/src/modules/api-tokens.ts",
      "apps/api/src/router/context.ts",
    ]),
    ["worker", "api-tokens"],
  );
});

test("CLI compares PR merge bases, includes removed paths, and handles pushes and manual runs", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "postgres-suite-changes-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  const cli = new URL("./postgres-integration-changes.mjs", import.meta.url);
  const run = (name, event) => {
    const eventFile = join(directory, "event.json");
    const outputFile = join(directory, "output.txt");
    writeFileSync(eventFile, JSON.stringify(event));
    writeFileSync(outputFile, "");
    execFileSync(process.execPath, [cli.pathname], {
      cwd: directory,
      env: { ...process.env, GITHUB_EVENT_NAME: name, GITHUB_EVENT_PATH: eventFile, GITHUB_OUTPUT: outputFile },
    });
    return Object.fromEntries(
      readFileSync(outputFile, "utf8")
        .trim()
        .split("\n")
        .map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );
  };
  git("init", "-q");
  git("config", "user.email", "test@example.test");
  git("config", "user.name", "Test");
  writeFileSync(join(directory, "package.json"), "{}");
  git("add", "package.json");
  git("commit", "-qm", "initial");
  const initial = git("rev-parse", "HEAD");
  git("checkout", "-qb", "feature");
  writeFileSync(join(directory, "README.md"), "Documentation");
  git("add", "README.md");
  git("commit", "-qm", "docs");
  const head = git("rev-parse", "HEAD");
  git("checkout", "-qb", "base", initial);
  writeFileSync(join(directory, ".npmrc"), "strict-peer-dependencies=false");
  git("add", ".npmrc");
  git("commit", "-qm", "base config");
  const base = git("rev-parse", "HEAD");
  assert.equal(
    run("pull_request", { pull_request: { base: { sha: base }, head: { sha: head } } })["run-tests"],
    "false",
  );
  assert.equal(run("push", { before: initial, after: base })["run-tests"], "true");
  git("mv", ".npmrc", "config-archive.txt");
  git("commit", "-qm", "move config");
  const moved = git("rev-parse", "HEAD");
  assert.equal(run("push", { before: base, after: moved })["run-tests"], "true");
  assert.equal(JSON.parse(run("workflow_dispatch", {}).matrix).include.length, 3);
  assert.equal(JSON.parse(run("push", { before: "0".repeat(40), after: head }).matrix).include.length, 3);
});
