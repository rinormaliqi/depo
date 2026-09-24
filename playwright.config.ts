import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive a real browser against a local dev server on the
// local Docker Postgres, seeded by `pnpm db:seed:dev`. They never point at
// a deployed instance: the specs create, edit and delete records, and the
// seed's twelve Test1234! accounts only exist locally.
//
// The node --test suite (`pnpm test`) covers server actions directly; these
// cover what only a browser can — navigation, forms, the builder canvas,
// file uploads, printing and role-specific UI.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "sq",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // The worker UI is mobile-first (#58) and the scanner is camera-first,
    // so the worker journeys run on a phone viewport instead.
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /worker|scanner/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
