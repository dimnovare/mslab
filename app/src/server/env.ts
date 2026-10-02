// The server's configuration, read from process.env (Vercel project settings; `.env.local` under `next dev`; see
// .env.example). This is the one place the server reads it, so a missing variable fails the same way everywhere.

/** The local development database (docker: postgres/postgres on this machine). Never a shared one. */
export const LOCAL_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/mslab";

export type ServerEnv = {
  /** Postgres connection URL (Railway's TCP proxy in production). */
  DATABASE_URL: string;
  /** The site's own address, for links that leave the site and the link preview tags. */
  SITE_URL: string;
  /** The sign-in allow-list, comma-separated. */
  ADMIN_EMAILS: string;
  /** The greeting name of each admin: `<address>=<name>`, comma-separated. */
  ADMIN_NAMES: string;
  /** Where form notifications go. */
  MARIA_EMAIL: string;
  /** The From header of outgoing mail. */
  MAIL_FROM: string;
  RESEND_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  /** Overrides the chat id stored in the KV under `tg:chat`. */
  TELEGRAM_CHAT_ID?: string;
  /** The access key of the review comment list. */
  ADMIN_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
};

type Source = Record<string, string | undefined>;
type RequiredName = "DATABASE_URL" | "SITE_URL" | "ADMIN_EMAILS" | "ADMIN_NAMES" | "MARIA_EMAIL" | "MAIL_FROM";

/**
 * The required variables, in the order an error lists them, each with the value `next dev` and the tests fall back to
 * when it is not set (never in production). The local database is a default so `next dev` and the e2e run need no setup.
 * SITE_URL and MAIL_FROM default to the public production values (what wrangler.jsonc's vars gave `next dev` before).
 * The addresses default to empty: nobody can sign in and nothing is sent until `.env.local` sets them (.env.example).
 */
const REQUIRED: readonly [RequiredName, string][] = [
  ["DATABASE_URL", LOCAL_DATABASE_URL],
  ["SITE_URL", "https://mslab.diipsolutions.eu"],
  ["ADMIN_EMAILS", ""],
  ["ADMIN_NAMES", ""],
  ["MARIA_EMAIL", ""],
  ["MAIL_FROM", "MS LAB <info@send.diipsolutions.eu>"],
];

/** The error for a DATABASE_URL that cannot be used. It never holds the value. */
export const BAD_DATABASE_URL = "DATABASE_URL is not a valid postgres:// or postgresql:// URL";

/**
 * Is it a postgres:// or postgresql:// URL that `new URL` accepts? (A postgres.js URL with several hosts or a socket path
 * does not parse, and is not used here.) Any other scheme is a mistake too (an http or redis address pasted by accident).
 */
function isPostgresUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "postgres:" || protocol === "postgresql:";
  } catch {
    return false;
  }
}

const OPTIONAL = ["RESEND_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "ADMIN_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

/**
 * The configuration, typed. A variable that is empty or only spaces counts as not set (a settings form can save an
 * empty one).
 *
 * In production every required variable must be set: otherwise this throws an error that names the missing variables
 * (all of them) and never shows a value. Outside production (`next dev`, the tests) the required ones fall back to the
 * local values above. A DATABASE_URL that is not a postgres:// or postgresql:// URL is an error too (no value shown):
 * left to postgres.js, its own TypeError would quote the whole string, password included. `source` and `production`
 * are for the tests; the defaults are process.env and NODE_ENV.
 */
export function serverEnv(source: Source = process.env, production: boolean = process.env.NODE_ENV === "production"): ServerEnv {
  const read = (name: string): string | undefined => source[name]?.trim() || undefined;
  const missing: string[] = [];
  const env: Partial<ServerEnv> = {};
  for (const [name, fallback] of REQUIRED) {
    const value = read(name) ?? (production ? undefined : fallback);
    if (value === undefined) missing.push(name);
    else env[name] = value;
  }
  if (missing.length) throw new Error(`Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
  if (!isPostgresUrl(env.DATABASE_URL!)) throw new Error(BAD_DATABASE_URL); // no cause: the URL error carries the input
  for (const name of OPTIONAL) env[name] = read(name);
  return env as ServerEnv;
}
