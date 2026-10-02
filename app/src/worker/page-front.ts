import { routeSitePath } from "../lib/site-routing";

// The cached-page front: answers a request for a cached public page straight from R2, before OpenNext and Next.js run.
//
// Why: Workers Free allows 10 ms CPU per request. Rendering a page takes 40–70 ms, OpenNext's cache interception of a
// cached page 4–9 ms (and ~45 ms on the first request of a new isolate, which also initialises OpenNext's routing). This
// path streams a stored body and checks one D1 query: ~1–2 ms, also on a new isolate.
//
// How: whenever Next.js stores a rendered page (server/page-store.ts), its document, its RSC payload and each prefetch
// segment are also stored as plain R2 objects under FRONT_PREFIX, with the page's cache tags and revalidate time in the
// object's metadata. A request is answered from such an object only when OpenNext would answer it from its own cache
// with the same bytes: a GET or HEAD for a public page (lib/site-routing.ts, as the middleware routes it), not a server
// action, revalidation or preview, the object present, not past its revalidate time, and none of its tags revalidated
// since it was stored (the D1 tag cache rows that revalidatePath writes, read as OpenNext's d1-next-tag-cache reads
// them). Everything else, and any doubt, goes on to OpenNext unchanged, which then also refreshes what is stale.

export const FRONT_PREFIX = "front";

/** What a page request asks for: the HTML document, the RSC payload (a navigation), or one prefetch segment. */
export type FrontVariant = { kind: "html" } | { kind: "rsc" } | { kind: "segment"; segment: string };

/** Object metadata (R2 customMetadata, at most 2 KB). */
export type FrontMeta = {
  /** the page's cache tags, comma-separated (Next.js's x-next-cache-tags) */
  t: string;
  /** revalidate seconds, "" for none */
  r: string;
  /** headers of the stored page to send again (JSON object), e.g. x-nextjs-stale-time */
  h: string;
};

/** The pages the front serves: our own slugs only (lowercase letters, digits, dashes); anything else goes to OpenNext. */
const PAGE = /^\/(et|ru)(\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

export const isFrontPage = (page: string): boolean => PAGE.test(page);

export function frontKey(buildId: string, page: string, variant: FrontVariant): string {
  const name = variant.kind === "segment" ? `seg:${encodeURIComponent(variant.segment)}` : variant.kind;
  return `${FRONT_PREFIX}/${buildId}${page}#${name}`;
}

/** Same as OpenNext's response for a cached page (core/routing/cacheInterceptor.js). */
export const VARY = "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url";
const ROBOTS = "noindex, nofollow";

/**
 * What browsers are told about a page, its RSC payload and its segments: keep it, but ask again before every use (the
 * answer is a cheap 304 from the front when nothing changed). OpenNext and Next.js send a cached page with
 * "s-maxage=…, stale-while-revalidate=2592000", meant for a CDN in front: a browser has no s-maxage, so it took such
 * an answer as stale yet usable for 30 days, and the client router's prefetches and navigations were then answered
 * from the browser's own cache, an admin's change included, while it refreshed them in the background.
 */
export const BROWSER_CACHE_CONTROL = "public, max-age=0, must-revalidate";

/** A response of OpenNext / Next.js for a cached page (ISR), whose Cache-Control is meant for a CDN, not a browser. */
export function isCdnCacheControl(value: string | null): boolean {
  return !!value && /s-maxage=/.test(value) && /stale-while-revalidate/.test(value);
}

/** `response` with BROWSER_CACHE_CONTROL in place of a CDN Cache-Control (any other response is returned as it is). */
export function forBrowsers(response: Response): Response {
  if (!isCdnCacheControl(response.headers.get("cache-control"))) return response;
  const out = new Response(response.body, response);
  out.headers.set("cache-control", BROWSER_CACHE_CONTROL);
  return out;
}

/** The page and variant a request asks for, or null when the front must leave it to OpenNext. */
export function frontRequest(request: Request): { page: string; rewritten: boolean; variant: FrontVariant } | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const h = request.headers;
  // server actions, ISR revalidation (the queue's own requests), preview mode
  if (h.has("next-action") || h.has("x-prerender-revalidate")) return null;
  const cookie = h.get("cookie") ?? "";
  if (cookie.includes("__prerender_bypass") || cookie.includes("__next_preview_data")) return null;
  const url = new URL(request.url);
  const route = routeSitePath(url.pathname, url.searchParams);
  if (route.kind !== "page" || !isFrontPage(route.page)) return null;
  const segment = h.get("next-router-segment-prefetch");
  const variant: FrontVariant = h.get("rsc") === "1" ? (segment ? { kind: "segment", segment } : { kind: "rsc" }) : { kind: "html" };
  return { page: route.page, rewritten: route.rewritten, variant };
}

/** A D1 tag cache row: [tag, revalidatedAt, stale, expire] (OpenNext d1-next-tag-cache). */
export type TagRow = [string, number | null, number | null, number | null];

