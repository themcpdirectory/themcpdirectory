import { defineConfig, devices } from "@playwright/test";
import { TEST_PORT } from "./e2e/setup/test-database";

const BASE_URL = `http://localhost:${TEST_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: "./e2e/setup/global-setup.ts",
  globalTeardown: "./e2e/setup/global-teardown.ts",
  webServer: {
    command: "tsx e2e/setup/start-test-server.ts",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: process.env.WEB_E2E_MODE === "production" ? 240_000 : 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
