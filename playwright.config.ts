import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Unreal Studio Bali smoke tests.
 * Run with: `npx playwright test`
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.PW_BASE_URL ?? "https://gen-lang-client-0678977822.web.app",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "es-ES",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari",   use: { ...devices["iPhone 13"] } },
  ],
});
