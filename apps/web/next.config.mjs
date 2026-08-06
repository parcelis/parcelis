import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/trpc/:path*",
        destination: `${apiUrl}/trpc/:path*`,
      },
    ];
  },
  transpilePackages: ["@parcelis/ui", "@parcelis/schemas"],
};

export default nextConfig;
