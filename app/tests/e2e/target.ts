// The server the tests run against: E2E_BASE_URL, or BASE_URL as another name for it; unset = the local dev server.
// Both Playwright configs and fixtures.ts read it from here, so they always agree on whether the run is local (fixtures
// and form tests) or against a deployment (read-only). The worker processes inherit the normalised variable.
if (!process.env.E2E_BASE_URL && process.env.BASE_URL) process.env.E2E_BASE_URL = process.env.BASE_URL;

export const LOCAL_URL = "http://localhost:3000";

/**
 * E2E_PROD_BUILD=1: the tests run against the production build of this working tree, `next build && next start` on
 * PROD_URL (its own port, so it never meets a dev server on 3000), which the Playwright config builds and starts itself
 * (tests/e2e/server.ts) with the local settings and the switches of tests/e2e/prod-build.ts. The public pages are
 * cached there as on Vercel (incremental static regeneration). In this mode the admin tests sign in without the devLink
 * (a production build never returns one), the review comment tests use the server's ADMIN_KEY instead of the dev key,
 * and every fixture written straight to the database is followed by a revalidation of all pages (a cached page would
 * not show it; the app's own saves revalidate what they change).
 */
export const PROD_BUILD = process.env.E2E_PROD_BUILD === "1";

export const PROD_PORT = 3100;
export const PROD_URL = `http://localhost:${PROD_PORT}`;

// The production-build mode starts its own server on this machine (it signs in by writing to the local database and
// revalidates its pages): an address of another server would not be what the tests think it is.
if (PROD_BUILD && process.env.E2E_BASE_URL && process.env.E2E_BASE_URL.replace(/\/+$/, "") !== PROD_URL)
  throw new Error(`e2e: E2E_PROD_BUILD=1 builds and starts the app itself on ${PROD_URL}; leave E2E_BASE_URL unset (it is "${process.env.E2E_BASE_URL}")`);
if (PROD_BUILD) process.env.E2E_BASE_URL = PROD_URL;

/** The server under test: a deployment, the local production build (PROD_URL), or "" for the local dev server. */
export const TARGET = process.env.E2E_BASE_URL ?? "";
