import { expect, test } from "@playwright/test";

const redirects = [
  ["/settings", "/settings/security/users"],
  ["/settings/roles", "/settings/security/roles"],
  ["/settings/organization", "/settings/organization/general"],
] as const;

for (const [source, destination] of redirects) {
  for (const prefix of ["", "/o/settings-route-test"]) {
    test(`redirects ${prefix}${source} to its grouped settings route`, async ({ request }) => {
      const response = await request.get(`${prefix}${source}?from=bookmark`, {
        maxRedirects: 0,
      });

      expect(response.status()).toBe(308);
      const location = new URL(response.headers().location!, response.url());
      expect(location.pathname).toBe(`${prefix}${destination}`);
      expect(location.searchParams.get("from")).toBe("bookmark");
    });
  }
}
