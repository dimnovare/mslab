import { describe, expect, test } from "vitest";
import { routeSitePath } from "@/lib/site-routing";

// lib/site-routing.ts: the middleware's decisions as plain functions. The Worker's cached-page front reads the page the
// middleware would render (tests/unit/middleware.test.ts checks the middleware's answers themselves).

const route = (url: string) => {
  const u = new URL(url, "https://mslab.example");
  return routeSitePath(u.pathname, u.searchParams);
};

describe("routeSitePath", () => {
  test("public pages: ET under /et (rewritten), RU as they are, the cart of one course its own page", () => {
    expect(route("/")).toEqual({ kind: "page", page: "/et", rewritten: true });
    expect(route("/koolitused/x?sessioon=3")).toEqual({ kind: "page", page: "/et/koolitused/x", rewritten: true });
    expect(route("/ru")).toEqual({ kind: "page", page: "/ru", rewritten: false });
    expect(route("/ru/praktika?pakett=MAXI")).toEqual({ kind: "page", page: "/ru/praktika", rewritten: false });
    expect(route("/ostukorv?kursus=x")).toEqual({ kind: "page", page: "/et/ostukorv/x", rewritten: true });
    expect(route("/ru/ostukorv?kursus=x")).toEqual({ kind: "page", page: "/ru/ostukorv/x", rewritten: true });
    expect(route("/olematu")).toEqual({ kind: "page", page: "/et/olematu", rewritten: true }); // the 404 page, as before
  });

  test("redirects, the hub, the API and everything served as it is", () => {
    expect(route("/koolitused/")).toEqual({ kind: "redirect", path: "/koolitused" });
    expect(route("/et/koolitused")).toEqual({ kind: "redirect", path: "/koolitused" });
    // (a path, not a URL: new URL("//evil.example", base) would read evil.example as the host)
    expect(routeSitePath("//evil.example", new URLSearchParams())).toEqual({ kind: "redirect", path: "/evil.example" });
    expect(route("/guide/")).toEqual({ kind: "hub" });
    expect(route("/api/feedback")).toEqual({ kind: "api" });
    for (const p of ["/admin", "/admin/koolitused", "/media/img/a.jpg", "/_next/static/x.js", "/robots.txt", "/seed/a.jpg", "/og.jpg"]) expect(route(p), p).toEqual({ kind: "other" });
  });
});
