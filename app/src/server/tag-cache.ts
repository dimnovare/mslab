// OpenNext's D1 tag cache (`revalidations` in NEXT_TAG_CACHE_D1), as this app reads and writes it outside OpenNext.
// The ONE place that knows its format: the cached-page front reads it (worker/page-front.ts), and the admin saves
// (server/public-cache.ts), the session cron (worker/session-starts.ts) and the e2e helper (tests/e2e/local-cache.ts)
// write it. The format is OpenNext 1.20.7's @opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache; the versions
// are pinned in package.json and tests/unit/tag-cache.test.ts checks both directions against that class itself (and
// tests/unit/versions.test.ts stops an upgrade until the production-build e2e has been run again).
// Pure: no Next.js and no bindings, so it runs in the Worker entry, the Next.js server and the tests alike.

/** The row key of a tag: "<build id>/<tag>" (d1-next-tag-cache getCacheKey). */
export const tagKey = (buildId: string, tag: string): string => `${buildId}/${tag}`.replaceAll("//", "/");

/** One row as d1-next-tag-cache writes it for an immediate expiry (revalidatePath / updateTag): stale = expire = now. */
export const TAG_INSERT = "INSERT INTO revalidations (tag, revalidatedAt, stale, expire) VALUES (?, ?, ?, ?)";

/** The rows that make every page carrying one of `tags` stale at `now`, as revalidatePath would. */
export function tagRows(buildId: string, tags: string[], now: number): { sql: string; values: [string, number, number, number] }[] {
  return [...new Set(tags)].map((tag) => ({ sql: TAG_INSERT, values: [tagKey(buildId, tag), now, now, now] }));
}

/** Writes `tags` as revalidated at `now`, in one batch (the table replaces a tag's earlier row). */
export async function writeTagRows(db: D1Database, buildId: string, tags: string[], now: number): Promise<void> {
  const rows = tagRows(buildId, tags, now);
  if (rows.length) await db.batch(rows.map((r) => db.prepare(r.sql).bind(...r.values)));
}

/** A row as read back: [tag, revalidatedAt, stale, expire]. */
export type TagRow = [string, number | null, number | null, number | null];

/** The query for `n` tags (d1-next-tag-cache #resolveTagValues). */
export const tagSelect = (n: number): string => `SELECT tag, revalidatedAt, stale, expire FROM revalidations WHERE tag IN (${Array.from({ length: n }, () => "?").join(", ")})`;

/**
 * Has a page stored at `lastModified` been made stale since, by any of its tag rows? True when OpenNext would not serve
 * it as fresh: hasBeenRevalidated (an expiry that has come and is after the page; without an expiry, a revalidation after
 * the page) or isStale (a stale-while-revalidate mark after the page, its expiry still to come).
 */
export function revalidatedSince(rows: TagRow[], lastModified: number, now: number): boolean {
  return rows.some(([, revalidatedAt, stale, expire]) => {
    const at = revalidatedAt ?? 0;
    const revalidated = expire != null ? expire <= now && expire > lastModified : at > lastModified;
    const staleMark = stale != null && at > lastModified && lastModified <= stale && (expire == null || expire > now);
    return revalidated || staleMark;
  });
}
