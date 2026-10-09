import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { subscribers } from "@/db/schema";
import { makeTestDb } from "./helpers";

// The unsubscribe link in the welcome mail (GET /api/newsletter/loobu?t=…, one-step newsletter, 09.10): a token that belongs to a row deletes it
// and sends the visitor home in the row's language with a notice; an unknown or malformed token gets the same answer (unsubscribing is idempotent
// and reveals nothing); what only looks at the link (a mail scanner's HEAD, a prefetch) must not unsubscribe anyone. The route runs with the
// database (PGlite) faked in.

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));

import * as route from "@/app/api/newsletter/loobu/route";

const ORIGIN = "https://mslab.example";
const TOKEN = "h".repeat(43);
const TOKEN_RU = "r".repeat(43);
let db: Db;

beforeEach(async () => {
  db = await makeTestDb();
  state.db = db;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const now = new Date("2026-10-09T10:00:00Z");
  await db.insert(subscribers).values([
    { email: "uus@example.com", locale: "et", token: TOKEN, consentAt: now, confirmedAt: now },
    { email: "uus-ru@example.com", locale: "ru", token: TOKEN_RU, consentAt: now, confirmedAt: now },
  ]);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const emails = async () => (await db.select({ email: subscribers.email }).from(subscribers)).map((r) => r.email).sort();
const link = (token: string) => `${ORIGIN}/api/newsletter/loobu?t=${token}`;
/** What Next does for HEAD: the route's HEAD, else its GET. */
const head = (request: Request) => ((route as { HEAD?: (request: Request) => Response | Promise<Response> }).HEAD ?? route.GET)(request);
const where = (res: Response) => {
  const location = res.headers.get("location");
  return location ? new URL(location, ORIGIN).pathname + new URL(location, ORIGIN).search : null;
};

test("a token of a row deletes that row (and only it) and goes home in the row's language with the 'loobutud' notice, never cached", async () => {
  const et = await route.GET(new Request(link(TOKEN)));
  expect([et.status, where(et), et.headers.get("cache-control")]).toEqual([303, "/?uudiskiri=loobutud", "no-store"]);
  expect(await emails()).toEqual(["uus-ru@example.com"]);
  const ru = await route.GET(new Request(link(TOKEN_RU)));
  expect([ru.status, where(ru), ru.headers.get("cache-control")]).toEqual([303, "/ru?uudiskiri=loobutud", "no-store"]);
  expect(await emails()).toEqual([]);
});

test("the link used again, an unknown token and a malformed one: the same 303 to the Estonian home page, nothing else deleted", async () => {
  await route.GET(new Request(link(TOKEN)));
  const again = await route.GET(new Request(link(TOKEN)));
  expect([again.status, where(again), again.headers.get("cache-control")]).toEqual([303, "/?uudiskiri=loobutud", "no-store"]);
  for (const token of ["x".repeat(43), "not-a-token", "", "' or 1=1 --", "h".repeat(42), "%00"]) {
    const res = await route.GET(new Request(link(token)));
    expect([res.status, where(res), res.headers.get("cache-control")], token).toEqual([303, "/?uudiskiri=loobutud", "no-store"]);
  }
  expect(await route.GET(new Request(`${ORIGIN}/api/newsletter/loobu`)).then(where)).toBe("/?uudiskiri=loobutud"); // no token at all
  expect(await emails()).toEqual(["uus-ru@example.com"]);
});

test("HEAD answers 204, not cached, and deletes nothing: the click after a scanner's HEAD still unsubscribes", async () => {
  const res = await head(new Request(link(TOKEN), { method: "HEAD" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.text()).toBe("");
  expect(await emails()).toEqual(["uus-ru@example.com", "uus@example.com"]);
  const click = await route.GET(new Request(link(TOKEN)));
  expect(where(click)).toBe("/?uudiskiri=loobutud");
  expect(await emails()).toEqual(["uus-ru@example.com"]);
});

test("a prefetch GET (Sec-Purpose / Purpose) deletes nothing and says nothing: it goes home without a notice; the real click after it unsubscribes", async () => {
  const prefetches: Record<string, string>[] = [{ "sec-purpose": "prefetch" }, { purpose: "prefetch" }, { "sec-purpose": "prefetch;prerender" }];
  for (const headers of prefetches) {
    const res = await route.GET(new Request(link(TOKEN), { headers }));
    expect([res.status, where(res), res.headers.get("cache-control")]).toEqual([303, "/", "no-store"]);
    expect(await emails(), JSON.stringify(headers)).toEqual(["uus-ru@example.com", "uus@example.com"]);
  }
  const click = await route.GET(new Request(link(TOKEN)));
  expect(where(click)).toBe("/?uudiskiri=loobutud");
  expect(await emails()).toEqual(["uus-ru@example.com"]);
});

test("the database failing: the visitor is told so (?uudiskiri=viga), never that she is unsubscribed; the row stays; the log holds neither the token nor the address", async () => {
  const gone = vi.spyOn(db, "delete").mockImplementation(() => {
    throw new Error(`no database connection for t=${TOKEN} uus@example.com`);
  });
  const res = await route.GET(new Request(link(TOKEN)));
  expect([res.status, where(res), res.headers.get("cache-control")]).toEqual([303, "/?uudiskiri=viga", "no-store"]);
  gone.mockRestore();
  expect(await emails()).toEqual(["uus-ru@example.com", "uus@example.com"]);
  const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
  expect(logged).not.toContain(TOKEN);
  expect(logged).not.toContain("uus@example.com");
});

test("the row is deleted, not only marked: nothing of it is left to find by its token", async () => {
  await route.GET(new Request(link(TOKEN)));
  expect(await db.select().from(subscribers).where(eq(subscribers.token, TOKEN))).toEqual([]);
});
