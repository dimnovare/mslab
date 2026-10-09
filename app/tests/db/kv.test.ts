import { eq } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import { makeTestDb } from "./helpers";
import { kvEntries } from "@/db/schema";
import { PgKv } from "@/server/kv";

test("get/put/delete with TTL", async () => {
  const kv = new PgKv(await makeTestDb(), () => new Date("2026-10-02T10:00:00Z"));
  await kv.put("a", "1");
  await kv.put("b", "2", { expirationTtl: 60 });
  expect(await kv.get("a")).toBe("1");
  expect(await kv.get("b")).toBe("2");
  const later = new PgKv((kv as unknown as { db: never }).db, () => new Date("2026-10-02T10:01:01Z"));
  expect(await later.get("b")).toBeNull();
  await kv.delete("a");
  expect(await kv.get("a")).toBeNull();
});

test("list by prefix with cursor, oldest key order", async () => {
  const kv = new PgKv(await makeTestDb());
  for (let i = 0; i < 5; i++) await kv.put(`fb:2026-10-0${i}`, String(i));
  await kv.put("id:x", "fb:2026-10-00");
  const first = await kv.list({ prefix: "fb:", limit: 3 });
  expect(first.keys.map((k) => k.name)).toEqual(["fb:2026-10-00", "fb:2026-10-01", "fb:2026-10-02"]);
  expect(first.list_complete).toBe(false);
  const rest = await kv.list({ prefix: "fb:", cursor: first.cursor });
  expect(rest.keys).toHaveLength(2);
  expect(rest.list_complete).toBe(true);
});

test("a put replaces value and expiry; without a TTL the entry no longer expires", async () => {
  const db = await makeTestDb();
  const kv = new PgKv(db, () => new Date("2026-10-02T10:00:00Z"));
  await kv.put("k", "1", { expirationTtl: 60 });
  await kv.put("k", "2");
  const later = new PgKv(db, () => new Date("2026-10-03T10:00:00Z"));
  expect(await later.get("k")).toBe("2");
});

test("list skips expired entries and treats the prefix literally (% and _ are not wildcards)", async () => {
  const db = await makeTestDb();
  const kv = new PgKv(db, () => new Date("2026-10-02T10:00:00Z"));
  await kv.put("a_1", "x");
  await kv.put("a%2", "x");
  await kv.put("abc", "x");
  await kv.put("a_gone", "x", { expirationTtl: 60 });
  const later = new PgKv(db, () => new Date("2026-10-02T10:05:00Z"));
  expect((await later.list({ prefix: "a_" })).keys.map((k) => k.name)).toEqual(["a_1"]);
  expect((await later.list({ prefix: "a%" })).keys.map((k) => k.name)).toEqual(["a%2"]);
  expect((await later.list({})).keys.map((k) => k.name).sort()).toEqual(["a%2", "a_1", "abc"]);
  expect(await later.list({ prefix: "none:" })).toEqual({ keys: [], list_complete: true, cursor: undefined });
});

test("a page of exactly `limit` keys is complete, with no cursor", async () => {
  const kv = new PgKv(await makeTestDb());
  await kv.put("p:1", "1");
  await kv.put("p:2", "2");
  const page = await kv.list({ prefix: "p:", limit: 2 });
  expect(page.keys).toHaveLength(2);
  expect(page.list_complete).toBe(true);
  expect(page.cursor).toBeUndefined();
});

test("a prefix with a backslash is literal too", async () => {
  const kv = new PgKv(await makeTestDb());
  await kv.put("a\\b", "1");
  await kv.put("a\\c", "2");
  await kv.put("abx", "3");
  await kv.put("a\\", "4");
  expect((await kv.list({ prefix: "a\\" })).keys.map((k) => k.name)).toEqual(["a\\", "a\\b", "a\\c"]);
  expect((await kv.list({ prefix: "a\\b" })).keys.map((k) => k.name)).toEqual(["a\\b"]);
  expect((await kv.list({ prefix: "a%" })).keys).toEqual([]);
});

