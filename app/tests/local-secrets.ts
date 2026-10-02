import { readFileSync } from "node:fs";
import { join } from "node:path";

// The settings of local development and the tests, read from .env.example: placeholders, never a real address (the real
// ones are Environment Variables of the Vercel project). playwright.config.ts hands them to the dev server it starts.

/** KEY=VALUE lines of a .env-style file (comments and blank lines skipped). */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const vars = parseEnvFile(readFileSync(join(process.cwd(), ".env.example"), "utf8"));
for (const key of ["DATABASE_URL", "ADMIN_EMAILS", "ADMIN_NAMES", "MARIA_EMAIL"]) if (!vars[key]) throw new Error(`.env.example: ${key} is missing`);

/**
 * What the dev server of an e2e run is started with (server/env.ts): the local database and the admin allow-list the
 * tests sign in with. These win over a .env.local of your own, so a run is the same on every machine.
 */
export const LOCAL_ENV = { DATABASE_URL: vars.DATABASE_URL, ADMIN_EMAILS: vars.ADMIN_EMAILS, ADMIN_NAMES: vars.ADMIN_NAMES, MARIA_EMAIL: vars.MARIA_EMAIL };

/** The local allow-list, in order: the e2e tests sign in as the first one only. */
export const LOCAL_ADMINS = vars.ADMIN_EMAILS.split(",").map((a) => a.trim());
