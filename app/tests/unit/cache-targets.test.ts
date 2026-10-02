import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { revalidationTargets, targetTag, type PublicChange } from "@/server/cache-targets";

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

describe("tags", () => {
  test("as Next.js's revalidatePath writes them", () => {
    expect(targetTag({ path: `${SITE}/koolituskalender`, type: "page" })).toBe("_N_T_/[locale]/(site)/koolituskalender/page");
    expect(targetTag({ path: SITE, type: "layout" })).toBe("_N_T_/[locale]/(site)/layout");
    expect(targetTag({ path: "/et/koolitused/x" })).toBe("_N_T_/et/koolitused/x");
    expect(targetTag({ path: "/", type: "layout" })).toBe("_N_T_/layout");
  });
});

describe("revalidatePublic", () => {
  afterEach(() => {
    vi.doUnmock("next/cache");
    vi.doUnmock("next/server");
    vi.resetModules();
    vi.useRealTimers();
  });

  test("calls revalidatePath for each target now, and again after SETTLE_MS (a render that overlapped the change)", async () => {
    const calls: [string, string | undefined][] = [];
    const later: (() => Promise<void>)[] = [];
    vi.doMock("next/cache", () => ({ revalidatePath: (p: string, t?: string) => void calls.push([p, t]) }));
    vi.doMock("next/server", () => ({ after: (fn: () => Promise<void>) => void later.push(fn) }));
    const { revalidatePublic, SETTLE_MS } = await import("@/server/public-cache");
    revalidatePublic({ kind: "practice" });
    const expected: [string, string | undefined][] = [
      [SITE, "page"],
      [`${SITE}/praktika`, "page"],
    ];
    expect(calls).toEqual(expected);
    expect(later).toHaveLength(1);
    vi.useFakeTimers();
    const done = later[0]();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    await done;
    expect(calls).toEqual([...expected, ...expected]);
    // nothing to revalidate: nothing scheduled
    revalidatePublic({ kind: "settings", parts: [] });
    expect(later).toHaveLength(1);
  });
});

