import type { IncrementalCache } from "@opennextjs/aws/types/overrides.js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { frontKey, isFrontPage, type FrontMeta, type FrontVariant } from "../worker/page-front";

// The incremental cache of the rendered public pages (open-next.config.ts): OpenNext's R2 cache, plus two copies.
//
// 1. Next.js 16.3 stores a page under "/route-cache/APP_PAGE/<sha256 of its source route>/$<path>", while OpenNext's
//    cache interception (which answers a cached page without loading the Next.js server) still looks it up by the path
//    alone ("/et/koolitused"). So the page is also written under its path.
// 2. The cached-page front (src/worker/page-front.ts) answers most page requests before OpenNext runs, from plain R2
//    objects: the document, the RSC payload and each prefetch segment, with the page's tags in their metadata.
// All copies are written by the same render and revalidated by the same tags. A page is written only when it is
// rendered (on a visit after a change), so R2 sees a handful of writes per render and none per visit.

const NEXT_PAGE_KEY = /^\/route-cache\/APP_PAGE\/[0-9a-f]{64}\/\$(\/.*)$/;
/** R2 custom metadata may hold 2 KB in all. */
const META_MAX = 2000;

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
 * serve it: not a page the front knows, not a complete 200 page, or tags too long for the metadata.
 */
export function frontObjects(page: string, value: unknown): { meta: FrontMeta; objects: [FrontVariant, string][] } | null {
  const v = value as AppPage;
  if (!isFrontPage(page) || v?.type !== "app" || typeof v.html !== "string" || typeof v.rsc !== "string") return null;
  if ((v.meta?.status ?? 200) !== 200 || v.meta?.postponed) return null;
  const headers = { ...(v.meta?.headers ?? {}) };
  const tags = headers[TAGS_HEADER];
  delete headers[TAGS_HEADER];
  if (typeof tags !== "string" || !tags) return null;
  const replay = Object.fromEntries(Object.entries(headers).filter((e): e is [string, string] => typeof e[1] === "string"));
  const meta: FrontMeta = { t: tags, r: typeof v.revalidate === "number" ? String(v.revalidate) : "", h: JSON.stringify(replay) };
  if (meta.t.length + meta.r.length + meta.h.length > META_MAX) return null;
  const objects: [FrontVariant, string][] = [
    [{ kind: "html" }, v.html],
    [{ kind: "rsc" }, v.rsc],
    ...Object.entries(v.segmentData ?? {}).map(([segment, body]): [FrontVariant, string] => [{ kind: "segment", segment }, body]),
  ];
  return { meta, objects };
}

async function writeFront(page: string, value: unknown): Promise<void> {
  const front = frontObjects(page, value);
  const buildId = process.env.OPEN_NEXT_BUILD_ID;
  const bucket = getCloudflareContext().env.NEXT_INC_CACHE_R2_BUCKET as R2Bucket | undefined;
  if (!front || !buildId || !bucket) return;
  await Promise.all(
    front.objects.map(([variant, body]) =>
      bucket.put(frontKey(buildId, page, variant), body, {
        customMetadata: front.meta,
        httpMetadata: { contentType: variant.kind === "html" ? "text/html; charset=utf-8" : "text/x-component" },
      }),
    ),
  );
}

async function deleteFront(page: string): Promise<void> {
  const buildId = process.env.OPEN_NEXT_BUILD_ID;
  const bucket = getCloudflareContext().env.NEXT_INC_CACHE_R2_BUCKET as R2Bucket | undefined;
  if (!buildId || !bucket || !isFrontPage(page)) return;
  const listed = await bucket.list({ prefix: frontKey(buildId, page, { kind: "html" }).replace(/#html$/, "#") });
  if (listed.objects.length) await bucket.delete(listed.objects.map((o) => o.key));
}

const pageStore: IncrementalCache = {
  name: "r2-page-store",
  get: (key, cacheType) => r2IncrementalCache.get(key, cacheType),
  async set(key, value, cacheType) {
    const page = !cacheType || cacheType === "cache" ? interceptionKey(key) : null;
    await Promise.all([
      r2IncrementalCache.set(key, value, cacheType),
      page ? r2IncrementalCache.set(page, value, cacheType) : undefined,
      // the front is an optimisation: a failed write leaves those requests to OpenNext
      page ? writeFront(page, value).catch((e) => console.error("[page-store] front write failed", e instanceof Error ? e.message : e)) : undefined,
    ]);
  },
  async delete(key) {
    const page = interceptionKey(key);
    await Promise.all([
      r2IncrementalCache.delete(key),
      page ? r2IncrementalCache.delete(page) : undefined,
      page ? deleteFront(page).catch(() => {}) : undefined,
    ]);
  },
};

export default pageStore;
