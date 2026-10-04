// CLI: DATABASE_URL=postgres://... npm run db:ensure-terms -- --target local|railway
// Adds the one row the e-course terms notice needs, `pages.course_terms`, with the seed's title and text (seed-data.ts), when it
// is missing: an INSERT ... ON CONFLICT (key) DO NOTHING. Nothing else is read or written: no other page, no setting (the terms
// version, courseTermsVersion, is "1" without a row), no other table. A row that is there already (Maria's own text) stays as it is.
//
// Why not db:seed: the generic seed adds every seed row a database lacks, so on Railway it would bring back sample courses whose
// slug was changed, posts that were deleted, emptied slides and FAQ (phase 2a final review I3).
//
// Prints only "inserted" or "already there"; of a database error only its code (safe-error.ts); never the connection string.
// --target says which database is meant, and the address must agree (fill-ru.ts targetMatches), as in seed.ts and copy-kv.ts.
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { TERMS_PAGE_KEY } from "@/domain/course-terms";
import type { Db } from "./client";
import * as schema from "./schema";
import { pages } from "./schema";
import { targetMatches } from "./fill-ru";
import { safeDbError } from "./safe-error";
import { pageSeeds } from "./seed-data";

/** The seed's terms page: its key, title and ET/RU text. */
function seedTerms(): { key: string; title: schema.Page["title"]; body: schema.Page["body"] } {
  const row = pageSeeds.find((p) => p.key === TERMS_PAGE_KEY);
  if (!row) throw new Error("seed-data.ts has no course_terms page");
  return { key: row.key, title: row.title, body: row.body };
}

/** Inserts the seed's `pages.course_terms` row unless the key is there; touches no other row. */
export async function ensureTerms(db: Db): Promise<"inserted" | "already there"> {
  // (The cast: on the Db union, returning(fields) has no common overload.)
  const rows = await (db as PostgresJsDatabase<typeof schema>)
    .insert(pages)
    .values(seedTerms())
    .onConflictDoNothing({ target: pages.key })
    .returning({ key: pages.key });
  return rows.length > 0 ? "inserted" : "already there";
}

/** Why the tool must not run with these arguments against `url`, or null when it may. Never names the address. */
export function ensureTermsRefusal(url: string | undefined, args: string[]): string | null {
  const t = args.indexOf("--target");
  const target = t >= 0 ? args[t + 1] : undefined;
  if (target !== "local" && target !== "railway") return "Say which database is meant: --target local | --target railway";
  if (!url) return "DATABASE_URL is not set.";
  if (!targetMatches(url, target)) return `Refusing: DATABASE_URL is not a ${target === "local" ? "local" : "Railway"} database (--target ${target}).`;
  return null;
}

/** Where the tool prints (console, or a recorder in the tests). */
export type Io = { log(line: string): void; error(line: string): void };
export type Connect = (url: string) => { db: Db; close(): Promise<void> };

const connectPostgres: Connect = (url) => {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
};

/** The whole CLI: the guard (before any connection), then the one insert. Returns the exit code. */
export async function runCli(args: string[], env: Record<string, string | undefined>, io: Io, connect: Connect = connectPostgres): Promise<number> {
  const refusal = ensureTermsRefusal(env.DATABASE_URL, args);
  if (refusal) {
    io.error(refusal);
    return 1;
  }
  let connection: ReturnType<Connect> | undefined;
  try {
    connection = connect(env.DATABASE_URL!);
    io.log(await ensureTerms(connection.db));
    return 0;
  } catch (err) {
    io.error(`Failed: ${safeDbError(err)}.`);
    return 1;
  } finally {
    await connection?.close().catch(() => {});
  }
}

// run as the CLI only (the tests import the functions)
if (process.argv[1] && /(^|\/)ensure-terms\.ts$/.test(process.argv[1].replaceAll("\\", "/"))) {
  runCli(process.argv.slice(2), process.env, console).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      console.error("Failed: unexpected error.");
      process.exitCode = 1;
    },
  );
}
