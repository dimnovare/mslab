import { existsSync, readFileSync } from "node:fs";
import { SERVER_ENV_FILES } from "../local-secrets";

// The e2e run writes to a database in two ways: directly (fixtures.ts: seat fixtures, test rows, snapshots) and through
// the local server (the form and admin tests submit to it; it uses DATABASE_URL, which the run sets to the local
// database: tests/local-secrets.ts). Both must be a database on this machine, never a shared one (Railway): the run refuses to start otherwise.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Is this a postgres URL of this machine? An unparsable value is not. */
export function isLocalDbUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** The host part only (never the user or password), for an error message. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname || "?";
  } catch {
    return "an unparsable URL";
  }
}

/** The settings that point the run at a database: environment variables, and the server's own env files. */
const ENV_KEYS = [
  "E2E_DATABASE_URL", // fixtures.ts
  "DATABASE_URL", // the server (server/env.ts), the seed / drizzle CLI; refused too, so a shell left pointing at Railway cannot be used by mistake
] as const;

export type DbSetting = { source: string; url: string };

/** Every database setting in this environment: the process environment and the env files the server reads. */
export function databaseSettings(env: Record<string, string | undefined> = process.env, read: (file: string) => string | null = readIfExists): DbSetting[] {
  const out: DbSetting[] = [];
  for (const key of ENV_KEYS) if (env[key]) out.push({ source: `env ${key}`, url: env[key]! });
  for (const file of SERVER_ENV_FILES) {
    const text = read(file);
    if (!text) continue;
    for (const key of ENV_KEYS) {
      const m = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*["']?([^"'\\s]+)`, "m").exec(text);
      if (m) out.push({ source: `${file} ${key}`, url: m[1] });
    }
  }
  return out;
}

function readIfExists(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/** Throws (naming the setting and the host, never the URL) unless every database setting is local. */
export function assertLocalDatabases(settings: DbSetting[] = databaseSettings()): void {
  const remote = settings.filter((s) => !isLocalDbUrl(s.url));
  if (remote.length)
    throw new Error(`e2e: refusing to run against a non-local database: ${remote.map((s) => `${s.source} → ${hostOf(s.url)}`).join("; ")}`);
}
