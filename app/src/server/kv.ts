import { and, asc, eq, gt, isNull, like, lt, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { getDb } from "@/db/client";
import { kvEntries } from "@/db/schema";
import type { FeedbackKv } from "./feedback";
import type { TextKv } from "./ratelimit";

/** Share of `put` calls that also delete the expired rows (nothing else removes them; reads already ignore them). */
const SWEEP_SHARE = 0.01;

/** The Cloudflare-KV-shaped store the forms, comments and notifications use, kept in Postgres. */
export class PgKv implements TextKv, FeedbackKv {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
    private readonly random: () => number = Math.random,
  ) {}

  /** Rows that have no expiry or have not reached it. */
  private live() {
    return or(isNull(kvEntries.expiresAt), gt(kvEntries.expiresAt, this.now()));
  }

  async get(key: string): Promise<string | null> {
    const [row] = await this.db.select({ value: kvEntries.value }).from(kvEntries).where(and(eq(kvEntries.key, key), this.live())).limit(1);
    return row?.value ?? null;
  }

  /** Stores the value; `expirationTtl` is in seconds. Without it the entry never expires (a put replaces an earlier expiry, as in Cloudflare KV). */
  async put(key: string, value: string, opts: { expirationTtl?: number } = {}): Promise<void> {
    const expiresAt = opts.expirationTtl ? new Date(this.now().getTime() + opts.expirationTtl * 1000) : null;
    await this.db.insert(kvEntries).values({ key, value, expiresAt }).onConflictDoUpdate({ target: kvEntries.key, set: { value, expiresAt } });
    if (this.random() < SWEEP_SHARE) await this.sweep();
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(kvEntries).where(eq(kvEntries.key, key));
  }

  /** Keys with the prefix in key order, at most `limit` (1000) per page; pass the returned `cursor` for the next page. */
  async list(opts: { prefix?: string; cursor?: string; limit?: number } = {}): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }> {
    const limit = Math.min(opts.limit ?? 1000, 1000);
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

  /** Deletes the expired rows. Housekeeping only: a failure is not the caller's problem, the next sweep tries again. */
  async sweep(): Promise<void> {
    try {
      await this.db.delete(kvEntries).where(lt(kvEntries.expiresAt, this.now()));
    } catch {
      // not worth failing a put for
    }
  }
}

/** The store of this request, in the app's database. */
export const serverKv = (): PgKv => new PgKv(getDb());
