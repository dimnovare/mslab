// CLI: DATABASE_URL=postgres://... npm run db:copy-kv -- --target local|railway --file <export.json> [--apply]
// Copies the review comments (and the Telegram chat id) from the Cloudflare KV of the old review site into kv_entries.
// The input is a JSON file made from the old namespace with wrangler: an array of { name, value, expiration? } where
// `expiration` is unix seconds (it becomes expires_at). Copied: `fb:*` (a comment), `id:*` (its lookup) and `tg:chat`.
// Skipped and counted: `rl:*` (rate limits hold visitors' addresses and must not move) and every other key.
//
// Without --apply it is a dry run. --apply writes in one transaction, upserting by key: a second run finds nothing left to
// write and changes no row. Prints counts by key family only: never the connection string, never a key or a value (a
// comment holds the client's own text).
//
// --target says which database is meant, and the address must agree (as in fill-ru.ts and demo.ts).
import { readFileSync } from "node:fs";
import { eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "./client";
import * as schema from "./schema";
import { kvEntries } from "./schema";
import { targetMatches } from "./fill-ru";

/** The key families that are copied, in print order. */
export const COPIED = ["fb", "id", "tg:chat"] as const;
export type Family = (typeof COPIED)[number];
/** Every other key, named in the counts only as a number: `rl:*` apart from the rest. */
export type SkippedFamily = "rl" | "other";

/** The family of a key, or null when it is not copied (then `skippedFamily` says which kind of skipped key it is). */
export function familyOf(name: string): Family | null {
  if (name.startsWith("fb:")) return "fb";
  if (name.startsWith("id:")) return "id";
  if (name === "tg:chat") return "tg:chat";
  return null;
}
export const skippedFamily = (name: string): SkippedFamily => (name.startsWith("rl:") ? "rl" : "other");

export type KvRow = { key: string; value: string; expiresAt: Date | null };
export type ParsedExport = {
  /** The rows to copy, in file order. */
  rows: KvRow[];
  /** Entries not copied, counted by kind. */
  skipped: Record<SkippedFamily, number>;
  /** Malformed entries: the index in the file and why, never the entry's content. */
  problems: { index: number; reason: string }[];
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Reads the export. An entry is classified by its name, so a name must be a non-empty string; an entry that is skipped
 * (`rl:*`, anything else) needs nothing more, so a rate limit entry exported without its value is no problem. An entry that
 * is copied needs a string value and, when it has one, an `expiration` that is a positive whole number of seconds. The same
 * key twice is refused: one would silently win.
 */
export function parseExport(data: unknown): ParsedExport {
  const out: ParsedExport = { rows: [], skipped: { rl: 0, other: 0 }, problems: [] };
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
    if (expiration !== undefined && (typeof expiration !== "number" || !Number.isSafeInteger(expiration) || expiration <= 0)) {
      return bad("expiration is not a positive whole number of seconds");
    }
    if (seen.has(name)) return bad("the same key is there twice");
    seen.add(name);
    out.rows.push({ key: name, value, expiresAt: expiration === undefined ? null : new Date(expiration * 1000) });
  });
  return out;
}

/** The export file as parsed JSON. The errors say nothing of the content (a JSON parse error quotes it). */
export function readExport(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error("the file cannot be read");
  }
  try {
    return JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new Error("the file is not valid JSON");
  }
}

export type FamilyCount = { total: number; added: number; unchanged: number; overwritten: number };
export type CopyPlan = {
  counts: Record<Family, FamilyCount>;
  skipped: Record<SkippedFamily, number>;
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
  lines.push(`  skipped: rl ${plan.skipped.rl}, other ${plan.skipped.other}`);
  return lines;
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
  const f = args.indexOf("--file");
  const file = args[f + 1];
  if (f < 0 || !file || file.startsWith("--")) {
    console.error("Say which export to copy: --file <path to the JSON export>");
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

  let parsed: ParsedExport;
  try {
    parsed = parseExport(readExport(file));
  } catch (err) {
    console.error(`Refusing: ${err instanceof Error ? err.message : "the file cannot be read"}.`);
    return 1;
  }
  if (parsed.problems.length) {
    console.error(`Refusing: ${parsed.problems.length} malformed entr${parsed.problems.length === 1 ? "y" : "ies"}, nothing written.`);
    for (const p of parsed.problems) console.error(p.index < 0 ? `  ${p.reason}` : `  entry ${p.index}: ${p.reason}`);
    return 1;
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema });
    const plan = await planCopy(db, parsed);
    for (const line of describePlan(plan, `${apply ? "Applying" : "Dry run"} (${target})`)) console.log(line);
    if (apply) {
      const written = await applyCopy(db, plan);
      const again = await planCopy(db, parsed);
      console.log(`Applied: ${written} row(s) written. Left to write now: ${again.pending.length}.`);
    }
    return 0;
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err ? ` [${String((err as { code: unknown }).code)}]` : "";
    console.error(`Copy failed${code}: ${safeMessage(err, url)}`);
    return 1;
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (process.argv[1] && /copy-kv\.ts$/.test(process.argv[1].replaceAll("\\", "/"))) {
  main().then((code) => {
    process.exitCode = code;
  });
}
