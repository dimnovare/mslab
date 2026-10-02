import type { PlaywrightTestConfig } from "@playwright/test";
import { LOCAL_ENV } from "../local-secrets";
import { PROD_ENV } from "./prod-build";
import { LOCAL_URL, PROD_BUILD, PROD_PORT, PROD_URL, TARGET } from "./target";

/**
 * The server both Playwright configs start (tests/e2e/target.ts):
 * - E2E_PROD_BUILD=1: a fresh production build of the working tree, `next build && next start` on PROD_URL, with the
 *   local settings and the production build's switches (prod-build.ts). Never a server that is already running: it
 *   would not be this build, or not have the switches;
 * - a deployment (E2E_BASE_URL): none;
 * - otherwise `next dev` on LOCAL_URL; a dev server already running is used as it is.
 * The local settings (the local database and the placeholder admin allow-list of .env.example that the tests sign in
 * with) win over a .env.local of your own.
 */
export function e2eWebServer(): PlaywrightTestConfig["webServer"] {
  if (PROD_BUILD)
    return { command: `npm run build && npm run start -- --port ${PROD_PORT}`, url: PROD_URL, reuseExistingServer: false, timeout: 600_000, env: { ...LOCAL_ENV, ...PROD_ENV } };
  if (TARGET) return undefined;
  return { command: "npm run dev", url: LOCAL_URL, reuseExistingServer: !process.env.CI, timeout: 180_000, env: LOCAL_ENV };
}
