import { describe, expect, test } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

const run = (path: string) => middleware(new NextRequest(new URL(path, "http://localhost")));
const rewrittenTo = (path: string) => {
  const to = run(path).headers.get("x-middleware-rewrite");
  return to ? new URL(to).pathname + new URL(to).search : null;
};
const passesThrough = (path: string) => {
  const res = run(path);
  return res.headers.get("x-middleware-next") === "1" && !res.headers.get("x-middleware-rewrite") && res.status === 200;
};

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

  test("admin, api, media, hub and static paths are not rewritten", () => {
    for (const p of ["/admin", "/admin/login", "/api/feedback", "/media/img/a.jpg", "/guide/", "/p/b/index.html", "/_next/static/chunk.js", "/feedback.js", "/robots.txt", "/favicon.ico", "/icon.svg", "/brand/logo.png", "/seed/r1.jpg", "/og.png"])
      expect(passesThrough(p), p).toBe(true);
  });

  test("paths that only start like a locale are still Estonian pages", () => {
    expect(rewrittenTo("/russia")).toBe("/et/russia");
    expect(rewrittenTo("/etude")).toBe("/et/etude");
  });
});
