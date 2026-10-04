import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { clientLoginTokens, clients, clientSessions, kvEntries, mailQuota } from "@/db/schema";
import { sweepClientRows } from "@/server/client-auth";
import { PgKv, sweepExpired } from "@/server/kv";
import { makeTestDb } from "./helpers";

// The daily cron (vercel.json → GET /api/cron/sweep): deletes the expired kv_entries rows, and the client accounts' old rows (login
// codes past their 30 minutes, sessions over for 30 days, the mail counters of days more than a week ago), only when Vercel calls it
// with the project's CRON_SECRET.

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));

import { GET } from "@/app/api/cron/sweep/route";

const SECRET = "cron-secret-for-tests-0123456789";
const call = (authorization?: string) => GET(new Request("https://mslab.example/api/cron/sweep", { headers: authorization ? { authorization } : {} }));
const keys = async (db: Db) => (await db.select().from(kvEntries)).map((r) => r.key).sort();

/** Three rows: one expired an hour ago, one expiring in an hour, one without expiry. */
async function rows(db: Db): Promise<void> {
  const now = Date.now();
  await db.insert(kvEntries).values([
    { key: "rl:contact:203.0.113.7", value: "1", expiresAt: new Date(now - 3_600_000) },
    { key: "rl:contact:203.0.113.8", value: "1", expiresAt: new Date(now + 3_600_000) },
    { key: "tg:chat", value: "42", expiresAt: null },
  ]);
}

let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
  state.db = db;
  await rows(db);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/sweep", () => {
  test("with Vercel's Authorization header: the expired rows are deleted, the count is answered; the others stay", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, deleted: 1, logins: 0, sessions: 0, mailDays: 0 });
    expect(await keys(db)).toEqual(["rl:contact:203.0.113.8", "tg:chat"]);
    // nothing left to delete: 0
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ ok: true, deleted: 0, logins: 0, sessions: 0, mailDays: 0 });
  });

  test("the same call sweeps the client accounts' old rows and answers their counts (one invocation a day)", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.spyOn(console, "info").mockImplementation(() => {});
    await accountRows(db, new Date());
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ ok: true, deleted: 1, logins: 1, sessions: 2, mailDays: 1 });
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ ok: true, deleted: 0, logins: 0, sessions: 0, mailDays: 0 });
  });

  test("401 and nothing deleted without the header, with a wrong secret, or another scheme", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    for (const auth of [undefined, "Bearer wrong", `Bearer ${SECRET}x`, `Basic ${SECRET}`, SECRET, `bearer ${SECRET}`, "Bearer "]) {
      const res = await call(auth);
      expect(res.status, String(auth)).toBe(401);
      expect(await res.json()).toEqual({ ok: false });
    }
    expect(await keys(db)).toHaveLength(3);
  });

  test("while CRON_SECRET is not set (or blank) every request is a 401, an empty bearer included", async () => {
    for (const value of [undefined, "", "   "]) {
      if (value === undefined) vi.stubEnv("CRON_SECRET", undefined);
      else vi.stubEnv("CRON_SECRET", value);
      for (const auth of [undefined, "Bearer ", "Bearer undefined", `Bearer ${value ?? ""}`]) expect((await call(auth)).status, `${JSON.stringify(value)} / ${auth}`).toBe(401);
    }
    expect(await keys(db)).toHaveLength(3);
  });

  test("a failing database is a 500, logged without details", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    state.db = { delete: () => ({ where: () => ({ returning: async () => Promise.reject(Object.assign(new Error("connect ECONNREFUSED db.example.com"), { code: "ECONNREFUSED" })) }) }) };
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false });
    expect(log.mock.calls.map((c) => c[0])).toEqual(["[cron] sweep failed: Error (code ECONNREFUSED)"]);
  });
});

describe("sweepExpired", () => {
  test("deletes what expired at or before the time given and says how many; PgKv.sweep() uses it", async () => {
    const t = new Date(Date.now() + 3_600_000); // the second row expires exactly now
    expect(await sweepExpired(db, t)).toBe(2);
    expect(await keys(db)).toEqual(["tg:chat"]);
    expect(await sweepExpired(db, t)).toBe(0);
    await new PgKv(db).put("rl:x:1", "1", { expirationTtl: 60 });
    await new PgKv(db, () => new Date(Date.now() + 120_000)).sweep();
    expect(await keys(db)).toEqual(["tg:chat"]);
  });
});

const DAY = 86_400_000;

/**
 * Client account rows around `now`: a login code past its 30 minutes and a live one; sessions ended 31 and 29 days ago, one whose
 * 180 days ran out 31 days ago, one that ran out yesterday and a live one; the mail counters of 8, 7 and 0 days ago.
 */
async function accountRows(db: Db, now: Date): Promise<void> {
  const t = (ms: number) => new Date(now.getTime() + ms);
  const [c] = await db.insert(clients).values({ email: "kati@example.test" }).returning();
  await db.insert(clientLoginTokens).values([
    { hash: "old", codeHash: "x", email: "kati@example.test", expiresAt: t(-60_000) },
    { hash: "live", codeHash: "x", email: "kati@example.test", expiresAt: t(20 * 60_000) },
  ]);
  await db.insert(clientSessions).values([
    { idHash: "ended-31", clientId: c.id, expiresAt: t(100 * DAY), endedAt: t(-31 * DAY), endReason: "replaced" },
    { idHash: "ended-29", clientId: c.id, expiresAt: t(100 * DAY), endedAt: t(-29 * DAY), endReason: "replaced" },
    { idHash: "expired-31", clientId: c.id, expiresAt: t(-31 * DAY) },
    { idHash: "expired-1", clientId: c.id, expiresAt: t(-DAY) },
    { idHash: "live", clientId: c.id, expiresAt: t(170 * DAY) },
  ]);
  const day = (offset: number) => t(offset * DAY).toISOString().slice(0, 10);
  await db.insert(mailQuota).values([{ day: day(-8), sent: 9 }, { day: day(-7), sent: 7 }, { day: day(0), sent: 1 }]);
}

describe("sweepClientRows", () => {
  test("deletes login codes past their time (they hold the address in plain text), sessions over for more than 30 days, mail counters older than 7 days; says how many", async () => {
    const now = new Date("2026-10-10T03:00:00Z");
    await accountRows(db, now);
    expect(await sweepClientRows(db, now)).toEqual({ logins: 1, sessions: 2, mailDays: 1 });
    expect((await db.select().from(clientLoginTokens)).map((r) => r.hash)).toEqual(["live"]);
    // a session ended (replaced) 29 days ago still tells its device "Sinu konto avati teises seadmes"
    expect((await db.select().from(clientSessions)).map((r) => r.idHash).sort()).toEqual(["ended-29", "expired-1", "live"]);
    expect((await db.select().from(mailQuota)).map((r) => r.day).sort()).toEqual(["2026-10-03", "2026-10-10"]);
    expect(await db.select().from(clients)).toHaveLength(1); // the account itself stays
    expect(await sweepClientRows(db, now)).toEqual({ logins: 0, sessions: 0, mailDays: 0 });
  });
});

describe("vercel.json", () => {
  const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { regions?: string[]; crons?: { path: string; schedule: string }[] };

  test("functions in Frankfurt (the database is in Europe); the sweep once a day (Vercel Hobby allows daily crons)", () => {
    expect(config.regions).toEqual(["fra1"]);
    expect(config.crons).toEqual([{ path: "/api/cron/sweep", schedule: "0 3 * * *" }]);
  });
});
