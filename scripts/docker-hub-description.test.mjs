import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDockerHubDescription } from "./docker-hub-description.mjs";

const repository = "parcelis/parcelis";
const revision = "0123456789abcdef0123456789abcdef01234567";
const baseUrl = `https://raw.githubusercontent.com/${repository}/${revision}/assets/docker/hub/`;
const sourceUrl = `https://github.com/${repository}/blob/${revision}/`;

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

test("Compose and environment links use the same immutable revision as images", () => {
  const markdown = [
    "[Compose](../../../docker-compose.yml)",
    "[Single image](../../../docker-compose-single-image.yml)",
    "[Environment](../../../.env.production.example)",
    "[Other project](https://github.com/example/project/blob/main/README.md)",
  ].join("\n");
  const { full_description: overview } = createDockerHubDescription(markdown, "Apps", repository, revision);
  assert.equal(
    overview,
    [
      `[Compose](${sourceUrl}docker-compose.yml)`,
      `[Single image](${sourceUrl}docker-compose-single-image.yml)`,
      `[Environment](${sourceUrl}.env.production.example)`,
      "[Other project](https://github.com/example/project/blob/main/README.md)",
    ].join("\n"),
  );
});

test("the description workflow publishes exactly five overviews with existing commit-pinned resources", () => {
  const workflow = readFileSync(new URL("../.github/workflows/docker-hub-descriptions.yml", import.meta.url), "utf8");
  const entries = Array.from(
    workflow.matchAll(/- image: (\S+)\n\s+readme: (\S+)\n\s+description: ([^\n]+)/g),
    ([, image, readme, description]) => ({ image, readme, description }),
  );
  assert.deepEqual(entries.map(({ image }) => image).sort(), ["apps", "docs", "parcelis", "proxy", "worker"]);
  assert.equal(entries.find(({ image }) => image === "parcelis").readme, "infra/docker/hub/parcelis-single.md");
  assert.deepEqual(
    readdirSync(new URL("../infra/docker/hub", import.meta.url))
      .filter((name) => name.endsWith(".md"))
      .sort(),
    entries.map(({ readme }) => readme.split("/").at(-1)).sort(),
  );
  for (const { readme, description } of entries) {
    const output = execFileSync(process.execPath, ["scripts/docker-hub-description.mjs", readme, description], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, GITHUB_REPOSITORY: repository, GITHUB_SHA: revision },
      encoding: "utf8",
    });
    const payload = JSON.parse(output);
    assert.equal(payload.description, description);
    assert.doesNotMatch(payload.full_description, /\.\.\/\.\.\/\.\.\//);
    assert.doesNotMatch(payload.full_description, /github\.com\/parcelis\/parcelis\/blob\/main\//);
    assert.match(payload.full_description, /View the diagram in Lucid/);
    const composeFile = readme.endsWith("parcelis-single.md")
      ? "docker-compose-single-image.yml"
      : "docker-compose.yml";
    assert.ok(payload.full_description.includes(`${sourceUrl}${composeFile}`), readme);
    assert.ok(payload.full_description.includes(`${sourceUrl}.env.production.example`), readme);
    assert.ok(existsSync(new URL(`../${composeFile}`, import.meta.url)));
    assert.ok(existsSync(new URL("../.env.production.example", import.meta.url)));
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

test("single-image overview matches the linked Compose tag configuration", () => {
  const compose = readFileSync(new URL("../docker-compose-single-image.yml", import.meta.url), "utf8");
  const overview = readFileSync(new URL("../infra/docker/hub/parcelis-single.md", import.meta.url), "utf8");
  assert.doesNotMatch(compose, /PARCELIS_VERSION/);
  assert.doesNotMatch(overview, /PARCELIS_VERSION/);
  const images = Array.from(compose.matchAll(/^\s+image: (parcelis\/parcelis:\S+)/gm), ([, image]) => image);
  assert.equal(images.length, 3);
  for (const image of images) assert.ok(overview.includes(`\`${image}\``), image);
});

test("description updates authenticate with a dedicated PAT rather than the push credential", () => {
  const workflow = readFileSync(new URL("../.github/workflows/docker-hub-descriptions.yml", import.meta.url), "utf8");
  assert.match(workflow, /DOCKERHUB_DESCRIPTION_TOKEN: \$\{\{ secrets\.DOCKERHUB_DESCRIPTION_TOKEN \}\}/);
  assert.match(workflow, /secret: env\.DOCKERHUB_DESCRIPTION_TOKEN/);
  assert.doesNotMatch(workflow, /secrets\.DOCKERHUB_TOKEN/);
  const publish = readFileSync(new URL("../.github/workflows/publish-docker-images.yml", import.meta.url), "utf8");
  assert.match(publish, /password: \$\{\{ secrets\.DOCKERHUB_TOKEN \}\}/);
});
