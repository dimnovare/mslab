// The server the tests run against: E2E_BASE_URL, or BASE_URL as another name for it; unset = the local dev server.
// Both Playwright configs and fixtures.ts read it from here, so they always agree on whether the run is local (fixtures
// and form tests) or against a deployment (read-only). The worker processes inherit the normalised variable.
if (!process.env.E2E_BASE_URL && process.env.BASE_URL) process.env.E2E_BASE_URL = process.env.BASE_URL;

/** The deployment under test, or "" for the local dev server. */
export const TARGET = process.env.E2E_BASE_URL ?? "";

export const LOCAL_URL = "http://localhost:3000";

/**
 * E2E_PROD_BUILD=1: the local server (E2E_BASE_URL=http://localhost:8787) is the production build under `wrangler dev`
 * (`npx opennextjs-cloudflare build && npx wrangler dev --port 8787 --local-upstream localhost:8787 --env-file .dev.vars.example`:
 * the placeholder admin allow-list the tests sign in with), with the page
 * cache of the deployed Worker (R2, D1 and the cached-page front, all local). --local-upstream matters: without it the
 * Worker sees the custom domain as its own address, and Next.js's server-action redirects (which fetch the target page
 * from the app's own origin) would go to the live site. In this mode the admin tests sign in without the devLink (a
 * production build never returns one), the per-test visitor address also goes in CF-Connecting-IP (wrangler dev passes
 * it on; the form rate limit reads it first), and every fixture written straight to the database is followed by a
 * revalidation of all pages (a cached page would not show it; the app's own saves revalidate what they change).
 * admin-auth.spec (the devLink itself) and feedback.spec (the dev review key) need `next dev`.
 */
export const PROD_BUILD = process.env.E2E_PROD_BUILD === "1";

/** True for a server on this machine: http(s)://localhost / 127.0.0.1 / [::1], any port. */
export const isLocalTarget = (url: string): boolean => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url);

// The production-build mode signs in by writing to the database and writes the tag cache: never against a deployment.
if (PROD_BUILD && !isLocalTarget(TARGET))
  throw new Error(`e2e: E2E_PROD_BUILD=1 is for the local production build only, but E2E_BASE_URL is "${TARGET || "(unset)"}" — use http://localhost:8787`);
