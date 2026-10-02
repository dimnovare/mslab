import { and, asc, eq, gt, isNull, like, lte, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { getDb } from "@/db/client";
import { kvEntries } from "@/db/schema";
import type { FeedbackKv } from "./feedback";
import { logFailure } from "./log";
import type { TextKv } from "./ratelimit";

/** The Cloudflare-KV-shaped store the forms, comments and notifications use, kept in Postgres. */
export class PgKv implements TextKv, FeedbackKv {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
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
   */
  async put(key: string, value: string, opts: { expirationTtl?: number } = {}): Promise<void> {
    const expiresAt = opts.expirationTtl ? new Date(this.now().getTime() + opts.expirationTtl * 1000) : null;
    await this.db.insert(kvEntries).values({ key, value, expiresAt }).onConflictDoUpdate({ target: kvEntries.key, set: { value, expiresAt } });
    if (expiresAt) await this.sweep();
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
  const gone = await db.delete(kvEntries).where(lte(kvEntries.expiresAt, now)).returning();
  return gone.length;
}

/** The store of this request, in the app's database. */
export const serverKv = (): PgKv => new PgKv(getDb());
