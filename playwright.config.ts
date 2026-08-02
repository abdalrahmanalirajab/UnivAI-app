import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3117";
const port = new URL(baseURL).port || "3000";
const channel = process.env.E2E_BROWSER_CHANNEL as
  | "chrome"
  | "msedge"
  | undefined;

export default defineConfig({
  testDir: ".",
  testMatch: ["test/**/*.e2e.{ts,tsx}", "e2e/**/*.spec.ts"],
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
    env: {
      UNIVAI_MODE: "standalone",
      UNIVAI_DATA_ROOT: "./standalone",
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET: "e2e-only-placeholder-not-a-production-secret",
    },
  },
});
