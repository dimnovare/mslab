// CLI: DATABASE_URL=postgres://... npm run db:copy-kv -- --target local|railway --file <export.json> [--apply]
// Copies the review comments (and the Telegram chat id) from the Cloudflare KV of the old review site into kv_entries.
// The input is a JSON file made from the old namespace with wrangler: an array of { name, value, expiration? } where
// `expiration` is unix seconds (it becomes expires_at). Copied: `fb:*` (a comment), `id:*` (its lookup) and `tg:chat`.
// Skipped and counted: `rl:*` (rate limits hold visitors' addresses and must not move), every other key, and a copied key
// whose expiration has already passed.
//
// Without --apply it is a dry run. --apply writes in one transaction, upserting by key: a second run finds nothing left to
// write and changes no row. Prints counts by key family only: never the connection string, never a key or a value (a
// comment holds the client's own text), and of a database error only its code (safe-error.ts).
//
// --target says which database is meant, and the address must agree (as in fill-ru.ts and demo.ts): copyRefusal decides
// that before any connection is made.
import { readFileSync } from "node:fs";
import { eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "./client";
import * as schema from "./schema";
import { kvEntries } from "./schema";
import { targetMatches } from "./fill-ru";
import { safeDbError } from "./safe-error";

/** The key families that are copied, in print order. */
export const COPIED = ["fb", "id", "tg:chat"] as const;
export type Family = (typeof COPIED)[number];

/** The family of a key, or null when it is not copied (then `skippedFamily` says which kind of skipped key it is). Exact and case sensitive: `tg:chat2` and `TG:chat` are not `tg:chat`. */
export function familyOf(name: string): Family | null {
  if (name.startsWith("fb:")) return "fb";
  if (name.startsWith("id:")) return "id";
  if (name === "tg:chat") return "tg:chat";
  return null;
}
export const skippedFamily = (name: string): "rl" | "other" => (name.startsWith("rl:") ? "rl" : "other");

export type KvRow = { key: string; value: string; expiresAt: Date | null };
export type SkippedKind = "rl" | "other" | "expired";
export type ParsedExport = {
  /** The rows to copy, in file order. */
  rows: KvRow[];
  /** Entries not copied, counted by kind: rate limits, every other key, and copied keys whose expiration has passed. */
  skipped: Record<SkippedKind, number>;
  /** Malformed entries: the index in the file and why, never the entry's content. */
  problems: { index: number; reason: string }[];
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The last second a JS Date and Postgres both hold without surprises: 9999-12-31T23:59:59Z. A larger `expiration` is refused. */
export const MAX_EXPIRATION = 253_402_300_799;

const NUL = String.fromCharCode(0);

/**
 * Reads the export. An entry is classified by its name, so a name must be a non-empty string; an entry that is skipped
 * (`rl:*`, anything else) needs nothing more, so a rate limit entry exported without its value is no problem. An entry that
 * is copied needs a string value, no NUL character in its key or value (Postgres text cannot hold one, so the apply would
 * fail on it) and, when it has one, an `expiration` that is a whole number of seconds from 1 to MAX_EXPIRATION. The same key
 * twice is refused: one would silently win. A copied entry whose expiration is at or before `now` is already gone for the
 * app (PgKv ignores expired rows): it is not copied, and counted as `expired`.
 */
export function parseExport(data: unknown, now: Date = new Date()): ParsedExport {
  const out: ParsedExport = { rows: [], skipped: { rl: 0, other: 0, expired: 0 }, problems: [] };
  if (!Array.isArray(data)) {
    out.problems.push({ index: -1, reason: "the file is not a JSON array" });
    return out;
  }
  const seen = new Set<string>();
  data.forEach((entry, index) => {
    const bad = (reason: string) => out.problems.push({ index, reason });
    if (!isRecord(entry)) return bad("not an object");
    const { name, value, expiration } = entry;
    if (typeof name !== "string" || !name) return bad("name is not a non-empty string");
    if (!familyOf(name)) {
      out.skipped[skippedFamily(name)]++;
      return;
    }
    if (typeof value !== "string") return bad("value is not a string");
    if (name.includes(NUL) || value.includes(NUL)) return bad("key or value contains a NUL character");
    if (expiration !== undefined && (typeof expiration !== "number" || !Number.isSafeInteger(expiration) || expiration <= 0 || expiration > MAX_EXPIRATION)) {
      return bad(`expiration is not a whole number of seconds between 1 and ${MAX_EXPIRATION}`);
    }
    if (seen.has(name)) return bad("the same key is there twice");
    seen.add(name);
    if (expiration !== undefined && expiration * 1000 <= now.getTime()) {
      out.skipped.expired++;
      return;
    }
    out.rows.push({ key: name, value, expiresAt: expiration === undefined ? null : new Date(expiration * 1000) });
  });
  return out;
}

/** The export file could not be read as JSON. Its message is fixed: a JSON parse error would quote the content. */
export class ExportFileError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

/** The export file as parsed JSON. */
export function readExport(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new ExportFileError("the file cannot be read");
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new ExportFileError("the file is not valid JSON");
  }
}

export type FamilyCount = { total: number; added: number; unchanged: number; overwritten: number };
export type CopyPlan = {
  counts: Record<Family, FamilyCount>;
  skipped: Record<SkippedKind, number>;
  /** The rows the apply writes: the ones that are not in the table yet and the ones that differ from it. */
  pending: KvRow[];
};

/** What the copy would do against the table: per family, rows added, rows already the same, rows that would be overwritten. */
export async function planCopy(db: Db, parsed: ParsedExport): Promise<CopyPlan> {
  const existing = new Map<string, KvRow>();
  if (parsed.rows.length) {
    const found = await db
      .select()
      .from(kvEntries)
      .where(or(like(kvEntries.key, "fb:%"), like(kvEntries.key, "id:%"), eq(kvEntries.key, "tg:chat")));
    for (const r of found) existing.set(r.key, r);
  }
  const zero = (): FamilyCount => ({ total: 0, added: 0, unchanged: 0, overwritten: 0 });
  const counts: Record<Family, FamilyCount> = { fb: zero(), id: zero(), "tg:chat": zero() };
  const pending: KvRow[] = [];
  for (const row of parsed.rows) {
    const count = counts[familyOf(row.key)!];
    count.total++;
    const have = existing.get(row.key);
    if (!have) {
      count.added++;
      pending.push(row);
    } else if (have.value === row.value && (have.expiresAt?.getTime() ?? null) === (row.expiresAt?.getTime() ?? null)) {
      count.unchanged++;
    } else {
      count.overwritten++;
      pending.push(row);
    }
  }
  return { counts, skipped: parsed.skipped, pending };
}

/** Rows per INSERT: three parameters a row stay far below the protocol's limit. */
const BATCH = 500;

/** Writes the pending rows in one transaction, upserting by key; returns how many. */
export async function applyCopy(db: Db, plan: CopyPlan): Promise<number> {
  if (!plan.pending.length) return 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < plan.pending.length; i += BATCH) {
      await tx
        .insert(kvEntries)
        .values(plan.pending.slice(i, i + BATCH))
        .onConflictDoUpdate({ target: kvEntries.key, set: { value: sql`excluded.value`, expiresAt: sql`excluded.expires_at` } });
    }
  });
  return plan.pending.length;
}

