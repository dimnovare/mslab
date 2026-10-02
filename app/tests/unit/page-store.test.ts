import { afterEach, describe, expect, test, vi } from "vitest";
import pageStore, { entryDate, frontObjects, interceptionKey, STARTED_AT, withStartedAt } from "@/server/page-store";
import { runAsRequest } from "@/worker/request-context";
import { sessionPagesRows, SESSION_WINDOW_MS } from "@/worker/session-starts";

// Task 17: what the page store writes besides OpenNext's own entry (server/page-store.ts), and the cron's tag rows
// (worker/session-starts.ts).

/** A page entry as Next.js hands it to OpenNext's cache. */
const page = {
  type: "app",
  html: "<html></html>",
  rsc: "0:rsc",
  segmentData: { "/_tree": "tree", "/_full": "full" },
  revalidate: 86400,
  meta: { headers: { "x-next-cache-tags": "_N_T_/layout,_N_T_/et/koolitused", "x-nextjs-stale-time": "300" } },
};

describe("page store", () => {
  test("a Next.js 16.3 page key also gets the key OpenNext's cache interception reads (the path)", () => {
    const hash = "a".repeat(64);
    expect(interceptionKey(`/route-cache/APP_PAGE/${hash}/$/et/koolitused`)).toBe("/et/koolitused");
    expect(interceptionKey(`/route-cache/APP_PAGE/${hash}/$/ru`)).toBe("/ru");
    expect(interceptionKey(`/route-cache/APP_ROUTE/${hash}/$/icon.svg`)).toBeNull();
    expect(interceptionKey("/et/koolitused")).toBeNull();
    expect(interceptionKey("fetch-key-123")).toBeNull();
  });


  test("the front gets the document, the RSC payload and each segment, with the tags and the revalidate time", () => {
    const front = frontObjects("/et/koolitused", page, 123)!;
    expect(front.meta).toEqual({ t: "_N_T_/layout,_N_T_/et/koolitused", r: "86400", h: JSON.stringify({ "x-nextjs-stale-time": "300" }), s: "123" });
    expect(front.objects).toEqual([
      [{ kind: "html" }, "<html></html>"],
      [{ kind: "rsc" }, "0:rsc"],
      [{ kind: "segment", segment: "/_tree" }, "tree"],
      [{ kind: "segment", segment: "/_full" }, "full"],
    ]);
    expect(frontObjects("/et/koolitused", { ...page, revalidate: false }, 123)!.meta.r).toBe("");
  });

  test("the site's one 404 page per locale is kept with its status (round 2 item 21); a 200 there is not", () => {
    const notFound = { ...page, meta: { ...page.meta, status: 404 } };
    expect(frontObjects("/et/leidmata", notFound, 123)!.meta).toMatchObject({ c: "404", s: "123" });
    expect(frontObjects("/ru/leidmata", notFound, 123)!.meta.c).toBe("404");
    expect(frontObjects("/et/leidmata", page, 123)).toBeNull();
    expect(frontObjects("/et/koolitused", page, 123)!.meta).not.toHaveProperty("c");
  });

  test("but not a 404 page, a postponed (PPR) one, one without tags, a page the front does not serve, or another entry kind", () => {
    expect(frontObjects("/et/koolitused/x", { ...page, meta: { ...page.meta, status: 404 } }, 123)).toBeNull();
    expect(frontObjects("/et/koolitused", { ...page, meta: { ...page.meta, postponed: "x" } }, 123)).toBeNull();
    expect(frontObjects("/et/koolitused", { ...page, meta: { headers: {} } }, 123)).toBeNull();
    expect(frontObjects("/et/koolitused", { ...page, rsc: undefined }, 123)).toBeNull();
    expect(frontObjects("/admin", page, 123)).toBeNull();
    expect(frontObjects("/et/koolitused/%C3%B5", page, 123)).toBeNull();
    expect(frontObjects("/et/koolitused", { type: "route", body: "x" }, 123)).toBeNull();
    // R2 metadata holds 2 KB: a page with more tags than that is left to OpenNext
    const many = Array.from({ length: 100 }, (_, i) => `_N_T_/some/long/tag/number/${i}`).join(",");
    expect(frontObjects("/et/koolitused", { ...page, meta: { headers: { "x-next-cache-tags": many } } }, 123)).toBeNull();
  });
});

