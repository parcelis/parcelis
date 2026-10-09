import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Docker renders matching API ports into nginx and Supervisor", () => {
  const dockerfile = readFileSync(new URL("../Dockerfile.app", import.meta.url), "utf8");
  const defaultPort = dockerfile.match(/^ARG API_INTERNAL_PORT=(\d+)$/m)?.[1];
  assert.ok(defaultPort);
  assert.match(dockerfile, /sed -i "s\/__API_INTERNAL_PORT__\/\$\{API_INTERNAL_PORT\}\/g"/);
  assert.match(dockerfile, /\/etc\/nginx\/http\.d\/default\.conf \/etc\/supervisord\.conf/);
  for (const port of [defaultPort, "4100"]) {
    const render = (file) => execFileSync("sed", [`s/__API_INTERNAL_PORT__/${port}/g`, file], { encoding: "utf8" });
    const nginx = render(new URL("../infra/docker/app/nginx.conf", import.meta.url).pathname);
    const supervisor = render(new URL("../infra/docker/app/supervisord.conf", import.meta.url).pathname);
    const apiPort = supervisor.match(/environment=API_PORT="(\d+)"/)?.[1];
    assert.equal(apiPort, port);
    const upstreamPorts = Array.from(nginx.matchAll(/proxy_pass http:\/\/127\.0\.0\.1:(\d+);/g), ([, value]) => value);
    assert.deepEqual(upstreamPorts, [apiPort, apiPort, apiPort, "3001"]);
    assert.ok(!nginx.includes("__API_INTERNAL_PORT__"));
    assert.ok(!supervisor.includes("__API_INTERNAL_PORT__"));
  }
});