test("keys list in byte order (collation C), with a cursor that agrees with it", async () => {
  const kv = new PgKv(await makeTestDb());
  for (const k of ["b", "B", "a", "A", "_", "-", "~", "é", "10", "9"]) await kv.put(k, "x");
  const all = (await kv.list({})).keys.map((k) => k.name);
  expect(all).toEqual(["-", "10", "9", "A", "B", "_", "a", "b", "~", "é"]);
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ limit: 3, cursor });
    seen.push(...page.keys.map((k) => k.name));
    cursor = page.cursor;
  } while (cursor);
  expect(seen).toEqual(all);
});

test("limit below 1 gives one key instead of an error", async () => {
  const kv = new PgKv(await makeTestDb());
  await kv.put("p:1", "1");
  await kv.put("p:2", "2");
  for (const limit of [0, -5]) {
    const page = await kv.list({ prefix: "p:", limit });
    expect(page.keys.map((k) => k.name)).toEqual(["p:1"]);
    expect(page.list_complete).toBe(false);
    expect(page.cursor).toBe("p:1");
  }
});

const physicalKeys = async (db: Awaited<ReturnType<typeof makeTestDb>>) => (await db.select().from(kvEntries)).map((r) => r.key).sort();

test("a put with a TTL physically deletes the expired rows; future-expiry and no-expiry rows stay", async () => {
  const db = await makeTestDb();
  const t0 = new PgKv(db, () => new Date("2026-10-02T10:00:00Z"));
  await t0.put("rl:form:203.0.113.7", "1", { expirationTtl: 600 }); // expires 10:10
  await t0.put("rl:form:203.0.113.8", "1", { expirationTtl: 3600 }); // expires 11:00
  await t0.put("tg:chat", "42"); // never
  expect(await physicalKeys(db)).toEqual(["rl:form:203.0.113.7", "rl:form:203.0.113.8", "tg:chat"]);

  const t1 = new PgKv(db, () => new Date("2026-10-02T10:30:00Z")); // the first row has expired, the second has not
  expect(await t1.get("rl:form:203.0.113.7")).toBeNull(); // reads already ignore it, but the row is still stored
  expect(await physicalKeys(db)).toContain("rl:form:203.0.113.7");
  await t1.put("rl:form:203.0.113.9", "1", { expirationTtl: 600 });
  expect(await physicalKeys(db)).toEqual(["rl:form:203.0.113.8", "rl:form:203.0.113.9", "tg:chat"]); // gone, the others stay
  expect(await t1.get("rl:form:203.0.113.8")).toBe("1");
  expect(await t1.get("tg:chat")).toBe("42");
});

test("sweep() on its own deletes only what has expired", async () => {
  const db = await makeTestDb();
  const t0 = new PgKv(db, () => new Date("2026-10-02T10:00:00Z"));
  await t0.put("old", "x", { expirationTtl: 60 });
  await t0.put("later", "x", { expirationTtl: 7200 });
  await t0.put("never", "x");
  await new PgKv(db, () => new Date("2026-10-02T10:01:00Z")).sweep(); // exactly at its expiry: no longer readable, so deleted
  expect(await physicalKeys(db)).toEqual(["later", "never"]);
});

test("a failing sweep is logged without values and does not fail the put", async () => {
  const db = await makeTestDb();
  const failingDelete = Object.assign(Object.create(db), { delete: () => { throw new Error("delete failed for 203.0.113.7"); } }) as typeof db;
  const kv = new PgKv(failingDelete);
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(kv.put("rl:form:203.0.113.7", "1", { expirationTtl: 600 })).resolves.toBeUndefined();
    expect(await kv.get("rl:form:203.0.113.7")).toBe("1");
    expect(logged).toHaveBeenCalledTimes(1);
    const line = String(logged.mock.calls[0][0]);
    expect(line).toContain("[kv] sweeping expired entries failed");
    expect(line).not.toContain("203.0.113.7");
  } finally {
    logged.mockRestore();
  }
});

test("sweep: false (a store on a caller's transaction) writes its own row and leaves the expired ones to the next sweep", async () => {
  const db = await makeTestDb();
  await new PgKv(db, () => new Date("2026-10-02T10:00:00Z")).put("old", "x", { expirationTtl: 60 });
  const later = new PgKv(db, () => new Date("2026-10-02T11:00:00Z"), { sweep: false });
  await later.put("rl:pw-mail:abc", "1", { expirationTtl: 900 });
  expect(await physicalKeys(db)).toEqual(["old", "rl:pw-mail:abc"]);
  expect([await later.get("old"), await later.get("rl:pw-mail:abc")]).toEqual([null, "1"]);
});

