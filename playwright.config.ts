import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const port = new URL(baseURL).port || "3000";
const channel = process.env.E2E_BROWSER_CHANNEL as
  | "chrome"
  | "msedge"
  | undefined;

export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.e2e.{ts,tsx}",
  timeout: 60_000,
  use: {
    baseURL,
    headless: true,
    channel,
  },
  webServer: {
    command: `npx next dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
