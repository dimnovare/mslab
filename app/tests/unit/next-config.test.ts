import { afterEach, describe, expect, test, vi } from "vitest";
import { MEDIA_CSP } from "@/server/media";

// next.config.ts headers(): the headers every answer carries (pages, API, /media, the static files of public/), and the
// stricter ones of single routes. A header given there replaces the route's own, and the later rule for the same path
// and header wins, so those come after the rule for every path. The e2e headers spec checks the answers themselves.

type Rule = { source: string; headers: { key: string; value: string }[] };

async function config(env: Record<string, string | undefined> = {}) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.resetModules();
  return (await import("../../next.config")).default;
}

afterEach(() => vi.unstubAllEnvs());

/** The value `path`'s answer gets for `key` from the rules (the last matching rule wins; simple sources only). */
function valueFor(rules: Rule[], path: string, key: string): string | undefined {
  const matches = (source: string) => (source.endsWith("/:path*") ? path === source.slice(0, -7) || path.startsWith(source.slice(0, -6)) : path === source);
  let value: string | undefined;
  for (const rule of rules) if (matches(rule.source)) for (const h of rule.headers) if (h.key.toLowerCase() === key.toLowerCase()) value = h.value;
  return value;
}

describe("next.config.ts headers()", () => {
  test("every answer: noindex, framing by this site only, the origin only as referrer", async () => {
    const rules = (await (await config()).headers!()) as Rule[];
    expect(rules[0]).toEqual({
      source: "/:path*",
      headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    });
    for (const path of ["/", "/koolitused", "/guide/", "/p/d/styles.css", "/robots.txt", "/_next/static/chunks/x.js", "/api/feedback"]) {
      expect(valueFor(rules, path, "x-robots-tag"), path).toBe("noindex, nofollow");
      expect(valueFor(rules, path, "content-security-policy"), path).toBe("frame-ancestors 'self'");
      expect(valueFor(rules, path, "referrer-policy"), path).toBe("strict-origin-when-cross-origin");
    }
  });

  test("routes with stricter values keep them: /media's sandbox CSP, the login link's no-referrer; admin and login never cached", async () => {
    const rules = (await (await config()).headers!()) as Rule[];
    expect(valueFor(rules, "/media/img/x.jpg", "content-security-policy")).toBe(MEDIA_CSP);
    expect(valueFor(rules, "/media/img/x.jpg", "x-robots-tag")).toBe("noindex, nofollow");
    expect(valueFor(rules, "/api/auth/verify", "referrer-policy")).toBe("no-referrer");
    expect(valueFor(rules, "/api/auth/request", "referrer-policy")).toBe("strict-origin-when-cross-origin");
    for (const path of ["/admin", "/admin/koolitused", "/api/auth/verify", "/api/admin/upload"]) expect(valueFor(rules, path, "cache-control"), path).toBe("no-store");
    expect(valueFor(rules, "/koolitused", "cache-control")).toBeUndefined(); // Next.js's own for the cached pages
  });

  test("the e2e page cache only when the e2e run's production build asks for it (E2E_PAGE_CACHE)", async () => {
    expect((await config({ E2E_PAGE_CACHE: undefined, VERCEL: undefined })).cacheHandler).toBeUndefined();
    expect((await config({ E2E_PAGE_CACHE: "/tmp/stale", VERCEL: undefined })).cacheHandler).toMatch(/tests[\\/]e2e[\\/]page-cache\.cjs$/);
  });

  test("...and never in a Vercel build: VERCEL set switches it off whatever E2E_PAGE_CACHE says", async () => {
    for (const vercel of ["1", "production"]) {
      const cfg = await config({ E2E_PAGE_CACHE: "/tmp/stale", VERCEL: vercel });
      expect(cfg.cacheHandler, `VERCEL=${vercel}`).toBeUndefined();
      expect(Object.keys(cfg), `VERCEL=${vercel}`).not.toContain("cacheHandler");
    }
    // VERCEL set to nothing is not a Vercel build
    expect((await config({ E2E_PAGE_CACHE: "/tmp/stale", VERCEL: "" })).cacheHandler).toMatch(/page-cache\.cjs$/);
  });
});
