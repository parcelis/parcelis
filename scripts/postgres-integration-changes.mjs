import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sharedFiles = new Set([
  ".github/workflows/postgres-integration.yml",
  "scripts/postgres-integration-changes.mjs",
  "scripts/postgres-integration-changes.test.mjs",
  "scripts/prisma-with-env.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".npmrc",
  ".node-version",
  ".nvmrc",
  "turbo.json",
]);

const suites = [
  { suite: "database", name: "Database / outbox" },
  { suite: "worker", name: "Worker" },
  { suite: "api-tokens", name: "API tokens" },
];

export function selectPostgresIntegrationSuites(files, force = false) {
  const shared =
    force ||
    files.some(
      (file) =>
        sharedFiles.has(file) ||
        file.startsWith("packages/db/") ||
        file.startsWith("packages/config/") ||
        file.startsWith("scripts/outbox-test-database.") ||
        /^tsconfig[^/]*\.json$/.test(file),
    );
  return suites.filter(
    ({ suite }) =>
      shared ||
      files.some((file) => {
        if (suite === "worker") {
          return file.startsWith("apps/worker/") || file.startsWith("packages/jobs/");
        }
        if (suite === "api-tokens") {
          return (
            [
              "apps/api/src/router/",
              "apps/api/src/modules/",
              "apps/api/src/leases/",
              "apps/api/src/app/api/",
              "apps/api/src/app/trpc/",
              "apps/api/src/tests/api-tokens/",
              "packages/schemas/",
              "packages/email/",
              "packages/jobs/",
            ].some((prefix) => file.startsWith(prefix)) ||
            [
              "apps/api/package.json",
              "apps/api/tsconfig.json",
              "apps/api/src/load-env.ts",
              "apps/api/src/tests/auth/session-cookie.ts",
            ].includes(file)
          );
        }
        return false;
      }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const manual = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
  const pullRequest = process.env.GITHUB_EVENT_NAME === "pull_request";
  const base = pullRequest ? event.pull_request.base.sha : event.before;
  const head = pullRequest ? event.pull_request.head.sha : event.after;
  const force = manual || /^0+$/.test(base ?? "");
  let files = [];
  if (!force) {
    if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? ""))) {
      throw new Error("Expected base and head commit SHAs for change detection.");
    }
    const range = pullRequest ? [`${base}...${head}`] : [base, head];
    files = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", ...range, "--"], {
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean);
  }
  const include = selectPostgresIntegrationSuites(files, force);
  appendFileSync(process.env.GITHUB_OUTPUT, `run-tests=${include.length > 0}\nmatrix=${JSON.stringify({ include })}\n`);
  console.log(`PostgreSQL suites: ${include.map(({ name }) => name).join(", ") || "none"}`);
}
