import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function createDockerHubDescription(markdown, description, repository, revision) {
  if (!description?.trim() || description.length > 100) {
    throw new Error("Docker Hub descriptions must contain 1–100 characters.");
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? "")) {
    throw new Error("GITHUB_REPOSITORY must identify the source owner and repository.");
  }
  if (!/^[a-f\d]{40}$/i.test(revision ?? "")) {
    throw new Error("GITHUB_SHA must be a full commit SHA.");
  }
  if (!markdown.trim()) {
    throw new Error("Docker Hub overviews cannot be empty.");
  }
  const baseUrl = `https://raw.githubusercontent.com/${repository}/${revision}/assets/docker/hub/`;
  const fullDescription = markdown.replace(
    /\.\.\/\.\.\/\.\.\/assets\/docker\/hub\/([^"'<>\)\r\n]+)/g,
    (_match, path) => baseUrl + path.split("/").map(encodeURIComponent).join("/"),
  );
  return { description, full_description: fullDescription };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [readmePath, description] = process.argv.slice(2);
  if (!readmePath) {
    throw new Error("Usage: node scripts/docker-hub-description.mjs <readme> <description>");
  }
  const payload = createDockerHubDescription(
    readFileSync(readmePath, "utf8"),
    description,
    process.env.GITHUB_REPOSITORY,
    process.env.GITHUB_SHA,
  );
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
