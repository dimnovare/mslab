import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { courseModules, courses, lessons } from "@/db/schema";
import { stubFetch } from "../fakes";
import { makeTestDb } from "./helpers";

// POST /api/bunny/webhook?secret=…: Bunny Stream's webhook is only a trigger. The status is read from Bunny's API, never taken from
// the payload; the query secret is checked before anything else.

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));

import { POST } from "@/app/api/bunny/webhook/route";

const VIDEO = "11111111-2222-4333-8444-555555555555";
const OLD = "99999999-2222-4333-8444-555555555555";
const call = (body: unknown, secret: string | null = "hook-secret") =>
  POST(new Request(`https://mslab.example/api/bunny/webhook${secret === null ? "" : `?secret=${secret}`}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

let db: Db;
let lessonId: number;
beforeEach(async () => {
  db = await makeTestDb();
  state.db = db;
  vi.stubEnv("BUNNY_LIBRARY_ID", "12345");
  vi.stubEnv("BUNNY_API_KEY", "test-api-key");
  vi.stubEnv("BUNNY_TOKEN_KEY", "test-token-key");
  vi.stubEnv("BUNNY_WEBHOOK_SECRET", "hook-secret");
  const [c] = await db.insert(courses).values({ slug: "veeb", type: "e_learning", level: "basic", title: { et: "V" }, summary: { et: "" }, body: { et: "" } }).returning();
  const [m] = await db.insert(courseModules).values({ courseId: c.id, position: 1, title: { et: "M" } }).returning();
  [{ id: lessonId }] = await db.insert(lessons).values({ moduleId: m.id, position: 1, title: { et: "L" }, videoId: VIDEO, videoStatus: "processing", replacedVideoId: OLD, durationSec: 100 }).returning();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("a wrong or missing secret is 401 and asks Bunny nothing", async () => {
  const f = stubFetch();
  expect((await call({ VideoLibraryId: 12345, VideoGuid: VIDEO, Status: 3 }, "wrong")).status).toBe(401);
  expect((await call({ VideoLibraryId: 12345, VideoGuid: VIDEO, Status: 3 }, null)).status).toBe(401);
  expect(f.calls).toHaveLength(0);
});

test("our video: the status is read from Bunny's API (not the payload); ready stores the length and deletes the replaced video", async () => {
  const f = stubFetch((_url, init) => (init?.method === "DELETE" ? Response.json({ success: true }) : Response.json({ guid: VIDEO, status: 4, length: 754 })));
  const res = await call({ VideoLibraryId: 12345, VideoGuid: VIDEO, Status: 5 }); // the payload says "failed"; the API says ready
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(f.calls.map((c) => [c.method, c.url])).toEqual([
    ["GET", `https://video.bunnycdn.com/library/12345/videos/${VIDEO}`],
    ["DELETE", `https://video.bunnycdn.com/library/12345/videos/${OLD}`],
  ]);
  expect((await db.select().from(lessons).where(eq(lessons.id, lessonId)))[0]).toMatchObject({ videoStatus: "ready", durationSec: 754, replacedVideoId: null });
});

test("another library, an unknown video or a guid of another shape: 200 and nothing asked; a body that is not JSON: 400", async () => {
  const f = stubFetch();
  expect((await call({ VideoLibraryId: 777, VideoGuid: VIDEO, Status: 3 })).status).toBe(200);
  expect((await call({ VideoLibraryId: 12345, VideoGuid: "00000000-0000-4000-8000-000000000000", Status: 3 })).status).toBe(200);
  expect((await call({ VideoLibraryId: 12345, VideoGuid: "../../x", Status: 3 })).status).toBe(200);
  expect((await call("not json")).status).toBe(400);
  expect(f.calls).toHaveLength(0);
});

test("a JSON array, null, or a body over 4 kB is 400 and asks Bunny nothing", async () => {
  const f = stubFetch();
  expect((await call([{ VideoLibraryId: 12345, VideoGuid: VIDEO }])).status).toBe(400);
  expect((await call("null")).status).toBe(400);
  expect((await call({ VideoLibraryId: 12345, VideoGuid: VIDEO, Status: 3, pad: "x".repeat(5000) })).status).toBe(400);
  expect(f.calls).toHaveLength(0);
});

test("a repeated webhook for a video that is ready already: 200, and Bunny is not asked again", async () => {
  await db.update(lessons).set({ videoStatus: "ready", replacedVideoId: null, durationSec: 754 }).where(eq(lessons.id, lessonId));
  const f = stubFetch();
  expect((await call({ VideoLibraryId: 12345, VideoGuid: VIDEO, Status: 3 })).status).toBe(200);
  expect(f.calls).toHaveLength(0);
});

test("Bunny failing on the status read: 500 (Bunny tries again), the row unchanged, and the log names no video and no secret", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  stubFetch(() => new Response("nope", { status: 500 }));
  const res = await call({ VideoLibraryId: 12345, VideoGuid: VIDEO, Status: 3 });
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ ok: false });
  expect((await db.select().from(lessons).where(eq(lessons.id, lessonId)))[0]).toMatchObject({ videoStatus: "processing", replacedVideoId: OLD });
  const logged = errors.mock.calls.flat().join(" ");
  expect(logged).toContain("[bunny] webhook status read failed");
  for (const secret of [VIDEO, OLD, "hook-secret", "test-api-key"]) expect(logged).not.toContain(secret);
});

test("without the Bunny settings: 404 and nothing asked; without a webhook secret set, the call is taken without one", async () => {
  const f = stubFetch(() => Response.json({ guid: VIDEO, status: 3, length: 0 }));
  vi.stubEnv("BUNNY_API_KEY", "");
  expect((await call({ VideoLibraryId: 12345, VideoGuid: VIDEO, Status: 3 })).status).toBe(404);
  expect(f.calls).toHaveLength(0);
  vi.stubEnv("BUNNY_API_KEY", "test-api-key");
  vi.stubEnv("BUNNY_WEBHOOK_SECRET", "");
  expect((await call({ VideoLibraryId: 12345, VideoGuid: VIDEO, Status: 3 }, null)).status).toBe(200);
  expect(f.calls.map((c) => c.method)).toEqual(["GET"]);
});
