import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";
import { revalidationTargets, targetTag, type PublicChange } from "@/server/cache-targets";
import { revalidatedSince, tagKey, tagRows, tagSelect, writeTagRows, type TagRow } from "@/server/tag-cache";
import { sqliteD1 } from "../d1-sqlite";

// Task 17, fix round 1: the app reads and writes OpenNext's D1 tag cache itself (the cached-page front, the admin saves,
// the session cron). These tests hold that code to OpenNext's own class, @opennextjs/cloudflare's d1-next-tag-cache,
// running on a real SQLite table with OpenNext's schema, and to the tags Next.js's own revalidatePath() produces.

const CONTEXT = Symbol.for("__cloudflare-context__");
const BUILD = "B1";
const g = globalThis as Record<string | symbol, unknown>;
let db: ReturnType<typeof sqliteD1>;

beforeEach(() => {
  db = sqliteD1();
  g[CONTEXT] = { env: { NEXT_TAG_CACHE_D1: db.binding }, ctx: {}, cf: {} };
  g.openNextConfig = {};
  process.env.OPEN_NEXT_BUILD_ID = BUILD;
});
afterEach(() => {
  delete g[CONTEXT];
  delete g.openNextConfig;
  delete process.env.OPEN_NEXT_BUILD_ID;
  vi.useRealTimers();
});

/** What OpenNext decides about a page dated `lastModified` at `now`: not fresh when revalidated or stale. */
async function openNextSaysStale(tags: string[], lastModified: number, now: number): Promise<boolean> {
  vi.useFakeTimers({ now });
  try {
    return (await d1NextTagCache.hasBeenRevalidated(tags, lastModified)) || (await d1NextTagCache.isStale(tags, lastModified));
  } finally {
    vi.useRealTimers();
  }
}

/** The front's decision on the same rows, read with its own query. */
async function frontSaysStale(tags: string[], lastModified: number, now: number): Promise<boolean> {
  const rows = await db.binding
    .prepare(tagSelect(tags.length))
    .bind(...tags.map((t) => tagKey(BUILD, t)))
    .raw<TagRow>();
  return revalidatedSince(rows, lastModified, now);
}

describe("the rows the app writes are OpenNext's", () => {
  test("writeTagRows writes exactly what OpenNext writes for revalidatePath (an immediate expiry)", async () => {
    const now = 1_790_000_000_000;
    const tags = ["_N_T_/[locale]/(site)/praktika/page", "_N_T_/layout"];
    vi.useFakeTimers({ now });
    // OpenNext's cache adapter turns a revalidatePath() tag into { tag, expire: now } (aws adapters/cache.js revalidateTag)
    await d1NextTagCache.writeTags(tags.map((tag) => ({ tag, expire: now })));
    const theirs = db.d1.rows();
    vi.useRealTimers();

    const mine = sqliteD1();
    await writeTagRows(mine.binding, BUILD, tags, now);
    expect(mine.d1.rows()).toEqual(theirs);
    expect(theirs.map((r) => r.tag)).toEqual(["B1/_N_T_/[locale]/(site)/praktika/page", "B1/_N_T_/layout"]);
    expect(tagRows(BUILD, [...tags, tags[0]], now)).toHaveLength(2); // each tag once
  });

  test("OpenNext reads them back: a page dated before the write is revalidated, one dated after is not", async () => {
    const at = 1_790_000_000_000;
    const tags = ["_N_T_/[locale]/(site)/praktika/page"];
    await writeTagRows(db.binding, BUILD, tags, at);
    vi.useFakeTimers({ now: at + 1000 });
    expect(await d1NextTagCache.hasBeenRevalidated(tags, at - 1)).toBe(true);
    expect(await d1NextTagCache.hasBeenRevalidated(tags, at + 1)).toBe(false);
    expect(await d1NextTagCache.hasBeenRevalidated(["_N_T_/other/page"], at - 1)).toBe(false);
  });
});

describe("the front's freshness check equals OpenNext's", () => {
  test("over a matrix of rows (immediate expiry, stale-while-revalidate, a future expiry, none), dates and times", async () => {
    const T = 1_790_000_000_000;
    const tag = "_N_T_/x/page";
    const rowsToTry: [number, number | null, number | null][] = [];
    for (const revalidatedAt of [T - 2000, T, T + 2000])
      for (const stale of [null, revalidatedAt, revalidatedAt + 1000])
        for (const expire of [null, revalidatedAt, revalidatedAt + 1000, revalidatedAt + 60_000]) rowsToTry.push([revalidatedAt, stale, expire]);
    let compared = 0;
    for (const [revalidatedAt, stale, expire] of rowsToTry) {
      db.d1.exec("DELETE FROM revalidations");
      await db.binding.prepare("INSERT INTO revalidations (tag, revalidatedAt, stale, expire) VALUES (?, ?, ?, ?)").bind(tagKey(BUILD, tag), revalidatedAt, stale, expire).run();
      for (const lastModified of [T - 5000, T - 1, T, T + 1, T + 1500, T + 5000])
        for (const now of [T + 500, T + 3000, T + 120_000]) {
          const label = JSON.stringify({ revalidatedAt, stale, expire, lastModified, now });
          expect(await frontSaysStale([tag], lastModified, now), label).toBe(await openNextSaysStale([tag], lastModified, now));
          compared++;
        }
    }
    expect(compared).toBe(648);
  });
});

describe("tags: what Next.js's own revalidatePath() writes", () => {
  test("each target's tag is the one Next.js produces, and OpenNext stores and the front reads it", async () => {
    // as Next.js's server sets it up before loading its request stores
    g.AsyncLocalStorage ??= AsyncLocalStorage;
    const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external.js");
    const { revalidatePath } = await import("next/cache");
    const changes: PublicChange[] = [
      { kind: "courses" },
      { kind: "sessions" },
      { kind: "seats", course: "kulmude-lami" },
      { kind: "seats" },
      { kind: "home" },
      { kind: "practice" },
      { kind: "posts" },
      { kind: "trainer", parts: ["trainer"] },
      { kind: "trainer", parts: ["bio", "works"] },
      { kind: "settings", parts: ["privacy", "terms"] },
    ];
    for (const change of changes) {
      for (const target of revalidationTargets(change)) {
        // a work store as a server action has one; revalidatePath() only records the tag in it
        const store = { route: "/x", page: "/x/page", incrementalCache: {}, cacheLifeProfiles: {} } as unknown as Parameters<typeof workAsyncStorage.run>[0];
        workAsyncStorage.run(store, () => revalidatePath(target.path, target.type));
        const pending = (store as unknown as { pendingRevalidatedTags: { tag: string; profile?: unknown }[] }).pendingRevalidatedTags;
        expect(pending.map((p) => p.tag), JSON.stringify(target)).toEqual([targetTag(target)]);
        expect(pending[0].profile, "an immediate expiry, not stale-while-revalidate").toBeUndefined();
      }
    }

    // and the front sees a page carrying such a tag as stale once the app has written it
    const T = Date.now() - 10_000;
    const tags = revalidationTargets({ kind: "courses" }).map(targetTag);
    await writeTagRows(db.binding, BUILD, tags, T);
    expect(await frontSaysStale(["_N_T_/[locale]/(site)/koolitused/layout"], T - 1, T + 1000)).toBe(true);
    expect(await frontSaysStale(["_N_T_/[locale]/(site)/praktika/page"], T - 1, T + 1000)).toBe(false);
  });
});
