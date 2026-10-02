// CLI: DATABASE_URL=postgres://... npm run db:demo -- --target railway|local [--apply | --remove]
// The removable SAMPLE data for the admin (demo-data.ts). Without --apply or --remove it is a dry run. Prints counts,
// course slugs, dates and seat states only: never the connection string, never a name or an address.
//
// --target says which database is meant, and the address must agree (as in fill-ru.ts and seed.ts).
//
// The public pages are cached (open-next.config.ts): after --apply or --remove on the live database, mark the
// calendar, the plan's course pages and the home page stale in the production tag cache:
//   npm run db:demo -- --revalidate-sql <build id>     prints the INSERTs (no secrets), then
//   npx wrangler d1 execute mslab-next-tags --remote --command "<them>"
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { targetMatches } from "./fill-ru";
import { applyDemo, demoRevalidateSql, planDemo, removeDemo, type DemoReport } from "./demo-data";

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

/** The report as printed: counts, slugs, dates and seat states. */
export function describeReport(report: DemoReport, verb: string): string[] {
  const { inserted: n, present: p } = report;
  const lines = [
    `${verb}: registrations ${n.registrations}, waitlist ${n.waitlist}, requests ${n.requests}, subscribers ${n.subscribers}` +
      ` (sample rows already there: registrations ${p.registrations}, requests ${p.requests}, subscribers ${p.subscribers}).`,
  ];
  for (const [slot, s] of Object.entries(report.sessions)) lines.push(`  ${slot.padEnd(5)} ${s.date} ${s.course} (capacity ${s.capacity}): ${s.before} -> ${s.after}`);
  for (const problem of report.problems) lines.push(`  problem: ${problem}`);
  return lines;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const sqlFor = args.indexOf("--revalidate-sql");
  if (sqlFor >= 0) {
    const buildId = args[sqlFor + 1];
    if (!buildId || !/^[\w-]+$/.test(buildId)) {
      console.error("Give the deployed build id: --revalidate-sql <build id>");
      return 1;
    }
    console.log(demoRevalidateSql(buildId));
    return 0;
  }
  const t = args.indexOf("--target");
  const target = args[t + 1];
  if (t < 0 || (target !== "local" && target !== "railway")) {
    console.error("Say which database is meant: --target local | --target railway");
    return 1;
  }
  const apply = args.includes("--apply");
  const remove = args.includes("--remove");
  if (apply && remove) {
    console.error("Either --apply or --remove, not both.");
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
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema });
    if (remove) {
      const n = await removeDemo(db);
      console.log(`Removed (${target}): registrations ${n.registrations}, waitlist ${n.waitlist}, requests ${n.requests}, subscribers ${n.subscribers}.`);
      return 0;
    }
    if (apply) {
      const report = await applyDemo(db);
      for (const line of describeReport(report, `Inserted (${target})`)) console.log(line);
      const after = await planDemo(db);
      console.log(`Left to insert now: ${after.inserted.registrations + after.inserted.waitlist + after.inserted.requests + after.inserted.subscribers}.`);
      return 0;
    }
    const report = await planDemo(db);
    for (const line of describeReport(report, `Dry run (${target}), would insert`)) console.log(line);
    return report.problems.length ? 1 : 0;
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err ? ` [${String((err as { code: unknown }).code)}]` : "";
    console.error(`Sample data failed${code}: ${safeMessage(err, url)}`);
    return 1;
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (process.argv[1] && /(^|\/)demo\.ts$/.test(process.argv[1].replaceAll("\\", "/"))) {
  main().then((code) => {
    process.exitCode = code;
  });
}
