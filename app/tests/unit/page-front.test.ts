import { describe, expect, test } from "vitest";
import {
  BROWSER_CACHE_CONTROL,
  forBrowsers,
  frontKey,
  frontRequest,
  isCdnCacheControl,
  isFrontPage,
  notModified,
  pastRevalidate,
  revalidatedSince,
  servePageFromCache,
  tagKey,
  VARY,
  type FrontMeta,
  type TagRow,
} from "@/worker/page-front";

// The cached-page front (src/worker/page-front.ts): what it answers, and that it leaves everything else to OpenNext.

const req = (path: string, init: RequestInit = {}) => new Request(`https://mslab.example${path}`, init);

describe("which requests the front may answer", () => {
  test("a public page: the document, the navigation payload and a prefetch segment, as the middleware routes it", () => {
    expect(frontRequest(req("/"))).toEqual({ page: "/et", rewritten: true, variant: { kind: "html" } });
    expect(frontRequest(req("/koolitused?vorm=e"))).toEqual({ page: "/et/koolitused", rewritten: true, variant: { kind: "html" } });
    expect(frontRequest(req("/ru/koolituskalender", { headers: { rsc: "1" } }))).toEqual({ page: "/ru/koolituskalender", rewritten: false, variant: { kind: "rsc" } });
    expect(frontRequest(req("/koolitused/x?_rsc=1", { headers: { rsc: "1", "next-router-segment-prefetch": "/_tree" } }))).toEqual({
      page: "/et/koolitused/x",
      rewritten: true,
      variant: { kind: "segment", segment: "/_tree" },
    });
    // the cart of one course is its own page
    expect(frontRequest(req("/ostukorv?kursus=kulmumeistri-e-koolitus"))?.page).toBe("/et/ostukorv/kulmumeistri-e-koolitus");
    expect(frontRequest(req("/ru/ostukorv?kursus=a-b"))?.page).toBe("/ru/ostukorv/a-b");
    expect(frontRequest(req("/praktika", { method: "HEAD" }))?.page).toBe("/et/praktika");
  });

  test("never: other methods, server actions, revalidation, preview, admin, API, media, redirects, odd paths", () => {
    expect(frontRequest(req("/", { method: "POST" }))).toBeNull();
    expect(frontRequest(req("/koolitused", { headers: { "next-action": "abc" } }))).toBeNull();
    expect(frontRequest(req("/et/koolitused", { headers: { "x-prerender-revalidate": "id" } }))).toBeNull();
    expect(frontRequest(req("/", { headers: { cookie: "a=1; __prerender_bypass=x" } }))).toBeNull();
    expect(frontRequest(req("/", { headers: { cookie: "__next_preview_data=x" } }))).toBeNull();
    for (const p of ["/admin", "/admin/koolitused", "/api/feedback", "/media/img/a.jpg", "/_next/static/a.js", "/robots.txt", "/guide/", "/koolitused/", "/et/koolitused", "/KOOLITUSED", "/koolitused/%C3%B5", "/ostukorv?kursus=%C3%B5"])
      expect(frontRequest(req(p)), p).toBeNull();
  });

  test("an admin's session cookie does not matter: public pages are the same for everyone", () => {
    expect(frontRequest(req("/koolitused", { headers: { cookie: "__Host-mslab_admin=abc" } }))?.page).toBe("/et/koolitused");
  });

  test("keys: build, page and variant", () => {
    expect(frontKey("B1", "/et/koolitused", { kind: "html" })).toBe("front/B1/et/koolitused#html");
    expect(frontKey("B1", "/ru", { kind: "rsc" })).toBe("front/B1/ru#rsc");
    expect(frontKey("B1", "/et", { kind: "segment", segment: "/_tree" })).toBe("front/B1/et#seg:%2F_tree");
    expect(isFrontPage("/et/koolitused/kulmumeistri-baaskoolitus")).toBe(true);
    expect(isFrontPage("/et/koolitused/Kulmud")).toBe(false);
    expect(isFrontPage("/admin")).toBe(false);
    expect(tagKey("B1", "_N_T_/layout")).toBe("B1/_N_T_/layout");
  });
});

