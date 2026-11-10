import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDockerHubDescription } from "./docker-hub-description.mjs";

const repository = "parcelis/parcelis";
const revision = "0123456789abcdef0123456789abcdef01234567";
const baseUrl = `https://raw.githubusercontent.com/${repository}/${revision}/assets/docker/hub/`;

test("overview rendering converts HTML and Markdown images while preserving other content", () => {
  const markdown = [
    '<div><img src="../../../assets/docker/hub/banner.png" alt="Parcelis" /></div>',
    "![Deployment](<../../../assets/docker/hub/Deployment Architecture.png>)",
    "![Single image](../../../assets/docker/hub/single.png)",
    "[Guides](https://docs.parcelis.dev/)",
    'Quotes: "Parcelis"; backticks: `parcelis/apps`.',
  ].join("\n\n");
  const payload = createDockerHubDescription(markdown, "Parcelis Apps", repository, revision);
  const expected = markdown
    .replace("../../../assets/docker/hub/banner.png", `${baseUrl}banner.png`)
    .replace("../../../assets/docker/hub/Deployment Architecture.png", `${baseUrl}Deployment%20Architecture.png`)
    .replace("../../../assets/docker/hub/single.png", `${baseUrl}single.png`);
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    description: "Parcelis Apps",
    full_description: expected,
  });
});

test("invalid metadata cannot produce a publishing payload", () => {
  for (const description of ["", " ", "x".repeat(101)]) {
    assert.throws(() => createDockerHubDescription("Overview", description, repository, revision), /1–100/);
  }
  assert.throws(() => createDockerHubDescription("Overview", "Apps", "parcelis", revision), /GITHUB_REPOSITORY/);
  assert.throws(() => createDockerHubDescription("Overview", "Apps", repository, "main"), /GITHUB_SHA/);
  assert.throws(() => createDockerHubDescription(" \n", "Apps", repository, revision), /cannot be empty/);
});

test("the description workflow publishes all five overviews with existing commit-pinned images", () => {
  const workflow = readFileSync(new URL("../.github/workflows/docker-hub-descriptions.yml", import.meta.url), "utf8");
  const entries = Array.from(
    workflow.matchAll(/- image: (\S+)\n\s+readme: (\S+)\n\s+description: ([^\n]+)/g),
    ([, image, readme, description]) => ({ image, readme, description }),
  );
  assert.deepEqual(entries.map(({ image }) => image).sort(), ["apps", "docs", "parcelis", "proxy", "worker"]);
  assert.equal(entries.find(({ image }) => image === "parcelis").readme, "infra/docker/hub/parcelis-single.md");
  for (const { readme, description } of entries) {
    const output = execFileSync(process.execPath, ["scripts/docker-hub-description.mjs", readme, description], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, GITHUB_REPOSITORY: repository, GITHUB_SHA: revision },
      encoding: "utf8",
    });
    const payload = JSON.parse(output);
    assert.equal(payload.description, description);
    assert.doesNotMatch(payload.full_description, /\.\.\/\.\.\/\.\.\//);
    assert.match(payload.full_description, /View the diagram in Lucid/);
    const images = Array.from(
      payload.full_description.matchAll(/https:\/\/raw\.githubusercontent\.com\/[^"'<>\)\s]+/g),
      ([url]) => url,
    );
    assert.equal(images.length, 2, `${readme}: expected a banner and deployment diagram`);
    for (const url of images) {
      assert.ok(url.startsWith(baseUrl), url);
      const asset = decodeURIComponent(new URL(url).pathname.split("/").slice(4).join("/"));
      assert.ok(existsSync(new URL(`../${asset}`, import.meta.url)), `${readme}: missing ${asset}`);
    }
  }
});
