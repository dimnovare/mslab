import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { PREVIEW_COOKIE, signPreview } from "@/lib/preview-cookie";

// The coming-soon gate in the middleware (lib/site-gate.ts decides): SITE_GATE on, a visitor without the preview cookie gets the
// coming-soon page by a rewrite (status 200, the address bar keeps the URL, next.config headers() add X-Robots-Tag as for every
// answer); an /api address is answered 404 without a page; the preview cookie and the always-through addresses get the
// middleware's usual answers. Gate off: the middleware is what it was, synchronous answers included.

const SECRET = "preview-secret-for-tests-0123456789abcdef";

/** The middleware module, loaded afresh (its "logged once" note is module state). */
async function load() {
  vi.resetModules();
  return (await import("@/middleware")).middleware;
}

const request = (path: string, init: { method?: string; headers?: Record<string, string>; cookie?: string } = {}) => {
  const headers = { ...init.headers, ...(init.cookie !== undefined ? { cookie: `${PREVIEW_COOKIE}=${init.cookie}` } : {}) };
  return new NextRequest(`http://localhost${path}`, { method: init.method ?? "GET", headers });
};

async function answer(path: string, init?: Parameters<typeof request>[1]) {
  const middleware = await load();
  const res: NextResponse = await middleware(request(path, init));
  const rewrite = res.headers.get("x-middleware-rewrite");
  const location = res.headers.get("location");
  return {
    status: res.status,
    rewrite: rewrite ? new URL(rewrite).pathname + new URL(rewrite).search : null,
    location: location ? new URL(location).pathname + new URL(location).search + new URL(location).hash : null,
    next: res.headers.get("x-middleware-next"),
    robots: res.headers.get("x-robots-tag"),
    cache: res.headers.get("cache-control"),
    type: res.headers.get("content-type"),
    body: res.body ? await new Response(res.body).text() : "",
  };
}

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("gate off (SITE_GATE unset, blank or 0): the middleware as it was", () => {
  test("answers synchronously, as before, whatever the cookie", async () => {
    for (const value of [undefined, "", "0"]) {
      if (value !== undefined) vi.stubEnv("SITE_GATE", value);
      const middleware = await load();
      const res = middleware(request("/koolitused"));
      expect(res instanceof Promise, String(value)).toBe(false);
      expect(new URL((res as NextResponse).headers.get("x-middleware-rewrite")!).pathname).toBe("/et/koolitused");
    }
  });

  test("the pages, the account's 303 and the redirects are today's", async () => {
    expect(await answer("/")).toMatchObject({ status: 200, rewrite: "/et" });
    expect(await answer("/ru/koolitused")).toMatchObject({ status: 200, next: "1", rewrite: null });
    expect(await answer("/konto/sisene?viga=link")).toMatchObject({ status: 303, location: "/konto/sisene#viga=link" });
    // the coming-soon page is no page of the site
    for (const path of ["/tulekul", "/tulekul/et", "/tulekul/ru"]) expect(await answer(path), path).toMatchObject({ status: 200, rewrite: "/et/leidmata" });
    expect(await answer("/api/konto/me")).toMatchObject({ status: 200, next: "1" });
  });
});

