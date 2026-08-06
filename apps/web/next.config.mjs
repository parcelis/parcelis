import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@parcelis/ui", "@parcelis/schemas"],
  turbopack: {
    root: resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  },
};

export default nextConfig;
