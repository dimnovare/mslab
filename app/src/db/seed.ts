// CLI: DATABASE_URL=postgres://... npm run db:seed -- [--target local|railway] [--reset [--force]]
// Plain postgres + drizzle (no Cloudflare bindings). Prints row counts only, never the connection string.
//
// --target says which database is meant, and the address must agree (as in fill-ru.ts): "local" only on this machine,
// "railway" only on a Railway host. It is required for --reset (which deletes the content and the registrations), and
// for any database that is not on this machine. Only adding the missing rows to a local database works without it.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { targetMatches } from "./fill-ru";
import { safeDbError } from "./safe-error";
import { applySeed } from "./seed-apply";

/** Why the seed must not run against `url` with these arguments, or null when it may. Never names the address. */
export function seedRefusal(url: string, args: string[]): string | null {
  const t = args.indexOf("--target");
  const target = t >= 0 ? args[t + 1] : undefined;
  if (t >= 0 && target !== "local" && target !== "railway") return "Say which database is meant: --target local | --target railway";
  if (target === "local" || target === "railway") {
    return targetMatches(url, target) ? null : `Refusing: DATABASE_URL is not a ${target === "local" ? "local" : "Railway"} database (--target ${target}).`;
  }
  if (args.includes("--reset")) return "Refusing to reset without --target: say which database is meant (--target local | --target railway).";
  if (!targetMatches(url, "local")) return "Refusing: DATABASE_URL is not a local database. For Railway, add --target railway.";
  return null;
}

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    return 1;
  }
  const args = process.argv.slice(2);
  const refusal = seedRefusal(url, args);
  if (refusal) {
    console.error(refusal);
    return 1;
  }
  const reset = args.includes("--reset");
  const force = args.includes("--force");

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const counts = await applySeed(drizzle(sql, { schema }), { reset, force });
    console.log(`Seed done${reset ? " (content tables reset first)" : " (missing rows inserted, existing rows untouched)"}. Row counts:`);
    for (const [table, n] of Object.entries(counts)) console.log(`  ${table}: ${n}`);
    return 0;
  } catch (err) {
    console.error(`Seed failed: ${safeDbError(err)}.`);
    return 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// run as the CLI only (tests import seedRefusal)
if (process.argv[1] && /(^|\/)seed\.ts$/.test(process.argv[1].replaceAll("\\", "/"))) {
  main().then((code) => {
    process.exitCode = code;
  });
}
