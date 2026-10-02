// CLI (round 2 item 1b): DATABASE_URL=postgres://... npx tsx src/db/fill-ru.ts --target railway|local [--apply]
// Brings the seed's Russian sample texts (and the round-2 trainer card values) to a database seeded before them, by the
// rule in ru-fill.ts: only empty Russian texts, only where the Estonian text is still the seed's. Without --apply it is
// a dry run. Prints row counts per table only: never the connection string, never any content.
//
// --target says which database is meant, and the address must agree: "local" only on this machine, "railway" only on a
// Railway host (the e2e harness refuses a non-local database the same way, tests/e2e/local-db.ts).
//
// The public pages are cached: a change made here does not revalidate them. After --apply on the live database, every
// page shows it after its daily refresh ((site)/layout.tsx: a day and a visit), the pages that list course dates within
// 5 minutes.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { applyRuFill, planRuFill } from "./ru-fill";

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const RAILWAY = /\.(rlwy\.net|railway\.app|railway\.internal)$/i;

/** Does the address agree with the target? */
export function targetMatches(url: string, target: "local" | "railway"): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return target === "local" ? LOCAL.has(host) : RAILWAY.test(host) && !LOCAL.has(host);
}

function safeMessage(err: unknown, url: string): string {
  const text = err instanceof Error ? err.message : String(err);
  const secrets = [url];
  try {
    const parsed = new URL(url);
    secrets.push(parsed.host, parsed.hostname, parsed.password, parsed.username);
  } catch {
    // only the full string is redacted
  }
  return secrets.filter((x) => x && x.length > 2).reduce((out, secret) => out.split(secret).join("***"), text);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const t = args.indexOf("--target");
  const target = args[t + 1];
  if (t < 0 || (target !== "local" && target !== "railway")) {
    console.error("Say which database is meant: --target local | --target railway");
    return 1;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    return 1;
  }
  if (!targetMatches(url, target)) {
    console.error(`Refusing: DATABASE_URL is not a ${target === "local" ? "local" : "Railway"} database (--target ${target}).`);
    return 1;
  }
  const apply = args.includes("--apply");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema });
    const plan = await planRuFill(db);
    const tables = Object.entries(plan.counts);
    console.log(`${apply ? "Applying" : "Dry run"} (${target}): ${plan.updates.length} row change(s).`);
    for (const [table, n] of tables) console.log(`  ${table}: ${n}`);
    if (apply && plan.updates.length) {
      await applyRuFill(db, plan);
      const again = await planRuFill(db);
      console.log(`Applied. Left to fill now: ${again.updates.length}.`);
    }
    return 0;
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err ? ` [${String((err as { code: unknown }).code)}]` : "";
    console.error(`Fill failed${code}: ${safeMessage(err, url)}`);
    return 1;
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (process.argv[1] && /fill-ru\.ts$/.test(process.argv[1].replaceAll("\\", "/"))) {
  main().then((code) => {
    process.exitCode = code;
  });
}
