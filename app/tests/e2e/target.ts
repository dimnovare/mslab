// The server the tests run against: E2E_BASE_URL, or BASE_URL as another name for it; unset = the local dev server.
// Both Playwright configs and fixtures.ts read it from here, so they always agree on whether the run is local (fixtures
// and form tests) or against a deployment (read-only). The worker processes inherit the normalised variable.
if (!process.env.E2E_BASE_URL && process.env.BASE_URL) process.env.E2E_BASE_URL = process.env.BASE_URL;

/** The deployment under test, or "" for the local dev server. */
export const TARGET = process.env.E2E_BASE_URL ?? "";

export const LOCAL_URL = "http://localhost:3000";
