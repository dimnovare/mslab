import { describe, expect, test } from "vitest";
import { frontObjects, interceptionKey } from "@/server/page-store";
import { sessionPagesRows, SESSION_WINDOW_MS } from "@/worker/session-starts";

// Task 17: what the page store writes besides OpenNext's own entry (server/page-store.ts), and the cron's tag rows
// (worker/session-starts.ts).

describe("page store", () => {
  test("a Next.js 16.3 page key also gets the key OpenNext's cache interception reads (the path)", () => {
    const hash = "a".repeat(64);
    expect(interceptionKey(`/route-cache/APP_PAGE/${hash}/$/et/koolitused`)).toBe("/et/koolitused");
    expect(interceptionKey(`/route-cache/APP_PAGE/${hash}/$/ru`)).toBe("/ru");
    expect(interceptionKey(`/route-cache/APP_ROUTE/${hash}/$/icon.svg`)).toBeNull();
    expect(interceptionKey("/et/koolitused")).toBeNull();
    expect(interceptionKey("fetch-key-123")).toBeNull();
  });

  const page = {
    type: "app",
    html: "<html></html>",
    rsc: "0:rsc",
    segmentData: { "/_tree": "tree", "/_full": "full" },
    revalidate: 86400,
    meta: { headers: { "x-next-cache-tags": "_N_T_/layout,_N_T_/et/koolitused", "x-nextjs-stale-time": "300" } },
  };

  test("the front gets the document, the RSC payload and each segment, with the tags and the revalidate time", () => {
    const front = frontObjects("/et/koolitused", page)!;
    expect(front.meta).toEqual({ t: "_N_T_/layout,_N_T_/et/koolitused", r: "86400", h: JSON.stringify({ "x-nextjs-stale-time": "300" }) });
    expect(front.objects).toEqual([
      [{ kind: "html" }, "<html></html>"],
      [{ kind: "rsc" }, "0:rsc"],
      [{ kind: "segment", segment: "/_tree" }, "tree"],
      [{ kind: "segment", segment: "/_full" }, "full"],
    ]);
    expect(frontObjects("/et/koolitused", { ...page, revalidate: false })!.meta.r).toBe("");
  });

  test("but not a 404 page, a postponed (PPR) one, one without tags, a page the front does not serve, or another entry kind", () => {
    expect(frontObjects("/et/koolitused/x", { ...page, meta: { ...page.meta, status: 404 } })).toBeNull();
    expect(frontObjects("/et/koolitused", { ...page, meta: { ...page.meta, postponed: "x" } })).toBeNull();
    expect(frontObjects("/et/koolitused", { ...page, meta: { headers: {} } })).toBeNull();
    expect(frontObjects("/et/koolitused", { ...page, rsc: undefined })).toBeNull();
    expect(frontObjects("/admin", page)).toBeNull();
    expect(frontObjects("/et/koolitused/%C3%B5", page)).toBeNull();
    expect(frontObjects("/et/koolitused", { type: "route", body: "x" })).toBeNull();
    // R2 metadata holds 2 KB: a page with more tags than that is left to OpenNext
    const many = Array.from({ length: 100 }, (_, i) => `_N_T_/some/long/tag/number/${i}`).join(",");
    expect(frontObjects("/et/koolitused", { ...page, meta: { headers: { "x-next-cache-tags": many } } })).toBeNull();
  });
});

describe("the cron after a session has begun", () => {
  test("marks the session pages stale as revalidatePath would (immediate expiry), keyed by the build", () => {
    const rows = sessionPagesRows("B1", 5000);
    expect(rows.map((r) => r.values)).toEqual([
      ["B1/_N_T_/[locale]/(site)/koolitused/layout", 5000, 5000, 5000],
      ["B1/_N_T_/[locale]/(site)/page", 5000, 5000, 5000],
      ["B1/_N_T_/[locale]/(site)/koolituskalender/page", 5000, 5000, 5000],
    ]);
    for (const r of rows) expect(r.sql).toBe("INSERT INTO revalidations (tag, revalidatedAt, stale, expire) VALUES (?, ?, ?, ?)");
  });

  test("looks back two cron periods (every 5 minutes), so one failed run is made up by the next", () => {
    expect(SESSION_WINDOW_MS).toBe(10 * 60_000);
  });
});
