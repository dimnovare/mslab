import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { subscribers } from "@/db/schema";
import { makeTestDb } from "./helpers";

// The confirmation link (GET /api/newsletter/confirm?t=…) uses up a subscriber's first confirmation, so what only looks at the link must
// not: a mail scanner's or link preview's HEAD (Next runs GET for a route without HEAD) and a browser's prefetch. The route runs with the
// database (PGlite) faked in, and `after` collecting the work after the response.

const state = vi.hoisted(() => ({ db: null as unknown, later: [] as (() => unknown)[] }));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void state.later.push(task),
}));

import * as route from "@/app/api/newsletter/confirm/route";

const ORIGIN = "https://mslab.example";
const TOKEN = "h".repeat(43);
let db: Db;

beforeEach(async () => {
  db = await makeTestDb();
  state.db = db;
  state.later = [];
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await db.insert(subscribers).values({ email: "uus@example.com", locale: "et", token: TOKEN });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const confirmedAt = async () => (await db.select().from(subscribers).where(eq(subscribers.token, TOKEN)))[0].confirmedAt;
const link = () => `${ORIGIN}/api/newsletter/confirm?t=${TOKEN}`;
/** What Next does for HEAD: the route's HEAD, else its GET. */
const head = (request: Request) => (route.HEAD ?? route.GET)(request);
const where = (res: Response) => {
  const location = res.headers.get("location");
  return location ? new URL(location, ORIGIN).pathname + new URL(location, ORIGIN).search : null;
};

test("HEAD answers 204, not cached, and confirms nothing: the click after a scanner's HEAD is still the first", async () => {
  const res = await head(new Request(link(), { method: "HEAD" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.text()).toBe("");
  expect(await confirmedAt()).toBeNull();
  expect(state.later).toEqual([]);
  const click = await route.GET(new Request(link()));
  expect([click.status, where(click)]).toEqual([303, "/?uudiskiri=kinnitatud"]);
  expect(await confirmedAt()).toBeInstanceOf(Date);
});

test("a prefetch GET (Sec-Purpose / Purpose) goes home without a notice and confirms nothing; the real click after it does", async () => {
  for (const headers of [{ "sec-purpose": "prefetch" }, { purpose: "prefetch" }, { "sec-purpose": "prefetch;prerender" }]) {
    const res = await route.GET(new Request(link(), { headers }));
    expect([res.status, where(res), res.headers.get("cache-control")]).toEqual([303, "/", "no-store"]);
    expect(await confirmedAt(), JSON.stringify(headers)).toBeNull();
  }
  const click = await route.GET(new Request(link()));
  expect(where(click)).toBe("/?uudiskiri=kinnitatud");
  expect(await confirmedAt()).toBeInstanceOf(Date);
});

test("an unknown token and a repeat click answer as before", async () => {
  expect(where(await route.GET(new Request(`${ORIGIN}/api/newsletter/confirm?t=${"x".repeat(43)}`)))).toBe("/?uudiskiri=vigane");
  await route.GET(new Request(link()));
  expect(where(await route.GET(new Request(link())))).toBe("/?uudiskiri=kinnitatud");
});
