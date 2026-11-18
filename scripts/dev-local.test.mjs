import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

test("local development reloads the worker when the shared billing helper changes", { timeout: 30_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "parcelis-dev-watch-"));
  const scripts = join(root, "scripts");
  const bin = join(root, "bin");
  const schemas = join(root, "packages/schemas");
  const jobs = join(root, "packages/jobs");
  const require = createRequire(import.meta.url);
  const workerRequire = createRequire(new URL("../apps/worker/package.json", import.meta.url));
  const tsc = require.resolve("typescript/lib/tsc.js");
  const tsx = workerRequire.resolve("tsx/cli");
  for (const directory of [
    scripts,
    bin,
    join(schemas, "src"),
    join(jobs, "dist"),
    join(root, "node_modules/@parcelis"),
  ]) {
    await mkdir(directory, { recursive: true });
  }
  await copyFile(new URL("./dev-local.mjs", import.meta.url), join(scripts, "dev-local.mjs"));
  await copyFile(new URL("./compose-postgres.mjs", import.meta.url), join(scripts, "compose-postgres.mjs"));
  await writeFile(join(scripts, "port-utils.mjs"), "export async function findOpenPort(port) { return port; }\n");
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  for (const name of ["schemas", "jobs"]) {
    await copyFile(
      new URL(`../packages/${name}/package.json`, import.meta.url),
      join(root, "packages", name, "package.json"),
    );
  }
  const helper = join(schemas, "src/invoice-balances.ts");
  const source = await readFile(new URL("../packages/schemas/src/invoice-balances.ts", import.meta.url), "utf8");
  await writeFile(helper, source);
  await writeFile(
    join(schemas, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "NodeNext", outDir: "dist", rootDir: "src", types: [] },
      include: ["src"],
    }),
  );
  const jobsSource = await readFile(new URL("../packages/jobs/src/lease-dates.ts", import.meta.url), "utf8");
  await writeFile(
    join(jobs, "dist/lease-dates.js"),
    transpileModule(jobsSource, {
      compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
    }).outputText,
  );
  await symlink("../../packages/schemas", join(root, "node_modules/@parcelis/schemas"), "dir");
  await writeFile(
    join(root, "probe.mjs"),
    `
import { getCalendarDate } from "./packages/jobs/dist/lease-dates.js";
console.log("WORKER_DATE=" + getCalendarDate(new Date("2026-11-01T03:00:00Z"), "America/Chicago"));
setInterval(() => {}, 1000);
`,
  );
  await writeFile(join(bin, "docker"), "#!/usr/bin/env node\n", { mode: 0o700 });
  await writeFile(
    join(bin, "pnpm"),
    `#!/usr/bin/env node
import { execFileSync } from "node:child_process";
const [, name, command] = process.argv.slice(2);
if (command === "build") {
  execFileSync(process.execPath, [${JSON.stringify(tsc)}, "-p", "packages/schemas/tsconfig.json"], { stdio: "inherit" });
} else if (name === "@parcelis/schemas") {
  process.argv = [process.execPath, ${JSON.stringify(tsc)}, "-p", "packages/schemas/tsconfig.json", "--watch", "--preserveWatchOutput"];
  await import(${JSON.stringify(pathToFileURL(tsc).href)});
} else if (name === "@parcelis/worker") {
  process.argv = [process.execPath, ${JSON.stringify(tsx)}, "watch", "--clear-screen=false", "probe.mjs"];
  await import(${JSON.stringify(pathToFileURL(tsx).href)});
} else {
  console.log("WATCHER=" + name);
  setInterval(() => {}, 1000);
}
`,
    { mode: 0o700 },
  );
  const child = spawn(process.execPath, [join(scripts, "dev-local.mjs")], {
    cwd: root,
    env: { PATH: `${bin}:${process.env.PATH}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    await rm(root, { recursive: true, force: true });
  });
  async function waitFor(text) {
    const deadline = Date.now() + 10_000;
    while (!output.includes(text)) {
      assert.ok(child.exitCode === null && Date.now() < deadline, `Missing ${text}: ${output}`);
      await delay(25);
    }
  }
  await waitFor("WORKER_DATE=2026-10-31");
  await waitFor("WATCHER=@parcelis/jobs");
  await waitFor("Found 0 errors. Watching for file changes.");
  const updated = source.replace(
    'return `${String(values.year).padStart(4, "0")}-${values.month}-${values.day}`;',
    'return "2099-12-31";',
  );
  assert.notEqual(updated, source);
  await writeFile(helper, updated);
  await waitFor("WORKER_DATE=2099-12-31");
});