describe("pages are dated by when their render began (a save during a render leaves it stale)", () => {
  const CONTEXT = Symbol.for("__cloudflare-context__");
  const g = globalThis as Record<string | symbol, unknown>;
  afterEach(() => {
    delete g[CONTEXT];
    delete process.env.OPEN_NEXT_BUILD_ID;
    vi.restoreAllMocks();
  });

  /** An R2 bucket in memory: put / get (json, uploaded, customMetadata) / list / delete. */
  function memoryR2(failPuts: RegExp | null = null) {
    const objects = new Map<string, { body: string; meta?: Record<string, string>; uploaded: Date }>();
    const r2 = {
      async put(key: string, body: string, opts?: { customMetadata?: Record<string, string> }) {
        if (failPuts?.test(key)) throw new Error("R2 put failed");
        objects.set(key, { body, meta: opts?.customMetadata, uploaded: new Date(9_000) });
      },
      async get(key: string) {
        const o = objects.get(key);
        return o ? { json: async () => JSON.parse(o.body), uploaded: o.uploaded, customMetadata: o.meta } : null;
      },
      async list({ prefix }: { prefix: string }) {
        return { objects: [...objects.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
      },
      async delete(keys: string | string[]) {
        for (const k of [keys].flat()) objects.delete(k);
      },
    };
    g[CONTEXT] = { env: { NEXT_INC_CACHE_R2_BUCKET: r2 }, ctx: {}, cf: {} };
    process.env.OPEN_NEXT_BUILD_ID = "B1";
    return objects;
  }

  const KEY = `/route-cache/APP_PAGE/${"a".repeat(64)}/$/et/koolitused`;

  test("a page stored by a request that began at 5000 (uploaded at 9000) is dated 5000 for OpenNext and for the front", async () => {
    const objects = memoryR2();
    await runAsRequest(5_000, () => pageStore.set(KEY, page as never, "cache"));
    const viaNext = await pageStore.get(KEY, "cache");
    const viaInterception = await pageStore.get("/et/koolitused");
    expect(viaNext?.lastModified).toBe(5_000);
    expect(viaInterception?.lastModified).toBe(5_000);
    expect(objects.get("front/B1/et/koolitused#html")?.meta?.s).toBe("5000");
    // the caller's value is not changed; the stored copy carries the start
    expect(page).not.toHaveProperty(STARTED_AT);
    expect(withStartedAt({ a: 1 }, 7)).toEqual({ a: 1, [STARTED_AT]: 7 });
  });

  test("without a recorded start: the time of the write (still before the upload); old entries keep R2's upload time", () => {
    expect(entryDate({ type: "app" }, 9_000)).toBe(9_000);
    expect(entryDate({ type: "app", [STARTED_AT]: 5_000 }, 9_000)).toBe(5_000);
    expect(entryDate(null, 9_000)).toBe(9_000);
  });

  test("a failed front write is logged every time (the page path only) and never fails OpenNext's own write", async () => {
    const objects = memoryR2(/^front\//);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 2; i++) await runAsRequest(5_000, () => pageStore.set(KEY, page as never, "cache"));
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toBe("[page-store] front write failed for /et/koolitused:");
    expect([...objects.keys()].some((k) => k.startsWith("incremental-cache/"))).toBe(true);
  });

  test("delete removes OpenNext's entries and the front's objects; a failing front delete is logged", async () => {
    const objects = memoryR2();
    await runAsRequest(5_000, () => pageStore.set(KEY, page as never, "cache"));
    await pageStore.delete(KEY);
    expect([...objects.keys()]).toEqual([]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    (g[CONTEXT] as { env: { NEXT_INC_CACHE_R2_BUCKET: { list: () => Promise<never> } } }).env.NEXT_INC_CACHE_R2_BUCKET.list = () => Promise.reject(new Error("R2 list failed"));
    await pageStore.delete(KEY);
    expect(log.mock.calls.map((c) => c[0])).toContain("[page-store] front delete failed for /et/koolitused:");
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
