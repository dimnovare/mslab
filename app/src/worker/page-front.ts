import { routeSitePath } from "../lib/site-routing";
import { revalidatedSince, tagKey, tagSelect, type TagRow } from "../server/tag-cache";

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
// since its render began (the D1 tag cache rows, read as OpenNext's d1-next-tag-cache reads them: server/tag-cache.ts).
// Everything else, and any doubt, goes on to OpenNext unchanged, which then also refreshes what is stale.

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
  /** when the page's render began (ms): its date for the revalidation check (server/page-store.ts) */
  s?: string;
  /** the status to answer with when not 200: "404" for the site's 404 page (lib/site-routing.ts NOT_FOUND_SEGMENT) */
  c?: string;
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

/** Is a page dated `lastModified` past its revalidate time (seconds; null: none)? OpenNext's rule (cacheInterceptor). */
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
 * Why the front left a page request to OpenNext (sent as "x-page-cache: miss-<reason>", for diagnosis; nothing in it is
 * about the visitor): not stored yet, past its revalidate time, a tag revalidated since its render, stored without tags,
 * no build id or bindings, or a failing R2 / D1 call.
 */
export type FrontMiss = "not-stored" | "expired" | "revalidated" | "untagged" | "unavailable" | "error";

/**
 * The front's answer for `request`: a response, a miss with its reason (a page request OpenNext answers), or null for a
 * request that is not a cached-page request at all. Never throws.
 * `buildId`: the deployed build (OpenNext sets OPEN_NEXT_BUILD_ID when its bundle loads).
 */
export async function frontAnswer(
  request: Request,
  env: FrontEnv,
  buildId: string | undefined,
  now = Date.now(),
): Promise<{ response: Response } | { miss: FrontMiss } | null> {
  const want = frontRequest(request);
  if (!want) return null;
  const bucket = env.NEXT_INC_CACHE_R2_BUCKET;
  const db = env.NEXT_TAG_CACHE_D1;
  if (!bucket || !db || !buildId) return { miss: "unavailable" };
  let object: R2ObjectBody | null = null;
  try {
    object = await bucket.get(frontKey(buildId, want.page, want.variant));
    if (!object) return { miss: "not-stored" };
    const meta = object.customMetadata as Partial<FrontMeta> | undefined;
    const tags = (meta?.t ?? "").split(",").filter(Boolean);
    const revalidate = meta?.r ? Number(meta.r) : null;
    // dated by when its render began (server/page-store.ts); R2's upload time for an object written before that
    const started = Number(meta?.s);
    const lastModified = Number.isFinite(started) && started > 0 ? started : object.uploaded.getTime();
    if (tags.length === 0 || (revalidate !== null && !Number.isFinite(revalidate))) return discard(object, "untagged");
    if (pastRevalidate(revalidate, lastModified, now)) return discard(object, "expired"); // OpenNext serves it once more and refreshes it
    const rows = await db
      .prepare(tagSelect(tags.length))
      .bind(...tags.map((t) => tagKey(buildId, t)))
      .raw<TagRow>();
    if (revalidatedSince(rows, lastModified, now)) return discard(object, "revalidated");

    const headers = new Headers({ "cache-control": BROWSER_CACHE_CONTROL, "content-type": want.variant.kind === "html" ? "text/html; charset=utf-8" : "text/x-component" });
    for (const [k, v] of Object.entries(parseHeaders(meta?.h))) headers.set(k, v);
    // For If-None-Match (a 304 below). Cloudflare drops every ETag from an HTML answer, weak or strong, so in practice
    // this serves the RSC payloads and prefetch segments; a document is always sent in full. Weak: it validates only.
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
    // the 404 page: the same page for every unknown address, answered with its status (and never as "not modified")
    const status = meta?.c === "404" ? 404 : 200;
    if (status === 200 && notModified(request.headers.get("if-none-match"), etag)) {
      await object.body.cancel();
      return { response: new Response(null, { status: 304, headers }) };
    }
    if (request.method === "HEAD") {
      await object.body.cancel();
      return { response: new Response(null, { status, headers }) };
    }
    return { response: new Response(object.body, { status, headers }) };
  } catch (e) {
    console.error("[page-front] cache read failed, left to OpenNext:", e instanceof Error ? e.message : String(e));
    if (object) await object.body.cancel().catch(() => {});
    return { miss: "error" };
  }
}

/** The cached answer for `request`, or null (then OpenNext answers it). */
export async function servePageFromCache(request: Request, env: FrontEnv, buildId: string | undefined, now = Date.now()): Promise<Response | null> {
  const answer = await frontAnswer(request, env, buildId, now);
  return answer && "response" in answer ? answer.response : null;
}

/**
 * OpenNext's answer to a request the front did not answer: BROWSER_CACHE_CONTROL in place of a CDN Cache-Control, and
 * for a page request the front's reason in "x-page-cache: miss-<reason>".
 */
export function afterFront(response: Response, miss: FrontMiss | null): Response {
  const cdn = isCdnCacheControl(response.headers.get("cache-control"));
  if (!cdn && !miss) return response;
  const out = new Response(response.body, response);
  if (cdn) out.headers.set("cache-control", BROWSER_CACHE_CONTROL);
  if (miss) out.headers.set("x-page-cache", `miss-${miss}`);
  return out;
}

async function discard(object: R2ObjectBody, miss: FrontMiss): Promise<{ miss: FrontMiss }> {
  await object.body.cancel().catch(() => {});
  return { miss };
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
