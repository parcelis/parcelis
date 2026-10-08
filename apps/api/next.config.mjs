import { config } from "dotenv";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apiRoot = dirname(fileURLToPath(import.meta.url));
const apiRequire = createRequire(import.meta.url);
const bullBoardRequire = createRequire(apiRequire.resolve("@bull-board/api"));
const bullBoardUiRoot = dirname(bullBoardRequire.resolve("@bull-board/ui/package.json"));
config({ path: resolve(repositoryRoot, ".env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
  serverExternalPackages: ["argon2", "@react-pdf/renderer", "@bull-board/api", "@bull-board/hono"],
  outputFileTracingRoot: repositoryRoot,
  outputFileTracingIncludes: {
    "/admin/jobs/**": [`${relative(apiRoot, bullBoardUiRoot)}/dist/**/*`],
  },
  turbopack: { root: repositoryRoot },
};

export default nextConfig;
