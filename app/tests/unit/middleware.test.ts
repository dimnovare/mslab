import { describe, expect, test, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { canonicalPath, middleware, RELAY_HEADER } from "@/middleware";

// The path is appended to the origin as it is: new URL("//evil.example/", base) would parse "evil.example" as the host.
// (the answer is a promise only for the relay of an account shell asked for with a query of its own: those tests use `relayed`)
const run = (path: string) => middleware(new NextRequest(`http://localhost${path}`)) as NextResponse;
const rewrittenTo = (path: string) => {
  const to = run(path).headers.get("x-middleware-rewrite");
  return to ? new URL(to).pathname + new URL(to).search : null;
};
const passesThrough = (path: string) => {
  const res = run(path);
  return res.headers.get("x-middleware-next") === "1" && !res.headers.get("x-middleware-rewrite") && res.status === 200;
};

describe("noindex (the whole host stays out of search engines)", () => {
  test("every redirect the middleware makes says X-Robots-Tag: noindex, nofollow itself, wherever it is answered", () => {
    for (const p of ["/koolitused/", "/et/koolitused", "/et", "//evil.example/", "/ru/", "/guide", "/p/d", "/admin/"]) {
      const res = run(p);
      expect(res.status, p).toBeGreaterThanOrEqual(300);
      expect(res.headers.get("x-robots-tag"), p).toBe("noindex, nofollow");
    }
  });

  test("other answers leave it to next.config headers() (set here too, it could be sent twice)", () => {
    for (const p of ["/", "/koolitused", "/ru/koolitused", "/admin/login", "/api/feedback/", "/media/img/a.jpg", "/guide/", "/robots.txt"])
      expect(run(p).headers.get("x-robots-tag"), p).toBeNull();
  });
});

describe("an account shell asked for with a query of its own", () => {
  // Next.js keeps the address of the request that renders a page (path and query) in the page it stores, for every later visitor, and a
  // rewrite cannot change it. So such a request never renders the shell: the middleware asks for the address without the query and
  // passes the answer on (middleware.ts relayWithoutQuery).
  const shell = () =>
    new Response("<html>the shell</html>", {
      status: 200,
      headers: { "content-type": "text/html", "x-nextjs-cache": "HIT", "cache-control": "s-maxage=86400, stale-while-revalidate=31536000", "x-robots-tag": "noindex, nofollow", "content-encoding": "identity", "set-cookie": "a=b", "x-middleware-rewrite": "/et/konto/sisene", "x-middleware-request-x-foo": "1", "x-nextjs-rewritten-path": "/et/konto/sisene" },
    });
  const relayed = async (path: string, headers: Record<string, string> = {}, answer: () => Promise<Response> = async () => shell()) => {
    const fetchMock = vi.fn<(input: URL | string, init?: RequestInit) => Promise<Response>>(answer);
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = (await middleware(new NextRequest(`http://localhost${path}`, { headers }))) as NextResponse;
      return { res, fetchMock, asked: fetchMock.mock.calls.map(([url]) => String(url)), sent: new Headers(fetchMock.mock.calls[0]?.[1]?.headers) };
    } finally {
      vi.unstubAllGlobals();
    }
  };
  const rewrite = (res: NextResponse) => new URL(res.headers.get("x-middleware-rewrite")!).pathname;

  test("ET and RU: the clean address is fetched, whatever the query was, and its answer is the answer", async () => {
    for (const [path, clean] of [
      ["/konto/sisene?viga=link&korda=1&email=probe%40example.test", "http://localhost/konto/sisene"],
      ["/konto?viga=server", "http://localhost/konto"],
      ["/konto/kursus/kulmude-lami?x=1", "http://localhost/konto/kursus/kulmude-lami"],
      ["/ru/konto/sisene?korda=1", "http://localhost/ru/konto/sisene"],
      ["/ru/konto/kursus/kulmude-lami?email=probe%40example.test", "http://localhost/ru/konto/kursus/kulmude-lami"],
    ] as const) {
      const { res, asked } = await relayed(path);
      expect(asked, path).toEqual([clean]);
      expect(res.status, path).toBe(200);
      expect(await res.text(), path).toBe("<html>the shell</html>");
      expect(res.headers.get("x-middleware-rewrite"), path).toBeNull();
      expect(res.headers.get("x-nextjs-cache"), path).toBe("HIT");
    }
  });

  test("Next.js's own _rsc stays and nothing else of the query; the visitor's page headers go along, a cookie never does", async () => {
    const { asked, sent } = await relayed("/konto/sisene?viga=link&_rsc=abc12&email=probe%40example.test", {
      rsc: "1",
      "next-router-prefetch": "1",
      "next-router-state-tree": "%5B%5D",
      accept: "text/x-component",
      cookie: "__Host-mslab_client=secret; mslab_in=1",
      authorization: "Bearer x",
      "x-forwarded-for": "10.0.0.1",
    });
    expect(asked).toEqual(["http://localhost/konto/sisene?_rsc=abc12"]);
    expect([...sent.keys()].sort()).toEqual(["accept", "next-router-prefetch", "next-router-state-tree", "rsc", RELAY_HEADER].sort());
    expect(sent.get("cookie")).toBeNull();
  });

  test("the answer is not kept by anyone on the way, and carries no header another layer adds again or that fetch has already used up", async () => {
    const { res } = await relayed("/konto/sisene?viga=link");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    for (const name of ["content-encoding", "content-length", "transfer-encoding", "set-cookie", "x-robots-tag"]) expect(res.headers.get(name), name).toBeNull();
    // the headers of the middleware that answered the relayed request are for that request (here they would be taken for this one's own)
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-foo")).toBeNull();
    // the router's own information about the page goes on
    expect(res.headers.get("x-nextjs-rewritten-path")).toBe("/et/konto/sisene");
    expect(res.headers.get("content-type")).toBe("text/html");
  });

  test("a status and a redirect of the clean address are passed on as they are (never followed)", async () => {
    const { res, fetchMock } = await relayed("/konto/sisene?viga=link", {}, async () => new Response(null, { status: 307, headers: { location: "/konto/sisene?_rsc=zz" } }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/konto/sisene?_rsc=zz");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual", method: "GET" });
  });

  test("no answer from the clean address, or one that is no shell (4xx, 5xx: a platform's page that wants a sign-in): the page is rendered as for any other request (a rewrite), never that answer in its place", async () => {
    const fail = async (): Promise<Response> => {
      throw new TypeError("fetch failed");
    };
    expect(rewrite((await relayed("/konto/sisene?viga=link", {}, fail)).res)).toBe("/et/konto/sisene");
    expect(rewrite((await relayed("/ru/konto/sisene?viga=link", {}, fail)).res)).toBe("/ru/konto/sisene");
    for (const status of [401, 403, 404, 500, 503]) {
      const { res } = await relayed("/konto/sisene?viga=link", {}, async () => new Response("<html>sign in to see this deployment</html>", { status, headers: { "content-type": "text/html" } }));
      expect(res.status, String(status)).toBe(200);
      expect(rewrite(res), String(status)).toBe("/et/konto/sisene");
    }
  });

  test("a relay never relays again, and only a GET is relayed; the public pages and the API are never relayed", async () => {
    const again = await relayed("/konto/sisene?viga=link", { [RELAY_HEADER]: "1" });
    expect(again.asked).toEqual([]);
    expect(rewrite(again.res)).toBe("/et/konto/sisene");
    for (const path of ["/koolitused/x?sessioon=1", "/ru/koolitused?x=1", "/?uudiskiri=kinnitatud", "/ostukorv?kursus=x", "/api/konto/verify?t=abc", "/admin?x=1", "/konto/x/y?z=1"]) {
      const { asked } = await relayed(path);
      expect(asked, path).toEqual([]);
    }
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const post = middleware(new NextRequest("http://localhost/konto/sisene?viga=link", { method: "POST" })) as NextResponse;
      expect(rewrite(post)).toBe("/et/konto/sisene");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("locale middleware", () => {
  test("Estonian pages are served from the et locale without changing the URL", () => {
    expect(rewrittenTo("/")).toBe("/et");
    expect(rewrittenTo("/koolitused")).toBe("/et/koolitused");
    expect(rewrittenTo("/koolitused/kulmumeistri-baaskoolitus?sessioon=3")).toBe("/et/koolitused/kulmumeistri-baaskoolitus?sessioon=3");
  });

  test("an account shell with no query of its own is served as before: ET rewritten to /et, RU as it is (Next's own _rsc does not count)", () => {
    expect(rewrittenTo("/konto/sisene")).toBe("/et/konto/sisene");
    expect(rewrittenTo("/konto/kursus/kulmude-lami")).toBe("/et/konto/kursus/kulmude-lami");
    expect(rewrittenTo("/konto/sisene?_rsc=abc12")).toBe("/et/konto/sisene?_rsc=abc12");
    expect(passesThrough("/ru/konto/sisene")).toBe(true);
    expect(passesThrough("/ru/konto")).toBe(true);
    expect(passesThrough("/ru/konto?_rsc=abc12")).toBe(true);
  });

  test("the public pages keep their query (the cart's course, the course page's date, the practice package)", () => {
    expect(rewrittenTo("/koolitused/kulmude-lami?sessioon=3")).toBe("/et/koolitused/kulmude-lami?sessioon=3");
    expect(rewrittenTo("/ostukorv?kursus=x")).toBe("/et/ostukorv/x?kursus=x");
    expect(passesThrough("/ru/koolitused?kategooria=x")).toBe(true);
  });

  test("Russian pages render app/[locale]=ru directly", () => {
    expect(passesThrough("/ru")).toBe(true);
    expect(passesThrough("/ru/koolitused")).toBe(true);
  });

  test("an explicit /et prefix redirects permanently to the unprefixed URL", () => {
    for (const [from, to] of [["/et", "/"], ["/et/", "/"], ["/et/koolitused", "/koolitused"], ["/et/koolitused?x=1", "/koolitused?x=1"]]) {
      const res = run(from);
      expect(res.status, from).toBe(308);
      const location = new URL(res.headers.get("location")!);
      expect(location.pathname + location.search, from).toBe(to);
    }
  });

  test("admin, api, media, hub files and static paths are not rewritten", () => {
    for (const p of ["/admin", "/admin/login", "/api/feedback", "/api/feedback/abc123def456gh", "/media/img/a.jpg", "/p/b/index.html", "/p/d/assets/logo.png", "/guide/og.jpg", "/guide/thumbs/a-d.jpg", "/_next/static/chunk.js", "/feedback.js", "/robots.txt", "/favicon.ico", "/icon.svg", "/brand/logo.png", "/seed/r1.jpg", "/og.png", "/og.jpg"])
      expect(passesThrough(p), p).toBe(true);
  });

  test("paths that only start like a locale are still Estonian pages (the Estonian 404 page: they name no page)", () => {
    expect(rewrittenTo("/russia")).toBe("/et/leidmata");
    expect(rewrittenTo("/etude")).toBe("/et/leidmata");
  });

  test("the cart of one course is a page of its own, so that it can be cached by its path (Task 17)", () => {
    expect(rewrittenTo("/ostukorv?kursus=kulmumeistri-e-koolitus")).toBe("/et/ostukorv/kulmumeistri-e-koolitus?kursus=kulmumeistri-e-koolitus");
    expect(rewrittenTo("/ru/ostukorv?kursus=kulmumeistri-e-koolitus")).toBe("/ru/ostukorv/kulmumeistri-e-koolitus?kursus=kulmumeistri-e-koolitus");
    expect(rewrittenTo("/ostukorv?kursus=a%2Fb")).toBe("/et/ostukorv/a%2Fb?kursus=a%2Fb"); // one path segment, whatever it says
    // without a course: the empty cart
    expect(rewrittenTo("/ostukorv")).toBe("/et/ostukorv");
    expect(rewrittenTo("/ostukorv?kursus=")).toBe("/et/ostukorv?kursus=");
    expect(passesThrough("/ru/ostukorv")).toBe(true);
  });

  test("paths that only start like the hub, a static file or the OG image are Estonian pages (here: the 404 page)", () => {
    for (const p of ["/guidexyz", "/guides", "/p", "/feedback.json", "/feedback.jsx", "/robots.txt.bak", "/og.html", "/og.jpg.html", "/ogx", "/og.svg"])
      expect(rewrittenTo(p), p).toBe("/et/leidmata");
  });

  test("every address without a page of its own is served from its locale's one 404 page (round 2 item 21)", () => {
    for (const p of ["/wp-admin", "/wp-login.php", "/.env", "/xmlrpc.php", "/olematu-leht", "/koolitused/Suur", "/koolitused/a/b", "/uudised/x.php", "/leidmata"])
      expect(rewrittenTo(p), p).toBe("/et/leidmata");
    for (const p of ["/ru/net-takoj", "/ru/wp-admin", "/ru/koolitused/a/b"]) expect(rewrittenTo(p), p).toBe("/ru/leidmata");
    // the pages themselves stay as they are
    expect(rewrittenTo("/koolitused/kulmumeistri-baaskoolitus")).toBe("/et/koolitused/kulmumeistri-baaskoolitus");
    expect(rewrittenTo("/uudised/x")).toBe("/et/uudised/x");
    expect(rewrittenTo("/ru/koolituskalender")).toBeNull(); // /ru/* renders as it is
  });
});

describe("design-review hub (public/guide, public/p/<dir>)", () => {
  test("a hub folder with its slash serves its index.html (next dev; in production the static assets do it)", () => {
    expect(rewrittenTo("/guide/")).toBe("/guide/index.html");
    expect(rewrittenTo("/guide/tagasiside/")).toBe("/guide/tagasiside/index.html");
    expect(rewrittenTo("/p/d/")).toBe("/p/d/index.html");
    expect(rewrittenTo("/p/moodboard/")).toBe("/p/moodboard/index.html");
    expect(rewrittenTo("/guide/?fb=abc123def456gh")).toBe("/guide/index.html?fb=abc123def456gh");
  });

  test("a hub folder without its slash redirects to it (as the static assets do), keeping the query", () => {
    for (const [from, to] of [["/guide", "/guide/"], ["/guide/tagasiside", "/guide/tagasiside/"], ["/p/d", "/p/d/"], ["/p/d?fb=abc123def456gh", "/p/d/?fb=abc123def456gh"]]) {
      const res = run(from);
      expect(res.status, from).toBe(307);
      const location = new URL(res.headers.get("location")!);
      expect(location.pathname + location.search, from).toBe(to);
    }
  });
});

describe("trailing slash (Next's own redirect is off for the hub: next.config skipTrailingSlashRedirect)", () => {
  test("every other path loses its trailing slash with a permanent redirect, keeping the query", () => {
    for (const [from, to] of [
      ["/koolitused/", "/koolitused"],
      ["/koolitused/kulmumeistri-baaskoolitus/?sessioon=3", "/koolitused/kulmumeistri-baaskoolitus?sessioon=3"],
      ["/ru/", "/ru"],
      ["/ru/koolitused/", "/ru/koolitused"],
      ["/admin/", "/admin"],
      ["/guidexyz/", "/guidexyz"],
      ["/et/koolitused/", "/koolitused"],
    ]) {
      const res = run(from);
      expect(res.status, from).toBe(308);
      const location = new URL(res.headers.get("location")!);
      expect(location.origin + location.pathname + location.search, from).toBe(`http://localhost${to}`);
    }
  });

  test("API routes are never redirected (a POST to /api/x/ must not turn into a GET elsewhere)", () => {
    for (const p of ["/api/feedback/", "/api/feedback", "/api/auth/request/", "/api/feedback/abc123def456gh/"]) expect(passesThrough(p), p).toBe(true);
  });

  test("a redirect never leaves the site: leading slashes and backslashes collapse to one slash", () => {
    // Next.js turns a same-origin Location into a relative one: "//evil.example" there would be another host.
    for (const [from, to] of [
      ["//evil.example/", "/evil.example"],
      ["///evil.example/", "/evil.example"],
      ["//evil.example/x/?q=1", "/evil.example/x?q=1"],
      ["/et//evil.example", "/evil.example"],
      ["/et//evil.example/", "/evil.example"],
      ["//", "/"],
    ]) {
      const res = run(from);
      expect(res.status, from).toBe(308);
      const location = new URL(res.headers.get("location")!);
      expect(location.origin, from).toBe("http://localhost");
      expect(location.pathname + location.search, from).toBe(to);
      expect(location.pathname.startsWith("//"), from).toBe(false);
    }
  });

  test("encoded slashes and backslashes stay part of a same-origin path (%2F, %5C are not separators)", () => {
    for (const [from, to] of [
      ["/%2F%2Fevil.com/", "/%2F%2Fevil.com"],
      ["/%5C%5Cevil.com/", "/%5C%5Cevil.com"],
      ["/et/%2F%2Fevil.com/", "/%2F%2Fevil.com"],
      ["/et/%2F%2Fevil.com", "/%2F%2Fevil.com"],
    ]) {
      const res = run(from);
      expect(res.status, from).toBe(308);
      const raw = res.headers.get("location")!;
      const location = new URL(raw);
      expect(location.origin, from).toBe("http://localhost");
      expect(location.pathname, from).toBe(to);
      expect(location.pathname.startsWith("//") || location.pathname.startsWith("/\\"), from).toBe(false);
      // as a browser resolves the relative Location Next.js sends (path only): still this site
      expect(new URL(location.pathname, "https://mslab.example").origin, from).toBe("https://mslab.example");
    }
    // without a trailing slash or /et there is nothing to redirect: an Estonian page (a 404)
    expect(rewrittenTo("/%2F%2Fevil.com")).toBe("/et/leidmata");
  });

  test("canonicalPath: one slash in front, none at the end, no /et prefix", () => {
    expect(canonicalPath("//evil.example/")).toBe("/evil.example");
    expect(canonicalPath("/\\evil.example")).toBe("/evil.example");
    expect(canonicalPath("/\\/evil.example/")).toBe("/evil.example");
    expect(canonicalPath("/et//evil.example")).toBe("/evil.example");
    expect(canonicalPath("/et/\\evil.example")).toBe("/evil.example");
    expect(canonicalPath("/koolitused/")).toBe("/koolitused");
    expect(canonicalPath("/et")).toBe("/");
    expect(canonicalPath("/")).toBe("/");
    expect(canonicalPath("/koolitused")).toBe("/koolitused");
  });

  test("the home page keeps its slash", () => {
    expect(rewrittenTo("/")).toBe("/et");
    expect(rewrittenTo("/?x=1")).toBe("/et?x=1");
  });
});
