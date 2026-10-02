import { defineConfig, devices } from "@playwright/test";
import { LOCAL_URL, TARGET } from "./tests/e2e/target";
import { LOCAL_ENV } from "./tests/local-secrets";

// The visual suite (Task 16): every public page, ET and RU, at the four check widths. Each page is screenshotted in full
// to visual-shots/<local|remote>/<width>/<page>.png (git-ignored) and checked for horizontal overflow and console
// errors. Read-only: against a deployment (BASE_URL / E2E_BASE_URL) it only reads pages, and every POST is blocked.
//   npm run visual                                                      (local dev server, local DB fixtures)
//   BASE_URL=https://mslab-web.dim-novare.workers.dev npm run visual    (a deployment)
// Run it on its own, not at the same time as the e2e suite: both put the same seat fixtures into the local database.

const baseURL = TARGET || LOCAL_URL;
const chrome = devices["Desktop Chrome"];

export default defineConfig({
  testDir: "tests/visual",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results/visual",
  globalSetup: "./tests/visual/global-setup.ts",
  globalTeardown: "./tests/visual/global-teardown.ts",
  timeout: 90_000,
  use: { baseURL, reducedMotion: "reduce" }, // the first hero slide, no autoplay or entrance motion: stable pictures
  projects: [
    { name: "w390", use: { ...chrome, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "w834", use: { ...chrome, viewport: { width: 834, height: 1112 }, hasTouch: true } },
    { name: "w1440", use: { ...chrome, viewport: { width: 1440, height: 900 } } },
    { name: "w2560", use: { ...chrome, viewport: { width: 2560, height: 1300 } } },
  ],
  webServer: TARGET ? undefined : { command: "npm run dev", url: baseURL, reuseExistingServer: !process.env.CI, timeout: 180_000, env: LOCAL_ENV },
});
