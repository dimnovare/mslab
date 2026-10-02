import type { IncrementalCache } from "@opennextjs/aws/types/overrides.js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { frontKey, isFrontPage, type FrontMeta, type FrontVariant } from "../worker/page-front";
import { requestStartedAt } from "./request-start";

// The incremental cache of the rendered public pages (open-next.config.ts): OpenNext's R2 cache, with three additions.
//
// 1. Next.js 16.3 stores a page under "/route-cache/APP_PAGE/<sha256 of its source route>/$<path>", while OpenNext's
//    cache interception (which answers a cached page without loading the Next.js server) still looks it up by the path
//    alone ("/et/koolitused"). So the page is also written under its path.
// 2. The cached-page front (src/worker/page-front.ts) answers most page requests before OpenNext runs, from plain R2
//    objects: the document, the RSC payload and each prefetch segment, with the page's tags in their metadata.
// 3. Every copy is dated by when the rendering request BEGAN (request-start.ts), not by when R2 stored it. A render that
//    read the database before an admin's save and stored its page after it is then older than the save's revalidation,
//    and is rendered again on the next request, by OpenNext and by the front alike.
// All copies are written by the same render and revalidated by the same tags. A page is written only when it is
// rendered (on a visit after a change), so R2 sees a handful of writes per render and none per visit.

const NEXT_PAGE_KEY = /^\/route-cache\/APP_PAGE\/[0-9a-f]{64}\/\$(\/.*)$/;
/** R2 custom metadata may hold 2 KB in all. */
const META_MAX = 2000;
/** The field of a stored entry that holds when its render began (ms); OpenNext and Next.js ignore unknown fields. */
export const STARTED_AT = "mslabStartedAt";

/** The key cache interception reads for a page Next.js stores under `key` ("/et/koolitused"), or null for any other entry. */
export function interceptionKey(key: string): string | null {
  return NEXT_PAGE_KEY.exec(key)?.[1] ?? null;
}

/** What Next.js hands OpenNext's cache for an app page (adapters/cache.js, APP_PAGE). */
type AppPage = {
  type: "app";
  html?: string;
  rsc?: string;
  segmentData?: Record<string, string>;
  revalidate?: number | false;
  meta?: { status?: number; headers?: Record<string, unknown>; postponed?: string };
};

const TAGS_HEADER = "x-next-cache-tags";

/**
 * The front's objects for a page entry ([variant, body] and their shared metadata), or null when the front should not
 * serve it: not a page the front knows, not a complete 200 page, or tags too long for the metadata. `startedAt`: when the
 * rendering request began (the page's date).
 */
export function frontObjects(page: string, value: unknown, startedAt: number): { meta: FrontMeta; objects: [FrontVariant, string][] } | null {
  const v = value as AppPage;
  if (!isFrontPage(page) || v?.type !== "app" || typeof v.html !== "string" || typeof v.rsc !== "string") return null;
  if ((v.meta?.status ?? 200) !== 200 || v.meta?.postponed) return null;
  const headers = { ...(v.meta?.headers ?? {}) };
  const tags = headers[TAGS_HEADER];
  delete headers[TAGS_HEADER];
  if (typeof tags !== "string" || !tags) return null;
  const replay = Object.fromEntries(Object.entries(headers).filter((e): e is [string, string] => typeof e[1] === "string"));
  const meta = { t: tags, r: typeof v.revalidate === "number" ? String(v.revalidate) : "", h: JSON.stringify(replay), s: String(startedAt) } satisfies FrontMeta;
  if (meta.t.length + meta.r.length + meta.h.length + meta.s.length > META_MAX) return null;
  const objects: [FrontVariant, string][] = [
    [{ kind: "html" }, v.html],
    [{ kind: "rsc" }, v.rsc],
    ...Object.entries(v.segmentData ?? {}).map(([segment, body]): [FrontVariant, string] => [{ kind: "segment", segment }, body]),
  ];
  return { meta, objects };
}

/** A stored value with its render's start time, as written to R2 (the caller's object is not changed). */
export function withStartedAt<T>(value: T, startedAt: number): T {
  return value && typeof value === "object" ? ({ ...value, [STARTED_AT]: startedAt } as T) : value;
}

/** The date OpenNext gets for a stored entry: its render's start when recorded, else R2's upload time. */
export function entryDate(value: unknown, uploaded: number | undefined): number | undefined {
  const started = value && typeof value === "object" ? (value as Record<string, unknown>)[STARTED_AT] : undefined;
  return typeof started === "number" && Number.isFinite(started) ? started : uploaded;
}

const bucket = () => getCloudflareContext().env.NEXT_INC_CACHE_R2_BUCKET as R2Bucket | undefined;

/** Logs a failed copy without its content (keys are page paths, never personal data). */
const failed = (what: string, page: string) => (e: unknown) => console.error(`[page-store] ${what} failed for ${page}:`, e instanceof Error ? e.message : String(e));

async function writeFront(page: string, value: unknown, startedAt: number): Promise<void> {
  const front = frontObjects(page, value, startedAt);
  const buildId = process.env.OPEN_NEXT_BUILD_ID;
  const r2 = bucket();
  if (!front || !buildId || !r2) return;
  await Promise.all(
    front.objects.map(([variant, body]) =>
      r2.put(frontKey(buildId, page, variant), body, {
        customMetadata: front.meta,
        httpMetadata: { contentType: variant.kind === "html" ? "text/html; charset=utf-8" : "text/x-component" },
      }),
    ),
  );
}

async function deleteFront(page: string): Promise<void> {
  const buildId = process.env.OPEN_NEXT_BUILD_ID;
  const r2 = bucket();
  if (!buildId || !r2 || !isFrontPage(page)) return;
  const listed = await r2.list({ prefix: frontKey(buildId, page, { kind: "html" }).replace(/#html$/, "#") });
  if (listed.objects.length) await r2.delete(listed.objects.map((o) => o.key));
}

const pageStore: IncrementalCache = {
  name: "r2-page-store",
  async get(key, cacheType) {
    const entry = await r2IncrementalCache.get(key, cacheType);
    if (!entry) return entry;
    return { ...entry, lastModified: entryDate(entry.value, entry.lastModified) };
  },
  async set(key, value, cacheType) {
    // before any write: the rendering request's start, or (outside one) now, which is still before the upload
    const startedAt = requestStartedAt() ?? Date.now();
    const page = !cacheType || cacheType === "cache" ? interceptionKey(key) : null;
    const stored = page ? withStartedAt(value, startedAt) : value;
    await Promise.all([
      r2IncrementalCache.set(key, stored, cacheType),
      page ? r2IncrementalCache.set(page, stored, cacheType) : undefined,
      // the front is an optimisation: a failed write leaves those requests to OpenNext
      page ? writeFront(page, value, startedAt).catch(failed("front write", page)) : undefined,
    ]);
  },
  async delete(key) {
    const page = interceptionKey(key);
    await Promise.all([
      r2IncrementalCache.delete(key),
      page ? r2IncrementalCache.delete(page) : undefined,
      page ? deleteFront(page).catch(failed("front delete", page)) : undefined,
    ]);
  },
};

export default pageStore;
