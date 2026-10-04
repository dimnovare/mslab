import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { makeTestDb } from "./helpers";
import type { Db } from "@/db/client";
import { ensureTerms, ensureTermsRefusal, runCli, type Io } from "@/db/ensure-terms";
import { courses, pages, settings } from "@/db/schema";
import { pageSeeds } from "@/db/seed-data";
import { TERMS_PAGE_KEY, TERMS_PAGE_TITLE } from "@/domain/course-terms";

// `npm run db:ensure-terms -- --target local|railway` (final review I3): adds the e-course terms page, `pages.course_terms`, with
// the seed's title and text when it is missing, and touches nothing else. The generic seed must not run on Railway for this: it
// would re-insert every seed course, post, slide and setting that is missing there. All data here is made up.

const LOCAL = "postgres://postgres:postgres@localhost:5432/mslab";
const RAILWAY = "postgres://u:p@x.proxy.rlwy.net:123/railway";
const OTHER = "postgres://u:p@db.example.com:5432/x";

const seedTerms = pageSeeds.find((p) => p.key === TERMS_PAGE_KEY)!;
const allPages = (db: Db) => db.select().from(pages).orderBy(asc(pages.key));

let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
  // what a live database holds: pages the admin has edited, and no terms page yet
  await db.insert(pages).values([
    { key: "privacy", title: { et: "Privaatsus" }, body: { et: "Maria oma tekst." } },
    { key: "terms", title: { et: "Õppetingimused" }, body: { et: "Muudetud." } },
  ]);
});

describe("ensureTerms", () => {
  test("inserts the seed's terms page once; a second run leaves it as it is, an edited one too; other pages and tables are untouched", async () => {
    const before = await allPages(db);
    expect(await ensureTerms(db)).toBe("inserted");
    const [row] = await db.select().from(pages).where(eq(pages.key, TERMS_PAGE_KEY));
    expect(row).toEqual({ key: TERMS_PAGE_KEY, title: TERMS_PAGE_TITLE, body: seedTerms.body });
    expect((await allPages(db)).filter((p) => p.key !== TERMS_PAGE_KEY)).toEqual(before);

    expect(await ensureTerms(db)).toBe("already there");
    // Maria saved her own text meanwhile: it stays
    await db.update(pages).set({ body: { et: "Maria tingimused.", ru: "Условия Марии." } }).where(eq(pages.key, TERMS_PAGE_KEY));
    const edited = await allPages(db);
    expect(await ensureTerms(db)).toBe("already there");
    expect(await allPages(db)).toEqual(edited);
    // nothing else was seeded: no course, no setting (courseTermsVersion defaults to "1" without a row)
    expect(await db.select().from(courses)).toHaveLength(0);
    expect(await db.select().from(settings)).toHaveLength(0);
  });
});

describe("the CLI", () => {
  /** A recorder for what the CLI prints. */
  const recorder = () => {
    const out: string[] = [];
    const err: string[] = [];
    const io: Io = { log: (l) => out.push(l), error: (l) => err.push(l) };
    return { io, out, err };
  };
  const on = (database: Db) => () => ({ db: database, close: async () => {} });

  test("--target is required and must agree with the address; nothing is connected otherwise", () => {
    expect(ensureTermsRefusal(LOCAL, [])).toMatch(/--target local \| --target railway/);
    expect(ensureTermsRefusal(LOCAL, ["--target"])).toMatch(/--target local \| --target railway/);
    expect(ensureTermsRefusal(LOCAL, ["--target", "prod"])).toMatch(/--target local \| --target railway/);
    expect(ensureTermsRefusal(undefined, ["--target", "local"])).toBe("DATABASE_URL is not set.");
    expect(ensureTermsRefusal(LOCAL, ["--target", "railway"])).toMatch(/not a Railway database/);
    expect(ensureTermsRefusal(RAILWAY, ["--target", "local"])).toMatch(/not a local database/);
    expect(ensureTermsRefusal(OTHER, ["--target", "railway"])).toMatch(/not a Railway database/);
    expect(ensureTermsRefusal(LOCAL, ["--target", "local"])).toBeNull();
    expect(ensureTermsRefusal(RAILWAY, ["--target", "railway"])).toBeNull();
    for (const refusal of [ensureTermsRefusal(RAILWAY, ["--target", "local"]), ensureTermsRefusal(OTHER, ["--target", "railway"])]) {
      expect(refusal).not.toContain("rlwy");
      expect(refusal).not.toContain("example.com");
    }
  });

  test("prints only 'inserted', then 'already there'; a refusal connects to nothing", async () => {
    const first = recorder();
    expect(await runCli(["--target", "local"], { DATABASE_URL: LOCAL }, first.io, on(db))).toBe(0);
    expect(first.out).toEqual(["inserted"]);
    expect(first.err).toEqual([]);
    const second = recorder();
    expect(await runCli(["--target", "local"], { DATABASE_URL: LOCAL }, second.io, on(db))).toBe(0);
    expect(second.out).toEqual(["already there"]);

    const refused = recorder();
    let connected = false;
    expect(await runCli(["--target", "railway"], { DATABASE_URL: LOCAL }, refused.io, () => ((connected = true), { db, close: async () => {} }))).toBe(1);
    expect(connected).toBe(false);
    expect(refused.out).toEqual([]);
  });

  test("a database failure prints its code only, never its message (which can hold the statement's values)", async () => {
    const failing = { insert: () => { throw Object.assign(new Error("insert into pages … Maria's text"), { code: "42P01" }); } } as unknown as Db;
    const r = recorder();
    expect(await runCli(["--target", "local"], { DATABASE_URL: LOCAL }, r.io, on(failing))).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err).toEqual(["Failed: database error [42P01]."]);
  });
});
