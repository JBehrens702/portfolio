import { defineConfig, devices } from "@playwright/test";

// Browsers come from the workspace install: run with
// PLAYWRIGHT_BROWSERS_PATH=/workspace/tools/playwright/browsers
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } } },
  ],
});
