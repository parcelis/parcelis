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
  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:40010";

    return [
      {
        source: "/trpc/:path*",
        destination: `${apiUrl}/trpc/:path*`,
      },
    ];
  },
};

export default nextConfig;
