import { defineConfig, devices } from "@playwright/test";
import { baseURL } from "./tests/e2e/fixtures/api";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e/fixtures/global-setup.ts",
  outputDir: "../output/reports/playwright-artifacts",
  reporter: [
    ["list"],
    ["html", { outputFolder: "../output/reports/playwright", open: "never" }],
    ["json", { outputFile: "../output/reports/playwright-results.json" }],
    ["junit", { outputFile: "../output/reports/playwright-results.xml" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-tablet",
      testMatch: /(compatibility|protocol|readonly|archive)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "chromium-mobile",
      testMatch: /(compatibility|protocol|readonly|archive)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: "firefox-desktop",
      testMatch: /(compatibility|protocol|readonly|archive)\.spec\.ts/,
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "firefox-tablet",
      testMatch: /(compatibility|protocol|readonly|archive)\.spec\.ts/,
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "firefox-mobile",
      testMatch: /(compatibility|protocol|readonly|archive)\.spec\.ts/,
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 360, height: 800 },
      },
    },
  ],
});
