import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
config({ path: resolve(repositoryRoot, ".env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
  serverExternalPackages: ["argon2", "@react-pdf/renderer"],
  typescript: { tsconfigPath: "tsconfig.next.json" },
  turbopack: { root: repositoryRoot },
};

export default nextConfig;
