import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };
const phone = { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

/**
 * Specs that change the public site's content (a seed course's title, badge, gallery and order; sessions in the
 * calendar). They restore everything afterwards, but while they run another test could see the change (the catalogue
 * counts 6 cards, the calendar 8 rows). So they run after all other tests: "chromium-edit" and "mobile-edit" are the
 * teardown projects of "before-edits-*", on which "chromium" and "mobile" depend, and a teardown starts only when every
 * project depending on its setup has finished. Unlike `dependencies`, a teardown also runs when an earlier test failed.
 */
const EDITS = /admin-edit\.spec\.ts$/;
const ORDER = /order\.setup\.ts$/;

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  // Seat fixtures (full / few sessions) in the local dev DB for the calendar tests; removed again afterwards.
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: { baseURL },
  projects: [
    { name: "before-edits-desktop", testMatch: ORDER, teardown: "chromium-edit" },
    { name: "before-edits-mobile", testMatch: ORDER, teardown: "mobile-edit" },
    { name: "chromium", use: desktop, testIgnore: EDITS, dependencies: ["before-edits-desktop", "before-edits-mobile"] },
    { name: "mobile", use: phone, testIgnore: EDITS, dependencies: ["before-edits-desktop", "before-edits-mobile"] },
    { name: "chromium-edit", use: desktop, testMatch: EDITS },
    { name: "mobile-edit", use: phone, testMatch: EDITS },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: !process.env.CI, timeout: 180_000 },
});
