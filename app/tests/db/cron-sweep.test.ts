import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { clientLoginTokens, clients, clientSessions, courseModules, courses, kvEntries, lessons, mailQuota } from "@/db/schema";
import { sweepClientRows } from "@/server/client-auth";
import { PgKv, sweepExpired } from "@/server/kv";
import { stubFetch } from "../fakes";
import { makeTestDb } from "./helpers";

// The daily cron (vercel.json → GET /api/cron/sweep): deletes the expired kv_entries rows, and the client accounts' old rows (login
// codes past their 30 minutes, sessions over for 30 days, the mail counters of days more than a week ago) and, with Bunny set up, gives
// up the lesson videos left unfinished for a day (uploads, videos stuck in processing), only when Vercel calls it with the project's
// CRON_SECRET.

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));

import { GET } from "@/app/api/cron/sweep/route";

const SECRET = "cron-secret-for-tests-0123456789";
const call = (authorization?: string) => GET(new Request("https://mslab.example/api/cron/sweep", { headers: authorization ? { authorization } : {} }));
const NO_VIDEOS = { uploads: 0, processingReady: 0, processingFailed: 0, videosLeft: 0 };
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("GET /api/cron/sweep", () => {
  test("with Vercel's Authorization header: the expired rows are deleted, the count is answered; the others stay", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, deleted: 1, logins: 0, sessions: 0, mailDays: 0, ...NO_VIDEOS });
    expect(await keys(db)).toEqual(["rl:contact:203.0.113.8", "tg:chat"]);
    // nothing left to delete: 0
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ ok: true, deleted: 0, logins: 0, sessions: 0, mailDays: 0, ...NO_VIDEOS });
  });

  test("the same call sweeps the client accounts' old rows and answers their counts (one invocation a day)", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.spyOn(console, "info").mockImplementation(() => {});
    await accountRows(db, new Date());
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ ok: true, deleted: 1, logins: 1, sessions: 2, mailDays: 1, ...NO_VIDEOS });
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ ok: true, deleted: 0, logins: 0, sessions: 0, mailDays: 0, ...NO_VIDEOS });
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

