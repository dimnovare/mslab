import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { kvEntries } from "@/db/schema";
import { PgKv, sweepExpired } from "@/server/kv";
import { makeTestDb } from "./helpers";

// The daily cron (vercel.json → GET /api/cron/sweep): deletes the expired kv_entries rows, only when Vercel calls it with
// the project's CRON_SECRET.

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
    expect(await res.json()).toEqual({ ok: true, deleted: 1 });
    expect(await keys(db)).toEqual(["rl:contact:203.0.113.8", "tg:chat"]);
    // nothing left to delete: 0
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ ok: true, deleted: 0 });
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

describe("vercel.json", () => {
  const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { regions?: string[]; crons?: { path: string; schedule: string }[] };

  test("functions in Frankfurt (the database is in Europe); the sweep once a day (Vercel Hobby allows daily crons)", () => {
    expect(config.regions).toEqual(["fra1"]);
    expect(config.crons).toEqual([{ path: "/api/cron/sweep", schedule: "0 3 * * *" }]);
  });
});