/**
 * Has any of the page's tags been revalidated since the page was stored? Both of OpenNext's checks count:
 * hasBeenRevalidated (an expiry that has come, after the page was stored; or, without one, a revalidation after it)
 * and isStale (a stale-while-revalidate mark after it). Either way the page is left to OpenNext.
 */
export function revalidatedSince(rows: TagRow[], lastModified: number, now: number): boolean {
  return rows.some(([, revalidatedAt, , expire]) => (expire != null && expire <= now && expire > lastModified) || (revalidatedAt ?? 0) > lastModified);
}

/** The D1 key of a tag (OpenNext d1-next-tag-cache: "<buildId>/<tag>"). */
export const tagKey = (buildId: string, tag: string): string => `${buildId}/${tag}`.replaceAll("//", "/");

/** Is a page stored at `lastModified` past its revalidate time (seconds; null: none)? OpenNext's rule (cacheInterceptor). */
export function pastRevalidate(revalidate: number | null, lastModified: number, now: number): boolean {
  return revalidate !== null && Math.round((now - lastModified) / 1000) >= revalidate;
}

/** Does the browser already hold this version (If-None-Match lists the object's ETag, or "*")? */
export function notModified(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const strip = (t: string) => t.trim().replace(/^W\//, "");
  return ifNoneMatch.split(",").some((t) => t.trim() === "*" || strip(t) === strip(etag));
}

export type FrontEnv = { NEXT_INC_CACHE_R2_BUCKET?: R2Bucket; NEXT_TAG_CACHE_D1?: D1Database };

/**
 * The cached answer for `request`, or null (then OpenNext answers it). Never throws: a failing R2 or D1 call is a null.
 * `buildId`: the deployed build (OpenNext sets OPEN_NEXT_BUILD_ID when its bundle loads).
 */
export async function servePageFromCache(request: Request, env: FrontEnv, buildId: string | undefined, now = Date.now()): Promise<Response | null> {
  const bucket = env.NEXT_INC_CACHE_R2_BUCKET;
  const db = env.NEXT_TAG_CACHE_D1;
  if (!bucket || !db || !buildId) return null;
  const want = frontRequest(request);
  if (!want) return null;
  let object: R2ObjectBody | null = null;
  try {
    object = await bucket.get(frontKey(buildId, want.page, want.variant));
    if (!object) return null;
    const meta = object.customMetadata as Partial<FrontMeta> | undefined;
    const tags = (meta?.t ?? "").split(",").filter(Boolean);
    const revalidate = meta?.r ? Number(meta.r) : null;
    const lastModified = object.uploaded.getTime();
    if (tags.length === 0 || (revalidate !== null && !Number.isFinite(revalidate))) return discard(object);
    if (pastRevalidate(revalidate, lastModified, now)) return discard(object); // OpenNext serves it once more and refreshes it
    const rows = await db
      .prepare(`SELECT tag, revalidatedAt, stale, expire FROM revalidations WHERE tag IN (${tags.map(() => "?").join(", ")})`)
      .bind(...tags.map((t) => tagKey(buildId, t)))
      .raw<TagRow>();
    if (revalidatedSince(rows, lastModified, now)) return discard(object);

    const headers = new Headers({ "cache-control": BROWSER_CACHE_CONTROL, "content-type": want.variant.kind === "html" ? "text/html; charset=utf-8" : "text/x-component" });
    for (const [k, v] of Object.entries(parseHeaders(meta?.h))) headers.set(k, v);
    // weak: Cloudflare drops a strong ETag from an HTML answer (its HTML features may change the bytes), so the
    // browser would never have one to send back in If-None-Match
    const etag = `W/${object.httpEtag}`;
    headers.set("etag", etag);
    headers.set("vary", VARY);
    if (want.variant.kind === "segment") {
      headers.set("x-nextjs-prerender", "1");
      headers.set("x-nextjs-postponed", "2");
    }
    // as Next.js's middleware adapter tells the client router about a rewrite (RSC requests only)
    if (want.variant.kind !== "html" && want.rewritten) headers.set("x-nextjs-rewritten-path", want.page);
    headers.set("x-robots-tag", ROBOTS);
    headers.set("x-opennext-cache", "HIT");
    headers.set("x-page-cache", "front");
    if (notModified(request.headers.get("if-none-match"), etag)) {
      await object.body.cancel();
      return new Response(null, { status: 304, headers });
    }
    if (request.method === "HEAD") {
      await object.body.cancel();
      return new Response(null, { status: 200, headers });
    }
    return new Response(object.body, { status: 200, headers });
  } catch {
    if (object) await object.body.cancel().catch(() => {});
    return null;
  }
}

async function discard(object: R2ObjectBody): Promise<null> {
  await object.body.cancel().catch(() => {});
  return null;
}

function parseHeaders(json: string | undefined): Record<string, string> {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {};
  }
}
