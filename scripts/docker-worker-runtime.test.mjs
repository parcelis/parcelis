import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

test("worker runtime includes the compiled schemas module imported by jobs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "parcelis-worker-runtime-"));
  const build = join(directory, "build");
  const runtime = join(directory, "runtime");
  try {
    for (const name of ["schemas", "jobs"]) {
      const packageDirectory = join(build, "packages", name);
      await mkdir(join(packageDirectory, "dist"), { recursive: true });
      await cp(new URL(`../packages/${name}/package.json`, import.meta.url), join(packageDirectory, "package.json"));
      await cp(new URL(`../packages/${name}/src`, import.meta.url), join(packageDirectory, "src"), { recursive: true });
      const module = name === "schemas" ? "invoice-balances" : "lease-dates";
      const source = await readFile(join(packageDirectory, "src", `${module}.ts`), "utf8");
      const { outputText } = transpileModule(source, {
        compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
      });
      await writeFile(join(packageDirectory, "dist", `${module}.js`), outputText);
    }

    const dockerfile = await readFile(new URL("../Dockerfile.app", import.meta.url), "utf8");
    const workerStage = dockerfile.split(/^FROM base AS worker$/m)[1]?.split(/^FROM /m)[0];
    assert.ok(workerStage);
    for (const [, source, destination] of workerStage.matchAll(
      /^COPY --from=worker-build \/repo\/(packages\/(?:schemas|jobs)\/\S+) (\S+)$/gm,
    )) {
      await mkdir(dirname(join(runtime, destination)), { recursive: true });
      await cp(join(build, source), join(runtime, destination), { recursive: true });
    }
    await mkdir(join(runtime, "node_modules", "@parcelis"), { recursive: true });
    await symlink("../../packages/schemas", join(runtime, "node_modules", "@parcelis", "schemas"), "dir");
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        'import assert from "node:assert/strict"; import { getCalendarDate } from "./packages/jobs/dist/lease-dates.js"; assert.equal(getCalendarDate(new Date("2026-11-01T03:00:00Z"), "America/Chicago"), "2026-10-31");',
      ],
      { cwd: runtime, stdio: "pipe" },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
