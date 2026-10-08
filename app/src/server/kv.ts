import { and, asc, eq, gt, isNull, like, lte, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Db } from "@/db/client";
import { getDb } from "@/db/client";
import type * as schema from "@/db/schema";
import { kvEntries } from "@/db/schema";
import type { FeedbackKv } from "./feedback";
import { logFailure } from "./log";
import type { TextKv } from "./ratelimit";

/** The Cloudflare-KV-shaped store the forms, comments and notifications use, kept in Postgres. */
export class PgKv implements TextKv, FeedbackKv {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
    private readonly opts: { sweep?: boolean } = {},
  ) {}

  /** Rows that have no expiry or have not reached it. */
  private live() {
    return or(isNull(kvEntries.expiresAt), gt(kvEntries.expiresAt, this.now()));
  }

  async get(key: string): Promise<string | null> {
    const [row] = await this.db.select({ value: kvEntries.value }).from(kvEntries).where(and(eq(kvEntries.key, key), this.live())).limit(1);
    return row?.value ?? null;
  }

  /**
   * Stores the value; `expirationTtl` is in seconds. Without it the entry never expires (a put replaces an earlier expiry,
   * as in Cloudflare KV). A put with a TTL also deletes the expired rows: the rate limit rows hold visitors' IP addresses,
   * which must not outlive their window (the partial index on expires_at keeps that delete cheap).
   * `sweep: false` (a store on a caller's transaction: the password lock, account-api.ts): no sweep, which would hold the expired rows'
   * locks until that transaction ends and could deadlock with another login's; the next put elsewhere, or the daily cron, sweeps.
   */
  async put(key: string, value: string, opts: { expirationTtl?: number } = {}): Promise<void> {
    const expiresAt = opts.expirationTtl ? new Date(this.now().getTime() + opts.expirationTtl * 1000) : null;
    await this.db.insert(kvEntries).values({ key, value, expiresAt }).onConflictDoUpdate({ target: kvEntries.key, set: { value, expiresAt } });
    if (expiresAt && this.opts.sweep !== false) await this.sweep();
  }

  /**
   * Takes one of `limit` slots under `key` in ONE statement (phase 2c: the password login's per-IP limit): inserts `1` with the window's
   * expiry (`windowSec` from now); on a row already there, an expired one starts again at `1`, a live one below `limit` counts one more
   * and renews the expiry, and one at `limit` is left exactly as it is. No row comes back for that last case: false. Concurrent calls for
   * one key take their turns on the row (Postgres re-reads it after the other's commit), so no two of them can take the same slot and
   * no count is lost, which a get followed by a put cannot promise. Sweeps like a put with a TTL (the keys hold addresses), unless
   * `sweep: false`.
   */
  async reserve(key: string, limit: number, windowSec: number): Promise<boolean> {
    const now = this.now();
    const nowSql = sql`${now.toISOString()}::timestamptz`;
    const expiresAt = new Date(now.getTime() + windowSec * 1000);
    // (The cast: on the Db union, returning(fields) has no common overload.)
    const rows = await (this.db as PostgresJsDatabase<typeof schema>)
      .insert(kvEntries)
      .values({ key, value: "1", expiresAt })
      .onConflictDoUpdate({
        target: kvEntries.key,
        set: { value: sql`case when ${kvEntries.expiresAt} <= ${nowSql} then '1' else (${kvEntries.value}::int + 1)::text end`, expiresAt },
        setWhere: sql`${kvEntries.expiresAt} <= ${nowSql} or ${kvEntries.value}::int < ${limit}`,
      })
      .returning({ one: sql<number>`1` });
    if (this.opts.sweep !== false) await this.sweep();
    return rows.length > 0;
  }

  /**
   * Gives one slot of `key` back (reserve above): one statement, never below 0, the expiry untouched (it is the one the last reserve set).
   * A row that has expired, or no row, is left alone: the count then belongs to a window that is not this one.
   */
  async release(key: string): Promise<void> {
    await this.db
      .update(kvEntries)
      .set({ value: sql`(${kvEntries.value}::int - 1)::text` })
      .where(and(eq(kvEntries.key, key), sql`${kvEntries.value}::int > 0`, this.live()));
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(kvEntries).where(eq(kvEntries.key, key));
  }

  /** Keys with the prefix in byte order, 1 to 1000 (default 1000) per page; pass the returned `cursor` for the next page. */
  async list(opts: { prefix?: string; cursor?: string; limit?: number } = {}): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }> {
    const limit = Math.max(1, Math.min(Math.trunc(opts.limit ?? 1000), 1000));
    const rows = await this.db
      .select({ key: kvEntries.key })
      .from(kvEntries)
      .where(and(like(kvEntries.key, `${(opts.prefix ?? "").replace(/[\\%_]/g, "\\$&")}%`), this.live(), opts.cursor ? gt(kvEntries.key, opts.cursor) : undefined))
      .orderBy(asc(kvEntries.key))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const done = rows.length <= limit;
    return { keys: page.map((r) => ({ name: r.key })), list_complete: done, cursor: done ? undefined : page.at(-1)!.key };
  }

  /** Deletes the expired rows. A failure is logged (no values) and never fails the caller: the next TTL put sweeps again, and reads ignore expired rows meanwhile. */
  async sweep(): Promise<void> {
    try {
      await sweepExpired(this.db, this.now());
    } catch (e) {
      logFailure("[kv] sweeping expired entries failed", e);
    }
  }
}

/**
 * Deletes the rows that expired at or before `now` and returns how many. A failing database throws. Every TTL put sweeps
 * (PgKv.put); the daily cron (app/api/cron/sweep) does it too, so a quiet site's rate limit rows (visitors' addresses) do
 * not wait for the next submission.
 */
export async function sweepExpired(db: Db, now: Date = new Date()): Promise<number> {
  // Returns a constant per row: the keys hold visitors' addresses and need not leave the database to be counted.
  // The cast picks one member of the Db union (as in auth.ts): on the union itself, returning(fields) has no common overload.
  const gone = await (db as PostgresJsDatabase<typeof schema>).delete(kvEntries).where(lte(kvEntries.expiresAt, now))
    .returning({ one: sql<number>`1` });
  return gone.length;
}

/** The store of this request, in the app's database. */
export const serverKv = (): PgKv => new PgKv(getDb());
