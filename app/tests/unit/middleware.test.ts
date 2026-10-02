import { describe, expect, test } from "vitest";
import { NextRequest } from "next/server";
import { canonicalPath, middleware } from "@/middleware";

// The path is appended to the origin as it is: new URL("//evil.example/", base) would parse "evil.example" as the host.
const run = (path: string) => middleware(new NextRequest(`http://localhost${path}`));
const rewrittenTo = (path: string) => {
  const to = run(path).headers.get("x-middleware-rewrite");
  return to ? new URL(to).pathname + new URL(to).search : null;
};
const passesThrough = (path: string) => {
  const res = run(path);
  return res.headers.get("x-middleware-next") === "1" && !res.headers.get("x-middleware-rewrite") && res.status === 200;
};

describe("noindex (the whole host stays out of search engines)", () => {
  test("every answer of the middleware says X-Robots-Tag: noindex, nofollow — rewrites, pass-throughs and redirects", () => {
    for (const p of ["/", "/koolitused", "/ru", "/ru/koolitused", "/admin/login", "/api/feedback", "/api/feedback/", "/media/img/a.jpg", "/guide/", "/guide", "/p/d/", "/p/d/styles.css", "/koolitused/", "/et/koolitused", "//evil.example/", "/robots.txt", "/og.jpg"])
      expect(run(p).headers.get("x-robots-tag"), p).toBe("noindex, nofollow");
  });
});

describe("locale middleware", () => {
  test("Estonian pages are served from the et locale without changing the URL", () => {
    expect(rewrittenTo("/")).toBe("/et");
    expect(rewrittenTo("/koolitused")).toBe("/et/koolitused");
    expect(rewrittenTo("/koolitused/kulmumeistri-baaskoolitus?sessioon=3")).toBe("/et/koolitused/kulmumeistri-baaskoolitus?sessioon=3");
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

  test("paths that only start like a locale are still Estonian pages", () => {
    expect(rewrittenTo("/russia")).toBe("/et/russia");
    expect(rewrittenTo("/etude")).toBe("/et/etude");
  });

  test("paths that only start like the hub, a static file or the OG image are Estonian pages", () => {
    for (const p of ["/guidexyz", "/guides", "/p", "/feedback.json", "/feedback.jsx", "/robots.txt.bak", "/og.html", "/og.jpg.html", "/ogx", "/og.svg"])
      expect(rewrittenTo(p), p).toBe(`/et${p}`);
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