describe("GET /api/cron/sweep: the lesson videos", () => {
  const [A, B, C, REPLACED, KEPT] = ["11111111-2222-4333-8444-555555555551", "11111111-2222-4333-8444-555555555552", "11111111-2222-4333-8444-555555555553", "11111111-2222-4333-8444-555555555554", "11111111-2222-4333-8444-555555555555"];
  const HOURS = 3600_000;
  const ago = (hours: number) => new Date(Date.now() - hours * HOURS);
  const bunnyOn = () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("BUNNY_LIBRARY_ID", "12345");
    vi.stubEnv("BUNNY_API_KEY", "test-api-key");
    vi.stubEnv("BUNNY_TOKEN_KEY", "test-token-key");
  };
  /** A Bunny that holds `videos` (id → what GET answers): GET answers a held video, 404 otherwise; DELETE forgets it. */
  const fakeBunny = (videos: Record<string, { status: number; length: number; width?: number; height?: number }>) =>
    stubFetch((url, init) => {
      const id = url.split("/").pop()!;
      if (init?.method === "DELETE") {
        delete videos[id];
        return Response.json({ success: true });
      }
      return videos[id] ? Response.json({ guid: id, ...videos[id] }) : new Response(null, { status: 404 });
    });
  /** An e-course with one module; `lesson` adds a lesson to it. */
  async function course() {
    const [c] = await db.insert(courses).values({ slug: "veeb", type: "e_learning", level: "basic", title: { et: "V" }, summary: { et: "" }, body: { et: "" } }).returning();
    const [m] = await db.insert(courseModules).values({ courseId: c.id, position: 1, title: { et: "M" } }).returning();
    let position = 0;
    return async (values: Partial<typeof lessons.$inferInsert>) => (await db.insert(lessons).values({ moduleId: m.id, position: ++position, title: { et: `L${position}` }, ...values }).returning())[0];
  }
  const row = async (id: number) => (await db.select().from(lessons).where(eq(lessons.id, id)))[0];

  test("with Bunny set up, an upload stuck for more than a day is deleted from Bunny and the lesson has no video again (uploads: 1)", async () => {
    bunnyOn();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const f = fakeBunny({ [A]: { status: 0, length: 0 } }); // Bunny has it as created: nothing ever arrived
    const lesson = await course();
    const l = await lesson({ videoId: A, videoStatus: "uploading", videoStartedAt: ago(25) });
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ ok: true, deleted: 1, logins: 0, sessions: 0, mailDays: 0, uploads: 1, processingReady: 0, processingFailed: 0, videosLeft: 0 });
    expect(f.calls.map((c) => [c.method, c.url])).toEqual([
      ["GET", `https://video.bunnycdn.com/library/12345/videos/${A}`],
      ["DELETE", `https://video.bunnycdn.com/library/12345/videos/${A}`],
    ]);
    expect(await row(l.id)).toMatchObject({ videoId: null, videoStatus: "none", videoStartedAt: null });
    expect(info).toHaveBeenCalledWith(
      "[cron] sweep: 1 expired kv entries, 0 login codes, 0 sessions, 0 mail counters, 1 stuck video uploads deleted, 0 stuck processing videos found ready, 0 marked failed, 0 video rows left for the next run",
    );
  });

  test("a video stuck in processing for more than a day is asked about: ready is kept (its replaced video goes), one still processing is failed (its replaced video plays on); younger and ready ones are left alone", async () => {
    bunnyOn();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const f = fakeBunny({ [A]: { status: 4, length: 125, width: 1280, height: 720 }, [B]: { status: 3, length: 0 }, [C]: { status: 4, length: 60 }, [REPLACED]: { status: 4, length: 300 }, [KEPT]: { status: 4, length: 300 } });
    const lesson = await course();
    const ready = await lesson({ videoId: A, videoStatus: "processing", videoStartedAt: ago(30), replacedVideoId: REPLACED, durationSec: 300 });
    const hung = await lesson({ videoId: B, videoStatus: "processing", videoStartedAt: ago(26), replacedVideoId: KEPT, durationSec: 300 });
    const young = await lesson({ videoId: C, videoStatus: "processing", videoStartedAt: ago(5) });
    const playing = await lesson({ videoId: "11111111-2222-4333-8444-5555555555ff", videoStatus: "ready", durationSec: 90 });
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ ok: true, deleted: 1, logins: 0, sessions: 0, mailDays: 0, uploads: 0, processingReady: 1, processingFailed: 1, videosLeft: 0 });
    expect(f.calls.map((c) => [c.method, c.url.split("/").pop()])).toEqual([
      ["GET", A],
      ["DELETE", REPLACED], // the new video is ready: the old one is deleted
      ["GET", B], // (still processing after a day: failed, with no Bunny call and no delete: KEPT plays on)
    ]);
    expect(await row(ready.id)).toMatchObject({ videoId: A, videoStatus: "ready", durationSec: 125, videoWidth: 1280, videoHeight: 720, replacedVideoId: null, videoStartedAt: null });
    expect(await row(hung.id)).toMatchObject({ videoId: B, videoStatus: "failed", replacedVideoId: KEPT, durationSec: 300, videoStartedAt: null });
    expect(await row(young.id)).toMatchObject({ videoStatus: "processing" });
    expect(await row(playing.id)).toMatchObject({ videoStatus: "ready", durationSec: 90 });
    expect(info).toHaveBeenCalledWith(
      "[cron] sweep: 1 expired kv entries, 0 login codes, 0 sessions, 0 mail counters, 0 stuck video uploads deleted, 1 stuck processing videos found ready, 1 marked failed, 0 video rows left for the next run",
    );
    // the next day there is nothing more
    expect(await (await call(`Bearer ${SECRET}`)).json()).toMatchObject({ uploads: 0, processingReady: 0, processingFailed: 0 });
  });

  test("the rows over the 20-row bound are counted in the answer and the log line (counts only), and swept the next day", async () => {
    bunnyOn();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const f = fakeBunny({}); // Bunny knows none of them: each upload is given up
    const lesson = await course();
    for (let i = 0; i < 22; i++) await lesson({ videoId: `11111111-2222-4333-8444-${String(i).padStart(12, "0")}`, videoStatus: "uploading", videoStartedAt: ago(30) });
    const answer = await (await call(`Bearer ${SECRET}`)).json();
    expect(answer).toMatchObject({ ok: true, uploads: 20, videosLeft: 2 });
    expect(info).toHaveBeenCalledWith(
      "[cron] sweep: 1 expired kv entries, 0 login codes, 0 sessions, 0 mail counters, 20 stuck video uploads deleted, 0 stuck processing videos found ready, 0 marked failed, 2 video rows left for the next run",
    );
    expect(info).toHaveBeenCalledTimes(1); // not out of time: no second line
    expect(f.calls.filter((c) => c.method === "DELETE")).toHaveLength(20);
    expect(await (await call(`Bearer ${SECRET}`)).json()).toMatchObject({ uploads: 2, videosLeft: 0 });
  });

  test("after 35 s of the run no new video row is started: a row begun is finished (35 + about 20 s stays under maxDuration 60), the rest is left, logged and answered", async () => {
    bunnyOn();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["Date"] }); // the run's own clock: every Bunny call takes 10 s of it, the longest the client waits for one
    const f = stubFetch((url, init) => {
      vi.setSystemTime(Date.now() + 10_000);
      return init?.method === "DELETE" ? Response.json({ success: true }) : Response.json({ guid: url.split("/").pop(), status: 0, length: 0 });
    });
    const lesson = await course();
    const rows = [];
    for (const id of [A, B, C]) rows.push(await lesson({ videoId: id, videoStatus: "uploading", videoStartedAt: ago(30) }));
    const processing = await lesson({ videoId: REPLACED, videoStatus: "processing", videoStartedAt: ago(30) });
    const started = Date.now();
    const answer = await (await call(`Bearer ${SECRET}`)).json();
    // a row is two calls, 20 s: row 1 runs from 0 to 20 s, row 2 starts at 20 s (before 35) and ends at 40 s (past it: a row begun is finished), row 3 and the processing row would start at 40 s, after 35 s (with a 45 s deadline row 3 would run too)
    expect(Date.now() - started).toBe(40_000);
    expect(answer).toEqual({ ok: true, deleted: 1, logins: 0, sessions: 0, mailDays: 0, uploads: 2, processingReady: 0, processingFailed: 0, videosLeft: 2 });
    expect(f.calls.map((c) => [c.method, c.url.split("/").pop()])).toEqual([["GET", A], ["DELETE", A], ["GET", B], ["DELETE", B]]);
    expect(await row(rows[0].id)).toMatchObject({ videoStatus: "none" });
    expect(await row(rows[1].id)).toMatchObject({ videoStatus: "none" });
    expect(await row(rows[2].id)).toMatchObject({ videoId: C, videoStatus: "uploading" });
    expect(await row(processing.id)).toMatchObject({ videoStatus: "processing" });
    expect(info.mock.calls.map(String)).toEqual([
      "[cron] sweep: 1 expired kv entries, 0 login codes, 0 sessions, 0 mail counters, 2 stuck video uploads deleted, 0 stuck processing videos found ready, 0 marked failed, 2 video rows left for the next run",
      "[cron] sweep: no new video row started after 35 s",
    ]);
  });

  test("without Bunny's settings the video rows are not touched and Bunny is never called", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("BUNNY_LIBRARY_ID", "12345"); // (one or two of the three are no setup)
    const f = fakeBunny({});
    const lesson = await course();
    const up = await lesson({ videoId: A, videoStatus: "uploading", videoStartedAt: ago(30) });
    const processing = await lesson({ videoId: B, videoStatus: "processing", videoStartedAt: ago(30) });
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ ok: true, deleted: 1, logins: 0, sessions: 0, mailDays: 0, ...NO_VIDEOS });
    expect(f.calls).toEqual([]);
    expect(await row(up.id)).toMatchObject({ videoId: A, videoStatus: "uploading" });
    expect(await row(processing.id)).toMatchObject({ videoId: B, videoStatus: "processing" });
  });

  test("Bunny failing or not answering: the rows stay for the next day, the cron still answers 200, and the log has no ids", async () => {
    bunnyOn();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = stubFetch((url) => {
      if (url.endsWith(A)) return new Response("down", { status: 503 });
      throw new DOMException("Bunny did not answer in time", "TimeoutError");
    });
    const lesson = await course();
    const up = await lesson({ videoId: A, videoStatus: "uploading", videoStartedAt: ago(30) });
    const processing = await lesson({ videoId: B, videoStatus: "processing", videoStartedAt: ago(30) });
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 1, logins: 0, sessions: 0, mailDays: 0, ...NO_VIDEOS });
    expect(f.calls.every((c) => c.method === "GET")).toBe(true);
    expect(await row(up.id)).toMatchObject({ videoStatus: "uploading" });
    expect(await row(processing.id)).toMatchObject({ videoStatus: "processing" });
    expect(info).toHaveBeenCalledTimes(1);
    const logged = [...error.mock.calls, ...info.mock.calls].map(String).join("\n");
    expect(logged).toContain("[video] stuck upload not swept: BunnyError (status 503)");
    expect(logged).toContain("[video] stuck processing video not swept: TimeoutError");
    for (const secret of [A, B, "test-api-key", "test-token-key", "12345"]) expect(logged).not.toContain(secret);
  });
});
