// CLI: DATABASE_URL=postgres://... npm run db:seed [-- --reset [--force]]
// Plain postgres + drizzle (no Cloudflare bindings). Prints row counts only, never the connection string.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { applySeed } from "./seed-apply";

/** Error text without the connection string or its host. */
function safeMessage(err: unknown, url: string): string {
  const text = err instanceof Error ? err.message : String(err);
  const secrets = [url];
  try {
    const parsed = new URL(url);
    secrets.push(parsed.host, parsed.hostname, parsed.password);
  } catch {
    // not a parseable URL: only the full string is redacted
  }
  return secrets.filter(Boolean).reduce((out, secret) => out.split(secret).join("***"), text);
}

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    return 1;
  }
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");
  const force = args.includes("--force");

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const counts = await applySeed(drizzle(sql, { schema }), { reset, force });
    console.log(`Seed done${reset ? " (content tables reset first)" : " (missing rows inserted, existing rows untouched)"}. Row counts:`);
    for (const [table, n] of Object.entries(counts)) console.log(`  ${table}: ${n}`);
    return 0;
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err ? ` [${String((err as { code: unknown }).code)}]` : "";
    console.error(`Seed failed${code}: ${safeMessage(err, url)}`);
    return 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().then((code) => {
  process.exitCode = code;
});
