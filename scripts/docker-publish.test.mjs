import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("release publishing covers every Parcelis runtime image used by Compose", () => {
  const workflow = readFileSync(new URL("../.github/workflows/publish-docker-images.yml", import.meta.url), "utf8");
  assert.match(workflow, /images: parcelis\/\$\{\{ matrix\.image \}\}/);
  const published = new Set(Array.from(workflow.matchAll(/^\s+- image: (\S+)/gm), ([, image]) => `parcelis/${image}`));
  const services = new Set(["app-service", "migrate-service", "worker-service", "docs-service", "proxy-service"]);
  for (const file of ["docker-compose.yml", "docker-compose-single-image.yml"]) {
    const compose = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    let checked = 0;
    for (const [, service, image] of compose.matchAll(/^ {2}([\w-]+):\n {4}image: ([^:\s]+):/gm)) {
      if (!services.has(service)) continue;
      assert.ok(published.has(image), `${file}: ${service} uses ${image}, which CI does not publish`);
      checked++;
    }
    assert.equal(checked, file === "docker-compose.yml" ? 5 : 3);
  }
  assert.match(workflow, /- image: apps\n\s+file: Dockerfile\.app\n\s+target: app\n/);
});
