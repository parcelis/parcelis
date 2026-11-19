import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

test("status watcher reloads settings and workspace code without retaining deleted settings", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "parcelis-status-watch-"));
  const api = join(root, "apps/api");
  await mkdir(join(api, "scripts"), { recursive: true });
  await mkdir(join(api, "src/status"), { recursive: true });
  await mkdir(join(api, ".next"));
  await mkdir(join(root, ".parcelis"));
  for (const name of ["jobs", "db", "schemas"]) {
    await mkdir(join(root, "packages", name, "src"), { recursive: true });
  }
  await copyFile(new URL("../apps/api/scripts/status-dev.mjs", import.meta.url), join(api, "scripts/status-dev.mjs"));
  const runtime = join(root, ".parcelis/dev-status.json");
  await writeFile(
    join(api, "src/status/server.ts"),
    `console.log(JSON.stringify({ pid: process.pid, url: process.env.STATUS_WEB_URL }));
setInterval(() => {}, 1000);
process.once("SIGTERM", () => process.exit(0));
`,
  );
  const child = spawn(process.execPath, [join(api, "scripts/status-dev.mjs")], {
    cwd: api,
    env: { ...process.env, STATUS_WEB_URL: "http://localhost:29999/login" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let errors = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    errors += chunk;
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    await rm(root, { recursive: true, force: true });
  });
  async function waitFor(predicate) {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
      assert.ok(Date.now() < deadline, `Watcher timed out: ${output} ${errors}`);
      await delay(25);
    }
  }
  const starts = () =>
    output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  await waitFor(() => output.includes("29999") && (errors.match(/Start pnpm dev/g)?.length ?? 0) >= 1);
  assert.equal(errors.match(/Start pnpm dev/g)?.length, 1);
  await writeFile(join(api, ".next/trace"), "unrelated build update");
  await delay(400);
  assert.equal(starts().length, 1);
  async function changeAndWait(change) {
    const count = starts().length;
    await change();
    await waitFor(() => starts().length > count);
  }
  for (const port of [30001, 30002]) {
    await changeAndWait(() => writeFile(runtime, JSON.stringify({ STATUS_WEB_URL: `http://localhost:${port}/login` })));
    assert.equal(starts().at(-1).url, `http://localhost:${port}/login`);
  }
  await changeAndWait(() => writeFile(join(api, "src/probe.ts"), "export {};\n"));
  for (const name of ["jobs", "db", "schemas"]) {
    await changeAndWait(() => writeFile(join(root, "packages", name, "src/probe.ts"), "export {};\n"));
    const dist = join(root, "packages", name, "dist");
    await changeAndWait(async () => {
      await mkdir(dist);
      await writeFile(join(dist, "probe.js"), "export {};\n");
    });
  }
  await changeAndWait(() => rm(runtime));
  assert.equal(starts().at(-1).url, "http://localhost:29999/login");
  await waitFor(() => (errors.match(/Start pnpm dev/g)?.length ?? 0) >= 2);
  assert.equal(errors.match(/Start pnpm dev/g)?.length, 2);
  const processes = starts().map(({ pid }) => pid);
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await exited;
  for (const pid of processes) {
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  }
});