const SLOT = "rl:pw-ip:198.51.100.7";
const T0 = Date.parse("2026-10-09T10:00:00Z");
const clockAt = (db: Awaited<ReturnType<typeof makeTestDb>>, sec: number, opts?: { sweep?: boolean }) => new PgKv(db, () => new Date(T0 + sec * 1000), opts);
const slotRow = async (db: Awaited<ReturnType<typeof makeTestDb>>) => (await db.select().from(kvEntries).where(eq(kvEntries.key, SLOT)))[0];

test("reserve (the password login's IP slots, phase 2c fix): one statement takes a slot under the limit and renews the window; at the limit it refuses and changes nothing", async () => {
  const db = await makeTestDb();
  expect(await clockAt(db, 0).reserve(SLOT, 3, 900)).toBe(true);
  expect(await clockAt(db, 10).reserve(SLOT, 3, 900)).toBe(true);
  expect(await clockAt(db, 20).reserve(SLOT, 3, 900)).toBe(true);
  const full = await slotRow(db);
  expect([full.value, full.expiresAt]).toEqual(["3", new Date(T0 + 920_000)]); // the window runs 900 s from the last slot taken
  expect(await clockAt(db, 40).reserve(SLOT, 3, 900)).toBe(false);
  expect(await slotRow(db)).toEqual(full); // neither the count nor the window moved
  expect(await clockAt(db, 919).get(SLOT)).toBe("3");
  expect(await clockAt(db, 921).get(SLOT)).toBeNull();
});

test("reserve: an expired window starts again at 1 (even a count at the limit), and the limit is checked against the new count", async () => {
  const db = await makeTestDb();
  for (let i = 0; i < 3; i++) await clockAt(db, i).reserve(SLOT, 3, 900);
  expect(await clockAt(db, 100).reserve(SLOT, 3, 900)).toBe(false);
  expect(await clockAt(db, 2 + 900 + 1).reserve(SLOT, 3, 900)).toBe(true); // the last slot was taken at 2 s: the window ended at 902 s
  const again = await slotRow(db);
  expect([again.value, again.expiresAt]).toEqual(["1", new Date(T0 + 903_000 + 900_000)]);
  expect(await clockAt(db, 904).reserve(SLOT, 1, 900)).toBe(false); // at the limit of 1 now
});

test("release gives one slot back: never below 0, the window stays as it was, an expired row and a missing key are left alone", async () => {
  const db = await makeTestDb();
  await clockAt(db, 0).reserve(SLOT, 5, 900);
  await clockAt(db, 5).reserve(SLOT, 5, 900);
  const two = await slotRow(db);
  await clockAt(db, 6).release(SLOT);
  expect(await slotRow(db)).toEqual({ ...two, value: "1" }); // the expiry is the one the last reserve set
  await clockAt(db, 7).release(SLOT);
  await clockAt(db, 8).release(SLOT);
  expect((await slotRow(db)).value).toBe("0");
  await clockAt(db, 9).release("rl:pw-ip:missing");
  expect(await physicalKeys(db)).toEqual([SLOT]);
  await clockAt(db, 10).reserve(SLOT, 5, 900);
  await clockAt(db, 2000).release(SLOT); // expired by then: a count that belongs to no one is not touched
  expect((await slotRow(db)).value).toBe("1");
});

test("reserve sweeps the expired rows as a put with a TTL does (they hold visitors' addresses), unless the store is on a caller's transaction", async () => {
  const db = await makeTestDb();
  await clockAt(db, 0).put("old-1", "x", { expirationTtl: 60 });
  await clockAt(db, 0).put("old-2", "x", { expirationTtl: 60 });
  await clockAt(db, 1000, { sweep: false }).reserve(SLOT, 3, 900);
  expect(await physicalKeys(db)).toEqual(["old-1", "old-2", SLOT]);
  await clockAt(db, 1000).reserve(SLOT, 3, 900);
  expect(await physicalKeys(db)).toEqual([SLOT]);
});
