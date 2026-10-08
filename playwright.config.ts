import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(__dirname, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const port = process.env.PORT ?? "30000";
const localBaseURL = `http://localhost:${port}`;
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? localBaseURL;
const slowMo = Number(process.env.PLAYWRIGHT_SLOW_MO ?? 0);

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
    launchOptions: { slowMo: Number.isFinite(slowMo) && slowMo >= 0 ? slowMo : 0 },
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
