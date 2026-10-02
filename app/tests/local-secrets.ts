import { readFileSync } from "node:fs";
import { join } from "node:path";

// The Worker secrets of local development and the tests, read from .dev.vars.example: placeholders, never a real
// address (the real ones are Worker secrets: wrangler.jsonc "secrets"). playwright.config.ts hands them to the dev
// server it starts; the local production build gets the same file with `wrangler dev --env-file .dev.vars.example`.

/** KEY=VALUE lines of a .env-style file (comments and blank lines skipped). */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const vars = parseEnvFile(readFileSync(join(process.cwd(), ".dev.vars.example"), "utf8"));
for (const key of ["ADMIN_EMAILS", "ADMIN_NAMES", "MARIA_EMAIL"]) if (!vars[key]) throw new Error(`.dev.vars.example: ${key} is missing`);

/** The secrets the app needs locally (wrangler.jsonc secrets.required). */
export const LOCAL_SECRETS = { ADMIN_EMAILS: vars.ADMIN_EMAILS, ADMIN_NAMES: vars.ADMIN_NAMES, MARIA_EMAIL: vars.MARIA_EMAIL };

/** The local allow-list, in order: the e2e tests sign in as the first one only. */
export const LOCAL_ADMINS = vars.ADMIN_EMAILS.split(",").map((a) => a.trim());
