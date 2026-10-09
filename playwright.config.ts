import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const env = {
  DATABASE_URL: "file:./e2e.db",
  SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e",
  CRON_SECRET: "e2e-cron",
  APP_BASE_URL: `http://localhost:${PORT}`,
  LINE_CHANNEL_SECRET: "e2e-line-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    launchOptions: { executablePath: process.env.PW_CHROMIUM ?? undefined },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    env,
  },
});
