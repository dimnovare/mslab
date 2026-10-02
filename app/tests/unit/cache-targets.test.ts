import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { revalidationTargets, type PublicChange } from "@/server/cache-targets";
import { sqliteD1 } from "../d1-sqlite";

// Task 17: which cached public pages each change makes stale (server/cache-targets.ts), and that the tags written are
// the ones Next.js gives those pages.

const SITE = "/[locale]/(site)";
const paths = (change: PublicChange) => revalidationTargets(change).map((t) => `${t.path}${t.type ? ` (${t.type})` : ""}`);

describe("the revalidation map", () => {
  test("courses: catalogue and every course page, home, calendar, carts", () => {
    expect(paths({ kind: "courses" })).toEqual([`${SITE}/koolitused (layout)`, `${SITE} (page)`, `${SITE}/koolituskalender (page)`, `${SITE}/ostukorv (layout)`]);
  });

  test("sessions (and a session's start): calendar, course pages and catalogue cards, home", () => {
    expect(paths({ kind: "sessions" })).toEqual([`${SITE}/koolitused (layout)`, `${SITE} (page)`, `${SITE}/koolituskalender (page)`]);
  });

  test("seats: that course's page in both languages and the calendar; every course page when the course is not known", () => {
    expect(paths({ kind: "seats", course: "kulmude-lami" })).toEqual(["/et/koolitused/kulmude-lami", "/ru/koolitused/kulmude-lami", `${SITE}/koolituskalender (page)`]);
    expect(paths({ kind: "seats" })).toEqual([`${SITE}/koolitused/[slug] (page)`, `${SITE}/koolituskalender (page)`]);
    expect(paths({ kind: "seats", course: "../x" })).toEqual([`${SITE}/koolitused/[slug] (page)`, `${SITE}/koolituskalender (page)`]);
  });

  test("home, campaign, practice, posts", () => {
    expect(paths({ kind: "home" })).toEqual([`${SITE} (page)`]);
    expect(paths({ kind: "campaign" })).toEqual([`${SITE} (page)`]);
    expect(paths({ kind: "practice" })).toEqual([`${SITE} (page)`, `${SITE}/praktika (page)`]);
    expect(paths({ kind: "posts" })).toEqual([`${SITE}/uudised (layout)`, `${SITE} (page)`]);
  });

  test("trainer: the card (name in the footer) is on every page; the bio on home and course pages; the rest on /koolitaja", () => {
    expect(paths({ kind: "trainer", parts: ["trainer", "works"] })).toEqual([`${SITE} (layout)`]);
    expect(paths({ kind: "trainer", parts: ["bio"] })).toEqual([`${SITE}/koolitaja (page)`, `${SITE} (page)`, `${SITE}/koolitused/[slug] (page)`]);
    expect(paths({ kind: "trainer", parts: ["works", "center_story", "trainer_journey"] })).toEqual([`${SITE}/koolitaja (page)`]);
    expect(paths({ kind: "trainer", parts: [] })).toEqual([]);
  });

  test("settings: contact and newsletter are in the footer of every page; privacy and terms their own pages", () => {
    expect(paths({ kind: "settings", parts: ["contact"] })).toEqual([`${SITE} (layout)`]);
    expect(paths({ kind: "settings", parts: ["newsletter", "terms"] })).toEqual([`${SITE} (layout)`]);
    expect(paths({ kind: "settings", parts: ["privacy", "terms"] })).toEqual([`${SITE}/privaatsus (page)`, `${SITE}/tingimused (page)`]);
    expect(paths({ kind: "settings", parts: [] })).toEqual([]);
  });

  test("every route named is a real route of app/[locale]/(site)", () => {
    const all: PublicChange[] = [
      { kind: "courses" },
      { kind: "sessions" },
      { kind: "seats" },
      { kind: "home" },
      { kind: "campaign" },
      { kind: "practice" },
      { kind: "posts" },
      { kind: "trainer", parts: ["bio", "works"] },
      { kind: "trainer", parts: ["trainer"] },
      { kind: "settings", parts: ["privacy", "terms"] },
    ];
    const routes = all.flatMap(revalidationTargets).filter((t) => t.path.startsWith("/["));
    for (const t of routes) {
      const dir = join(process.cwd(), "src/app", t.path);
      expect(existsSync(t.type === "page" ? join(dir, "page.tsx") : dir), `${t.path} ${t.type}`).toBe(true);
    }
  });
});

