import { defineConfig, devices } from "@playwright/test";
import { LOCAL_URL, TARGET } from "./tests/e2e/target";
import { LOCAL_SECRETS } from "./tests/local-secrets";

const baseURL = TARGET || LOCAL_URL; // E2E_BASE_URL (or BASE_URL) = a deployment, read-only; else the local dev server

const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };
const phone = { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

/**
 * Specs that change the public site's content (a seed course's title, badge, gallery and order; sessions in the
 * calendar; hero slides, FAQ, practice packages, the trainer page, posts, the campaign and settings). They restore
 * everything afterwards, but while they run another test could see the change (the catalogue counts 6 cards, the
 * calendar 8 rows, the hero 5 slides). So they run after all other tests: "chromium-edit" and "mobile-edit" are the
 * teardown projects of "before-edits-*", on which "chromium" and "mobile" depend, and a teardown starts only when every
 * project depending on its setup has finished. Unlike `dependencies`, a teardown also runs when an earlier test failed.
 */
const EDITS = /admin-(edit|site)\.spec\.ts$/;
const ORDER = /order\.setup\.ts$/;
/** The visual suite has its own config: playwright.visual.config.ts (npm run visual). */
const VISUAL = /[\\/]visual[\\/]/;

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
    { name: "chromium", use: desktop, testIgnore: [EDITS, VISUAL], dependencies: ["before-edits-desktop", "before-edits-mobile"] },
    { name: "mobile", use: phone, testIgnore: [EDITS, VISUAL], dependencies: ["before-edits-desktop", "before-edits-mobile"] },
    { name: "chromium-edit", use: desktop, testMatch: EDITS },
    { name: "mobile-edit", use: phone, testMatch: EDITS },
  ],
  // The dev server gets the placeholder secrets of .dev.vars.example (the admin allow-list the tests sign in with); a
  // .dev.vars of your own takes their place, and a dev server already running is used as it is.
  webServer: TARGET
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: !process.env.CI, timeout: 180_000, env: LOCAL_SECRETS },
});
