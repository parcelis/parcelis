import { config } from "dotenv";
import type { NextConfig } from "next";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const { documentationRedirects } = createRequire(resolve(__dirname, "next.config.ts"))("./documentation-redirects.ts");

config({ path: resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  experimental: { proxyClientMaxBodySize: "17mb" },
  transpilePackages: ["@parcelis/ui", "@parcelis/schemas"],
  async redirects() {
    return [
      ...documentationRedirects,
      {
        source: "/settings/organization",
        destination: "/settings/organization/general",
        permanent: true,
      },
      {
        source: "/o/:organizationSlug/settings/organization",
        destination: "/o/:organizationSlug/settings/organization/general",
        permanent: true,
      },
      {
        source: "/settings",
        destination: "/settings/security/users",
        permanent: true,
      },
      {
        source: "/settings/roles",
        destination: "/settings/security/roles",
        permanent: true,
      },
      {
        source: "/o/:organizationSlug/settings",
        destination: "/o/:organizationSlug/settings/security/users",
        permanent: true,
      },
      {
        source: "/o/:organizationSlug/settings/roles",
        destination: "/o/:organizationSlug/settings/security/roles",
        permanent: true,
      },
    ];
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
    root: resolve(__dirname, "../.."),
  },
};

export default nextConfig;
