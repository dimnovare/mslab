import { expect, test } from "vitest";
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

test("a put sweeps the expired rows on about 1 in 100 calls", async () => {
  const db = await makeTestDb();
  const old = new PgKv(db, () => new Date("2026-10-02T10:00:00Z"));
  await old.put("stale", "x", { expirationTtl: 60 });
  const rows = async () => (await db.select().from(kvEntries)).map((r) => r.key).sort();
  const later = () => new Date("2026-10-02T11:00:00Z");

  await new PgKv(db, later, () => 0.5).put("fresh1", "x");
  expect(await rows()).toEqual(["fresh1", "stale"]); // no sweep: the expired row is only ignored by reads

  await new PgKv(db, later, () => 0.005).put("fresh2", "x");
  expect(await rows()).toEqual(["fresh1", "fresh2"]); // swept; live rows stay
});

test("a failing sweep does not fail the put", async () => {
  const db = await makeTestDb();
  const failingDelete = Object.assign(Object.create(db), { delete: () => { throw new Error("delete failed"); } }) as typeof db;
  const kv = new PgKv(failingDelete, undefined, () => 0); // always sweeps
  await expect(kv.put("k", "v")).resolves.toBeUndefined();
  expect(await kv.get("k")).toBe("v");
});