describe("gate on, a visitor (no valid preview cookie)", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_GATE", "1");
    vi.stubEnv("PREVIEW_SECRET", SECRET);
  });

  test("every page is the coming-soon page of its language, by a rewrite (200, the address is kept, the query too)", async () => {
    for (const [path, to] of [
      ["/", "/tulekul/et"],
      ["/koolitused", "/tulekul/et"],
      ["/koolitused/kulmude-lami?sessioon=3", "/tulekul/et?sessioon=3"],
      ["/?uudiskiri=kinnitatud", "/tulekul/et?uudiskiri=kinnitatud"],
      ["/ostukorv?kursus=x", "/tulekul/et?kursus=x"],
      ["/konto", "/tulekul/et"],
      ["/et/koolitused", "/tulekul/et"],
      ["/koolitused/", "/tulekul/et"],
      ["/guide/", "/tulekul/et"],
      ["/p/d/", "/tulekul/et"],
      ["/wp-login.php", "/tulekul/et"],
      ["/ru", "/tulekul/ru"],
      ["/ru/koolitused", "/tulekul/ru"],
      ["/ru/konto/sisene", "/tulekul/ru"],
      ["/ru?uudiskiri=kinnitatud", "/tulekul/ru?uudiskiri=kinnitatud"],
    ] as const) {
      const res = await answer(path);
      expect(res, path).toMatchObject({ status: 200, rewrite: to, location: null });
      expect(res.robots, `${path}: left to next.config headers(), as for every rewrite`).toBeNull();
    }
  });

  test("the account's shells with a query get the coming-soon page too, never their 303", async () => {
    for (const path of ["/konto/sisene?viga=link", "/ru/konto?korda=1"]) expect(await answer(path), path).toMatchObject({ status: 200, location: null, rewrite: expect.stringMatching(/^\/tulekul\/(et|ru)\?/) });
  });

  test("any method: the newsletter form's server action (a POST to the page's own address) lands on the coming-soon page", async () => {
    for (const method of ["POST", "HEAD", "PUT", "DELETE", "OPTIONS"]) {
      const res = await answer("/koolitused", { method, headers: { "next-action": "abc123", accept: "text/x-component" } });
      expect(res, method).toMatchObject({ status: 200, rewrite: "/tulekul/et" });
    }
  });

  test("a gated /api address: 404 JSON, never kept, noindex said here (the middleware answers it itself)", async () => {
    for (const method of ["GET", "POST"]) {
      for (const path of ["/api/konto/me", "/api/konto/request", "/api/feedback", "/api/feedback/1", "/api", "/api/nope"]) {
        const res = await answer(path, { method });
        expect(res, `${method} ${path}`).toMatchObject({ status: 404, rewrite: null, location: null, robots: "noindex, nofollow", cache: "no-store" });
        expect(res.type).toContain("application/json");
        expect(JSON.parse(res.body)).toEqual({ ok: false, error: "not_found" });
      }
    }
  });

  test("the always-through addresses get the middleware's usual answers", async () => {
    expect(await answer("/admin/login")).toMatchObject({ status: 200, next: "1", rewrite: null });
    expect(await answer("/admin")).toMatchObject({ status: 200, next: "1", rewrite: null });
    expect(await answer("/admin/")).toMatchObject({ status: 308, location: "/admin", robots: "noindex, nofollow" });
    for (const path of ["/api/auth/verify?t=x", "/api/auth/logout", "/api/admin/preview", "/api/cron/sweep", "/api/bunny/webhook", "/api/newsletter/confirm?t=x", "/media/img/a.jpg", "/favicon.ico", "/robots.txt", "/og.jpg", "/brand/logo.png", "/icon.svg"])
      expect(await answer(path), path).toMatchObject({ status: 200, next: "1", rewrite: null });
    expect(await answer("/api/auth/logout", { method: "POST" })).toMatchObject({ status: 200, next: "1" });
  });

  test("an expired, tampered or foreign cookie is no pass", async () => {
    const now = Date.now();
    const good = await signPreview(SECRET, now);
    const [exp, sig] = good.split(".");
    for (const cookie of [await signPreview(SECRET, now - 31 * 86_400_000), await signPreview("another-secret-0123456789abcdef", now), `${Number(exp) + 60}.${sig}`, "", "1"])
      expect(await answer("/koolitused", { cookie }), cookie).toMatchObject({ status: 200, rewrite: "/tulekul/et" });
  });
});

describe("gate on, an admin (a valid preview cookie)", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_GATE", "1");
    vi.stubEnv("PREVIEW_SECRET", SECRET);
  });

  test("every request gets the middleware's usual answer, the account's 303 and the 404 page included", async () => {
    const cookie = await signPreview(SECRET);
    expect(await answer("/", { cookie })).toMatchObject({ status: 200, rewrite: "/et" });
    expect(await answer("/koolitused", { cookie })).toMatchObject({ status: 200, rewrite: "/et/koolitused" });
    expect(await answer("/ru/koolitused", { cookie })).toMatchObject({ status: 200, next: "1", rewrite: null });
    expect(await answer("/ostukorv?kursus=x", { cookie })).toMatchObject({ status: 200, rewrite: "/et/ostukorv/x?kursus=x" });
    expect(await answer("/konto/sisene?viga=link", { cookie })).toMatchObject({ status: 303, location: "/konto/sisene#viga=link", cache: "no-store" });
    expect(await answer("/koolitused/", { cookie })).toMatchObject({ status: 308, location: "/koolitused" });
    expect(await answer("/api/konto/me", { cookie })).toMatchObject({ status: 200, next: "1" });
    expect(await answer("/guide/", { cookie })).toMatchObject({ status: 200, rewrite: "/guide/index.html" });
    // the coming-soon page is what the gate shows, not a page of the site
    expect(await answer("/tulekul", { cookie })).toMatchObject({ status: 200, rewrite: "/et/leidmata" });
    expect(await answer("/ru/tulekul", { cookie })).toMatchObject({ status: 200, rewrite: "/ru/leidmata" });
    expect(await answer("/tulekul/et", { cookie })).toMatchObject({ status: 200, rewrite: "/et/leidmata" });
    expect(await answer("/tulekul/ru", { cookie })).toMatchObject({ status: 200, rewrite: "/et/leidmata" });
  });
});

describe("gate on without PREVIEW_SECRET", () => {
  test("nobody passes but to the always-through addresses, and it is logged once, not on every request", async () => {
    vi.stubEnv("SITE_GATE", "1");
    const cookie = await signPreview(SECRET);
    const middleware = await load();
    const run = async (path: string) => {
      const res: NextResponse = await middleware(request(path, { cookie }));
      return { status: res.status, rewrite: res.headers.get("x-middleware-rewrite") };
    };
    expect(await run("/")).toMatchObject({ status: 200, rewrite: expect.stringContaining("/tulekul/et") });
    expect(await run("/ru/koolitused")).toMatchObject({ status: 200, rewrite: expect.stringContaining("/tulekul/ru") });
    expect((await run("/api/konto/me")).status).toBe(404);
    expect(await run("/admin/login")).toMatchObject({ status: 200, rewrite: null });
    const notes = vi.mocked(console.error).mock.calls.flat().join("\n");
    expect(vi.mocked(console.error)).toHaveBeenCalledTimes(1);
    expect(notes).toContain("PREVIEW_SECRET");
    expect(notes).not.toContain(SECRET);
  });
});
