// The coming-soon gate's own e2e run (playwright.gate.config.ts, tests/e2e/gate.spec.ts): a production build of this working
// tree on its own port, started with SITE_GATE=1 and the made-up preview key below. Placeholders only, local only: the real
// PREVIEW_SECRET is an Environment Variable of the Vercel project.

/** Its own port (E2E_GATE_PORT to move it): never the dev server's 3000 or the production-build run's 3100. */
export const GATE_PORT = Number(process.env.E2E_GATE_PORT ?? 3200);
export const GATE_URL = `http://localhost:${GATE_PORT}`;

/** The preview cookie's key on that server; the tests sign their own cookies with it. Not a secret: a local test value. */
export const GATE_PREVIEW_SECRET = "e2e-preview-secret-not-a-real-one-0123456789";

/**
 * Set by playwright.gate.config.ts: gate.spec.ts runs only then (the main e2e run's server has no gate) and skips otherwise.
 * Read when asked, not at import: the config imports this file before it sets the variable.
 */
export const gateRun = (): boolean => process.env.E2E_SITE_GATE === "1";
