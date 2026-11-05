import { config } from "dotenv";
import { documentationRedirects } from "./documentation-redirects.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  skipTrailingSlashRedirect: true,
  experimental: { proxyClientMaxBodySize: "17mb" },
  transpilePackages: ["@parcelis/ui", "@parcelis/schemas"],
  async redirects() {
    return documentationRedirects;
  },
  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:40010";
    const statusUrl = process.env.STATUS_INTERNAL_URL || `http://localhost:${process.env.STATUS_PORT || "40020"}`;

    return [
      {
        source: "/status",
        destination: `${statusUrl}/status`,
      },
      {
        source: "/status/:path*",
        destination: `${statusUrl}/status/:path*`,
      },
      {
        source: "/api/auth/:path*",
        destination: `${apiUrl}/api/auth/:path*`,
      },
      {
        source: "/trpc/:path*",
        destination: `${apiUrl}/trpc/:path*`,
      },
      {
        source: "/admin/jobs",
        destination: `${apiUrl}/admin/jobs/`,
      },
      {
        source: "/admin/jobs/:path*",
        destination: `${apiUrl}/admin/jobs/:path*`,
      },
    ];
  },
  turbopack: {
    root: resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  },
};

export default nextConfig;