describe("freshness, as OpenNext's D1 tag cache decides it", () => {
  const row = (revalidatedAt: number, expire: number | null = null): TagRow => ["t", revalidatedAt, revalidatedAt, expire];

  test("a revalidation (revalidatePath writes expire = now) after the page was stored makes it stale", () => {
    expect(revalidatedSince([], 1000, 5000)).toBe(false);
    expect(revalidatedSince([row(900, 900)], 1000, 5000)).toBe(false); // before the page
    expect(revalidatedSince([row(1100, 1100)], 1000, 5000)).toBe(true);
    expect(revalidatedSince([row(1100)], 1000, 5000)).toBe(true); // a stale-while-revalidate mark: OpenNext serves it once and refreshes
    // an expiry set before the page was rendered, still to come: fresh until then, stale after
    expect(revalidatedSince([row(900, 8000)], 1000, 5000)).toBe(false);
    expect(revalidatedSince([row(900, 8000)], 1000, 9000)).toBe(true);
  });

  test("past the revalidate time it goes to OpenNext (which serves it once more and refreshes it)", () => {
    expect(pastRevalidate(null, 0, 1e12)).toBe(false);
    expect(pastRevalidate(86400, 0, 86_399_000)).toBe(false);
    expect(pastRevalidate(86400, 0, 86_400_000)).toBe(true);
  });

  test("If-None-Match", () => {
    expect(notModified(null, '"a"')).toBe(false);
    expect(notModified('"a"', '"a"')).toBe(true);
    expect(notModified('W/"a"', '"a"')).toBe(true);
    expect(notModified('"b", "a"', '"a"')).toBe(true);
    expect(notModified("*", '"a"')).toBe(true);
    expect(notModified('"b"', '"a"')).toBe(false);
  });
});

describe("browsers never keep a page past its next request", () => {
  test("OpenNext's CDN Cache-Control (s-maxage + stale-while-revalidate) is replaced; others are left alone", () => {
    expect(isCdnCacheControl("s-maxage=86400, stale-while-revalidate=31449600")).toBe(true);
    expect(isCdnCacheControl("s-maxage=1, stale-while-revalidate=2592000")).toBe(true);
    expect(isCdnCacheControl("private, no-cache, no-store, max-age=0, must-revalidate")).toBe(false);
    expect(isCdnCacheControl("public, max-age=31536000, immutable")).toBe(false);
    expect(isCdnCacheControl(null)).toBe(false);

    const isr = new Response("x", { status: 200, headers: { "cache-control": "s-maxage=86400, stale-while-revalidate=31449600", "x-nextjs-cache": "MISS" } });
    const out = forBrowsers(isr);
    expect(out.headers.get("cache-control")).toBe(BROWSER_CACHE_CONTROL);
    expect(out.headers.get("x-nextjs-cache")).toBe("MISS");
    const admin = new Response("x", { headers: { "cache-control": "no-store" } });
    expect(forBrowsers(admin)).toBe(admin);
  });
});

/** An R2 bucket and a D1 database with just what the front calls. */
function fakes(objects: Record<string, { body: string; meta: FrontMeta; uploaded: number }>, rows: TagRow[] = []) {
  const reads: string[] = [];
  const queries: unknown[][] = [];
  const bucket = {
    async get(key: string) {
      reads.push(key);
      const o = objects[key];
      if (!o) return null;
      return { body: new Response(o.body).body!, customMetadata: o.meta, uploaded: new Date(o.uploaded), httpEtag: '"etag-1"' };
    },
  };
  const db = {
    prepare: () => ({
      bind: (...values: unknown[]) => ({
        raw: async () => {
          queries.push(values);
          return rows;
        },
      }),
    }),
  };
  return { env: { NEXT_INC_CACHE_R2_BUCKET: bucket as unknown as R2Bucket, NEXT_TAG_CACHE_D1: db as unknown as D1Database }, reads, queries };
}

