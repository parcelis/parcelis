import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Docker keeps direct proxy routes and application listeners on matching API ports", () => {
  const dockerfile = readFileSync(new URL("../Dockerfile.app", import.meta.url), "utf8");
  const defaultPort = dockerfile.match(/^ARG API_INTERNAL_PORT=(\d+)$/m)?.[1];
  assert.ok(defaultPort);
  assert.match(dockerfile, /sed -i "s\/__API_INTERNAL_PORT__\/\$\{API_INTERNAL_PORT\}\/g"/);
  const proxyDockerfile = readFileSync(new URL("../infra/docker/proxy/Dockerfile", import.meta.url), "utf8");
  assert.equal(proxyDockerfile.match(/^ARG API_INTERNAL_PORT=(\d+)$/m)?.[1], defaultPort);
  for (const port of [defaultPort, "4100"]) {
    const render = (file) => execFileSync("sed", [`s/__API_INTERNAL_PORT__/${port}/g`, file], { encoding: "utf8" });
    const modularSupervisor = render(new URL("../infra/docker/app/supervisord.conf", import.meta.url).pathname);
    const proxy = render(new URL("../infra/docker/proxy/nginx.conf", import.meta.url).pathname);
    assert.match(modularSupervisor, new RegExp(`API_PORT="${port}",API_HOSTNAME="0\\.0\\.0\\.0"`));
    assert.match(modularSupervisor, /--hostname 0\.0\.0\.0 --port 3001/);
    assert.ok(!modularSupervisor.includes("[program:nginx]"));
    assert.ok(!proxy.includes("__API_INTERNAL_PORT__"));
    for (const location of ["^~ /api/", "^~ /admin/jobs/", "= /trpc/bugReports.submit", "^~ /trpc/"]) {
      assert.ok(
        proxy.includes(
          `location ${location} {\n${location.includes("bugReports") ? "    client_max_body_size 16m;\n" : ""}    proxy_pass http://app-service:${port};`,
        ),
        location,
      );
    }
    assert.ok(proxy.includes(`proxy_pass http://app-service:${port}/api/v1/health;`));
    assert.ok(proxy.includes("location / {\n    proxy_pass http://app-service:3001;"));
    assert.ok(proxy.includes("proxy_pass http://docs-service/;"));

    const nginx = render(new URL("../infra/docker/single-image/nginx.conf", import.meta.url).pathname);
    const supervisor = render(new URL("../infra/docker/single-image/supervisord.conf", import.meta.url).pathname);
    const apiPort = supervisor.match(/environment=API_PORT="(\d+)"/)?.[1];
    assert.equal(apiPort, port);
    const upstreamPorts = Array.from(nginx.matchAll(/proxy_pass http:\/\/127\.0\.0\.1:(\d+);/g), ([, value]) => value);
    assert.deepEqual(upstreamPorts, [apiPort, apiPort, apiPort, apiPort, "3001"]);
    assert.ok(!nginx.includes("__API_INTERNAL_PORT__"));
    assert.ok(!supervisor.includes("__API_INTERNAL_PORT__"));
    assert.ok(supervisor.includes("[program:nginx]"));
    assert.ok(supervisor.includes('API_HOSTNAME="127.0.0.1"'));
    assert.ok(nginx.includes(`proxy_pass http://127.0.0.1:${apiPort}/api/v1/health;`));
  }
});