/** The plan as printed: counts by family, never a key or a value. */
export function describePlan(plan: CopyPlan, verb: string): string[] {
  const lines = [`${verb}: ${plan.pending.length} row(s) to write.`];
  for (const family of COPIED) {
    const c = plan.counts[family];
    lines.push(`  ${`${family}:`.padEnd(8)} ${c.total} in the file (new ${c.added}, already the same ${c.unchanged}, would be overwritten ${c.overwritten})`);
  }
  lines.push(`  skipped: rl ${plan.skipped.rl}, other ${plan.skipped.other}, expired ${plan.skipped.expired}`);
  return lines;
}

/** What `--target`, `--file` and DATABASE_URL must be before anything is read or connected. Null when the copy may start. Never names the address. */
export function copyRefusal(url: string | undefined, args: string[]): string | null {
  const t = args.indexOf("--target");
  const target = t >= 0 ? args[t + 1] : undefined;
  if (target !== "local" && target !== "railway") return "Say which database is meant: --target local | --target railway";
  const f = args.indexOf("--file");
  const file = f >= 0 ? args[f + 1] : undefined;
  if (!file || file.startsWith("--")) return "Say which export to copy: --file <path to the JSON export>";
  if (!url) return "DATABASE_URL is not set.";
  if (!targetMatches(url, target)) return `Refusing: DATABASE_URL is not a ${target === "local" ? "local" : "Railway"} database (--target ${target}).`;
  return null;
}