describe("servePageFromCache", () => {
  const meta: FrontMeta = { t: "_N_T_/layout,_N_T_/et/koolitused", r: "86400", h: JSON.stringify({ "x-nextjs-stale-time": "300" }) };
  const NOW = 1_000_000_000_000;
  const stored = { body: "<html>cached</html>", meta, uploaded: NOW - 60_000 };

  test("a hit: the stored body with OpenNext's headers, browser-safe caching and the robots header", async () => {
    const f = fakes({ "front/B1/et/koolitused#html": stored });
    const res = (await servePageFromCache(req("/koolitused"), f.env, "B1", NOW))!;
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html>cached</html>");
    expect(Object.fromEntries(res.headers)).toMatchObject({
      "cache-control": BROWSER_CACHE_CONTROL,
      "content-type": "text/html; charset=utf-8",
      etag: 'W/"etag-1"', // weak: Cloudflare keeps it on HTML
      vary: VARY,
      "x-nextjs-stale-time": "300",
      "x-robots-tag": "noindex, nofollow",
      "x-page-cache": "front",
    });
    expect(res.headers.get("x-nextjs-rewritten-path")).toBeNull(); // documents only tell it for RSC
    expect(f.queries).toEqual([["B1/_N_T_/layout", "B1/_N_T_/et/koolitused"]]);
  });

  test("RSC and segments: their content type; the rewrite and the prerender headers as Next.js sends them", async () => {
    const f = fakes({ "front/B1/et/koolitused#rsc": stored, "front/B1/et/koolitused#seg:%2F_tree": stored, "front/B1/ru/koolitused#rsc": stored });
    const rsc = (await servePageFromCache(req("/koolitused?_rsc=a", { headers: { rsc: "1" } }), f.env, "B1", NOW))!;
    expect(rsc.headers.get("content-type")).toBe("text/x-component");
    expect(rsc.headers.get("x-nextjs-rewritten-path")).toBe("/et/koolitused");
    const seg = (await servePageFromCache(req("/koolitused?_rsc=b", { headers: { rsc: "1", "next-router-segment-prefetch": "/_tree" } }), f.env, "B1", NOW))!;
    expect(seg.headers.get("x-nextjs-prerender")).toBe("1");
    expect(seg.headers.get("x-nextjs-postponed")).toBe("2");
    const ru = (await servePageFromCache(req("/ru/koolitused", { headers: { rsc: "1" } }), f.env, "B1", NOW))!;
    expect(ru.headers.get("x-nextjs-rewritten-path")).toBeNull();
  });

  test("HEAD and a matching If-None-Match: no body", async () => {
    const f = fakes({ "front/B1/et/koolitused#html": stored });
    const head = (await servePageFromCache(req("/koolitused", { method: "HEAD" }), f.env, "B1", NOW))!;
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    const same = (await servePageFromCache(req("/koolitused", { headers: { "if-none-match": '"etag-1"' } }), f.env, "B1", NOW))!;
    expect(same.status).toBe(304);
    const weak = (await servePageFromCache(req("/koolitused", { headers: { "if-none-match": 'W/"etag-1"' } }), f.env, "B1", NOW))!;
    expect(weak.status).toBe(304); // what a browser sends back
    expect(same.headers.get("cache-control")).toBe(BROWSER_CACHE_CONTROL);
  });

  test("left to OpenNext: not stored, revalidated, past its time, no tags, no build id, no bindings, a failing call", async () => {
    expect(await servePageFromCache(req("/koolitused"), fakes({}).env, "B1", NOW)).toBeNull();
    const revalidated = fakes({ "front/B1/et/koolitused#html": stored }, [["B1/_N_T_/layout", NOW - 1000, NOW - 1000, NOW - 1000]]);
    expect(await servePageFromCache(req("/koolitused"), revalidated.env, "B1", NOW)).toBeNull();
    const old = fakes({ "front/B1/et/koolitused#html": { ...stored, uploaded: NOW - 86_400_000 } });
    expect(await servePageFromCache(req("/koolitused"), old.env, "B1", NOW)).toBeNull();
    const untagged = fakes({ "front/B1/et/koolitused#html": { ...stored, meta: { ...meta, t: "" } } });
    expect(await servePageFromCache(req("/koolitused"), untagged.env, "B1", NOW)).toBeNull();
    expect(await servePageFromCache(req("/koolitused"), fakes({ "front/B1/et/koolitused#html": stored }).env, undefined, NOW)).toBeNull();
    expect(await servePageFromCache(req("/koolitused"), {}, "B1", NOW)).toBeNull();
    const failing = { NEXT_INC_CACHE_R2_BUCKET: { get: async () => Promise.reject(new Error("R2 down")) } as unknown as R2Bucket, NEXT_TAG_CACHE_D1: fakes({}).env.NEXT_TAG_CACHE_D1 };
    expect(await servePageFromCache(req("/koolitused"), failing, "B1", NOW)).toBeNull();
    // and the admin, API and server actions are never even looked up
    const f = fakes({});
    for (const r of [req("/admin"), req("/api/feedback"), req("/koolitused", { method: "POST" })]) expect(await servePageFromCache(r, f.env, "B1", NOW)).toBeNull();
    expect(f.reads).toEqual([]);
  });
});