// The tags these targets write: tests/unit/tag-cache.test.ts checks them against Next.js's own revalidatePath().

describe("revalidatePublic", () => {
  const CONTEXT = Symbol.for("__cloudflare-context__");
  const g = globalThis as Record<string | symbol, unknown>;

  afterEach(() => {
    vi.doUnmock("next/server");
    vi.resetModules();
    vi.useRealTimers();
    delete g[CONTEXT];
    delete process.env.OPEN_NEXT_BUILD_ID;
  });

  async function load(db: ReturnType<typeof sqliteD1>) {
    const later: (() => Promise<void>)[] = [];
    vi.doMock("next/server", () => ({ after: (fn: () => Promise<void>) => void later.push(fn) }));
    g[CONTEXT] = { env: { NEXT_TAG_CACHE_D1: db.binding }, ctx: {}, cf: {} };
    process.env.OPEN_NEXT_BUILD_ID = "B1";
    const mod = await import("@/server/public-cache");
    return { ...mod, later };
  }

  test("an admin save: OpenNext's rows are in D1 before the action answers, and written again SETTLE_MS later", async () => {
    const db = sqliteD1();
    const { revalidatePublic, SETTLE_MS, later } = await load(db);
    vi.useFakeTimers({ now: 1_000_000 });
    await revalidatePublic({ kind: "practice" });
    const first = db.d1.rows();
    expect(first).toEqual([
      { tag: "B1/_N_T_/[locale]/(site)/page", revalidatedAt: 1_000_000, stale: 1_000_000, expire: 1_000_000 },
      { tag: "B1/_N_T_/[locale]/(site)/praktika/page", revalidatedAt: 1_000_000, stale: 1_000_000, expire: 1_000_000 },
    ]);
    expect(later).toHaveLength(1);
    const settled = later[0]();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    await settled;
    // the second write really reaches the table (a second revalidatePath() of pending tags would be dropped by Next.js)
    expect(db.d1.rows().map((r) => r.revalidatedAt)).toEqual([1_000_000 + SETTLE_MS, 1_000_000 + SETTLE_MS]);
  });

  test("a public form: nothing is written before the answer; both writes run after it", async () => {
    const db = sqliteD1();
    const { revalidatePublicLater, SETTLE_MS, later } = await load(db);
    vi.useFakeTimers({ now: 2_000_000 });
    revalidatePublicLater({ kind: "seats", course: "kulmude-lami" });
    expect(db.d1.rows()).toEqual([]);
    const run = later[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(db.d1.rows().map((r) => r.tag)).toEqual(["B1/_N_T_/[locale]/(site)/koolituskalender/page", "B1/_N_T_/et/koolitused/kulmude-lami", "B1/_N_T_/ru/koolitused/kulmude-lami"]);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    await run;
    expect(new Set(db.d1.rows().map((r) => r.revalidatedAt))).toEqual(new Set([2_000_000 + SETTLE_MS]));
  });

  test("next dev (no OpenNext build id) and changes that show nowhere write nothing", async () => {
    const db = sqliteD1();
    const { revalidatePublic, later } = await load(db);
    await revalidatePublic({ kind: "settings", parts: [] });
    delete process.env.OPEN_NEXT_BUILD_ID;
    await revalidatePublic({ kind: "home" });
    expect(db.d1.rows()).toEqual([]);
    expect(later).toEqual([]);
  });

  test("a failing write is logged, never thrown at the admin whose save is stored", async () => {
    const db = sqliteD1();
    const { revalidatePublic } = await load(db);
    db.d1.exec("DROP TABLE revalidations");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(revalidatePublic({ kind: "home" })).resolves.toBeUndefined();
    expect(log.mock.calls[0][0]).toContain("[public-cache] revalidation of 1 tags failed");
  });
});
