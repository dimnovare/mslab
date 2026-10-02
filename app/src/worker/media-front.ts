import { canonicalPath } from "../lib/site-routing";
import { logFailure } from "../server/log";
import { isMediaKey, serveMedia, type MediaSource } from "../server/media";

// Uploaded images (/media/img/<uuid>.<ext>), answered by the Worker entry (worker.ts) before OpenNext and Next.js run.
//
// Why: Workers Free allows 10 ms CPU per request. Through OpenNext's routing, Next's middleware and the route handler
// (src/app/media/[...key]/route.ts) one image cost 8–15 ms on a warm isolate and 60–330 ms on a new one (final review
// I1, measured with `wrangler tail`), and a page with uploaded pictures asks for 10–25 of them at once. Here an image
// is a single R2 read (or an edge-cache read), with the same answer as the route: serveMedia() decides the key, the
// headers and the 404s; this adds only the X-Robots-Tag that next.config.ts headers() gives the route.
//
// The edge cache (Cache API, caches.default): a key never changes its bytes (a new upload gets a new key, and nothing
// deletes an image), so an image answered once is kept at that Cloudflare location and later requests there never
// reach R2. It works on the custom domain; on workers.dev the Cache API stores nothing, and every request reads R2.
//
// The Next route stays for `next dev` (which has no worker.ts) and answers what this leaves to OpenNext: other methods,
// and addresses the middleware redirects first (a trailing slash).

const PREFIX = "/media/";
const ROBOTS = "noindex, nofollow";

/** Where the answer came from (for diagnosis and the tests; nothing about the visitor): the edge cache or R2. */
export const MEDIA_SOURCE_HEADER = "x-media-cache";

export type MediaEnv = { MEDIA?: MediaSource };

/** The part of the Cache API used here (tests pass an in-memory fake). */
export type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

export type MediaEdge = { cache: EdgeCache | null; waitUntil(promise: Promise<unknown>): void };

/**
 * The media key a request asks for (decoded, as Next.js decodes the route's segments), or null when the Worker leaves
 * the request to OpenNext: not a GET or HEAD, not under /media/, or an address the middleware redirects first.
 */
export function mediaRequest(request: Request): string | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith(PREFIX) || canonicalPath(pathname) !== pathname) return null;
  const raw = pathname.slice(PREFIX.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // a malformed escape: not a media key, so a 404
  }
}

/** The answer for an uploaded image, or null for a request that is not one (then OpenNext answers it). Never throws. */
export async function mediaAnswer(request: Request, env: MediaEnv, edge: MediaEdge): Promise<Response | null> {
  const key = mediaRequest(request);
  if (key === null) return null;
  const head = request.method === "HEAD";
  try {
    // GET of a key putImage could have made: one edge-cache entry per image, whatever the query string or the headers
    const cache = !head && isMediaKey(key) ? edge.cache : null;
    const cacheKey = cache ? new Request(new URL(request.url).origin + PREFIX + key) : null;
    if (cache && cacheKey) {
      const hit = await cache.match(cacheKey).catch((e: unknown) => logFailure("[media] edge cache read failed", e));
      if (hit) return answer(hit, "edge", false);
    }
    if (!env.MEDIA) throw new Error("no MEDIA binding");
    const response = await serveMedia(env.MEDIA, key);
    if (cache && cacheKey && response.status === 200) {
      edge.waitUntil(cache.put(cacheKey, response.clone()).catch((e: unknown) => logFailure("[media] edge cache write failed", e)));
    }
    return answer(response, "r2", head);
  } catch (e) {
    logFailure("[media] read failed", e);
    return new Response("Server error", { status: 500, headers: { "cache-control": "no-store", "x-robots-tag": ROBOTS } });
  }
}

/** The response with X-Robots-Tag and its source; without its body for HEAD. */
function answer(response: Response, source: "edge" | "r2", head: boolean): Response {
  const headers = new Headers(response.headers);
  headers.set("x-robots-tag", ROBOTS);
  headers.set(MEDIA_SOURCE_HEADER, source);
  if (head) {
    response.body?.cancel().catch(() => {});
    return new Response(null, { status: response.status, headers });
  }
  return new Response(response.body, { status: response.status, headers });
}