/** Where the tool prints (console, or a recorder in the tests). */
export type Io = { log(line: string): void; error(line: string): void };
/** An open database and how to close it. */
export type Connection = { db: Db; close(): Promise<void> };
export type Connect = (url: string) => Connection;

const connectPostgres: Connect = (url) => {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
};

/**
 * The whole CLI: guards (before any connection), the file, the plan, the apply. Returns the exit code. Prints counts, and of
 * a failure only its code; nothing in the file or the database reaches the output.
 */
export async function runCli(args: string[], env: Record<string, string | undefined>, io: Io, connect: Connect = connectPostgres, now: Date = new Date()): Promise<number> {
  const refusal = copyRefusal(env.DATABASE_URL, args);
  if (refusal) {
    io.error(refusal);
    return 1;
  }
  const url = env.DATABASE_URL!;
  const target = args[args.indexOf("--target") + 1];
  const file = args[args.indexOf("--file") + 1];
  const apply = args.includes("--apply");

  let parsed: ParsedExport;
  try {
    parsed = parseExport(readExport(file), now);
  } catch (err) {
    io.error(`Refusing: ${err instanceof ExportFileError ? err.reason : "the file cannot be read"}.`);
    return 1;
  }
  if (parsed.problems.length) {
    io.error(`Refusing: ${parsed.problems.length} malformed entr${parsed.problems.length === 1 ? "y" : "ies"}, nothing written.`);
    for (const p of parsed.problems) io.error(p.index < 0 ? `  ${p.reason}` : `  entry ${p.index}: ${p.reason}`);
    return 1;
  }

  let connection: Connection | undefined;
  try {
    connection = connect(url);
    const plan = await planCopy(connection.db, parsed);
    for (const line of describePlan(plan, `${apply ? "Applying" : "Dry run"} (${target})`)) io.log(line);
    if (apply) {
      const written = await applyCopy(connection.db, plan);
      const again = await planCopy(connection.db, parsed);
      io.log(`Applied: ${written} row(s) written. Left to write now: ${again.pending.length}.`);
    }
    return 0;
  } catch (err) {
    io.error(`Copy failed: ${safeDbError(err)}.`);
    return 1;
  } finally {
    await connection?.close().catch(() => {});
  }
}

/** Whatever escapes the CLI is one fixed line and a failing exit code: no stack, no message (it could carry a value). */
export async function settle(run: Promise<number>, io: Pick<Io, "error">): Promise<number> {
  try {
    return await run;
  } catch {
    io.error("Copy failed: unexpected error.");
    return 1;
  }
}

if (process.argv[1] && /copy-kv\.ts$/.test(process.argv[1].replaceAll("\\", "/"))) {
  settle(runCli(process.argv.slice(2), process.env, console), console).then((code) => {
    process.exitCode = code;
  });
}
