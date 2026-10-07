import { defineConfig } from "@playwright/test";
import { resolveStorageState } from "./tests/e2e/session-env.ts";

const remote = process.env.BASE_URL?.trim();
const baseURL = (remote || "http://127.0.0.1:4173/").replace(/\/?$/, "/");
// Prefer a Jenkins-injected session. Unset keeps the overlay login for Pixel/manual runs.
const storageState = resolveStorageState();

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    storageState,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: process.env.CI ? "on-first-retry" : "off",
    video: "off",
  },
  webServer: remote
    ? undefined
    : {
        command: "node tests/auth-server.mjs",
        url: "http://127.0.0.1:4173/",
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
  projects: [
    {
      name: "pixel",
      testMatch: /pixel\.catalog\.spec\.ts/,
      use: {
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 2.625,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36",
      },
    },
    {
      name: "desktop",
      testMatch: /desktop\.catalog\.spec\.ts|auth\.spec\.ts/,
      use: {
        viewport: { width: 1280, height: 800 },
        isMobile: false,
        hasTouch: false,
      },
    },
  ],
});
