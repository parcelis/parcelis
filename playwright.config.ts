import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT ?? "30000";
const localBaseURL = `http://127.0.0.1:${port}`;
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? localBaseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_TEST_BASE_URL
    ? undefined
    : {
        command: "pnpm --filter @parcelis/web dev:fixed",
        env: { PORT: port },
        url: localBaseURL,
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
