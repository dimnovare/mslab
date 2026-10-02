import { beforeEach, describe, expect, test } from "vitest";
import { asc } from "drizzle-orm";
import { makeTestDb } from "./helpers";
import type { Db } from "@/db/client";
import { kvEntries } from "@/db/schema";
import { applyCopy, describePlan, parseExport, planCopy } from "@/db/copy-kv";
import { targetMatches } from "@/db/fill-ru";
import { PgKv } from "@/server/kv";

// The copy of the review comments from the old Cloudflare KV (an export file) into kv_entries. All data here is made up.

const ID1 = "abc123def456gh";
const ID2 = "zz99yy88xx77ww";
const FB1 = `fb:2026-09-01T10:00:00.000Z:${ID1}`;
const FB2 = `fb:2026-09-02T11:30:00.000Z:${ID2}`;
const comment = (id: string, text: string) => JSON.stringify({ id, at: "2026-09-01T10:00:00.000Z", name: "Test Person", dir: "site", text, el: {}, done: false });

/** A small export in the shape wrangler gives: two comments with their lookups, the chat id, and keys that are not copied. */
const exportFile = () => [
  { name: FB1, value: comment(ID1, "Made-up remark one.") },
  { name: `id:${ID1}`, value: FB1 },
  { name: FB2, value: comment(ID2, "Made-up remark two.") },
  { name: `id:${ID2}`, value: FB2 },
  { name: "tg:chat", value: "100200300" },
  { name: "rl:feedback:203.0.113.7", value: "3", expiration: 1790000000 },
  { name: "rl:contact:203.0.113.8", value: "1" },
  { name: "something:else", value: "x" },
];

const rows = (db: Db) => db.select().from(kvEntries).orderBy(asc(kvEntries.key));

describe("parsing the export", () => {
  test("copies fb:, id: and tg:chat; counts rl: and everything else as skipped", () => {
    const parsed = parseExport(exportFile());
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows.map((r) => r.key)).toEqual([FB1, `id:${ID1}`, FB2, `id:${ID2}`, "tg:chat"]);
    expect(parsed.skipped).toEqual({ rl: 2, other: 1 });
  });

  test("expiration (unix seconds) becomes expiresAt; no expiration is null", () => {
    const parsed = parseExport([
      { name: "tg:chat", value: "1", expiration: 1790000000 },
      { name: FB1, value: "{}" },
    ]);
    expect(parsed.rows[0].expiresAt).toEqual(new Date("2026-09-21T14:13:20.000Z"));
    expect(parsed.rows[1].expiresAt).toBeNull();
  });

  test("a skipped entry needs only a name: a rate limit exported without its value is no problem", () => {
    const parsed = parseExport([{ name: "rl:feedback:203.0.113.7" }, { name: "x", value: 5 }]);
    expect(parsed.problems).toEqual([]);
    expect(parsed.skipped).toEqual({ rl: 1, other: 1 });
  });

  test("malformed entries are listed by index and reason, never by content", () => {
    const secret = "very-private-client-text";
    const parsed = parseExport([
      { name: FB1, value: "{}" }, // 0: fine
      { name: FB2, value: 42 }, // 1: value not a string
      "just a string", // 2: not an object
      { value: secret }, // 3: no name
      { name: `id:${ID1}`, value: FB1, expiration: "tomorrow" }, // 4: bad expiration
      { name: `id:${ID2}`, value: FB2, expiration: -5 }, // 5: bad expiration
      { name: FB1, value: secret }, // 6: the same key twice
      null, // 7
    ]);
    expect(parsed.problems.map((p) => p.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(JSON.stringify(parsed.problems)).not.toContain(secret);
    expect(JSON.stringify(parsed.problems)).not.toContain(ID1);
    expect(parsed.rows).toHaveLength(1); // the caller refuses the whole file; the good entry is not special
  });

  test("a file that is not an array is refused", () => {
    expect(parseExport({ name: "tg:chat", value: "1" }).problems).toHaveLength(1);
    expect(parseExport("[]").problems).toHaveLength(1);
    expect(parseExport([]).problems).toEqual([]);
  });
});

describe("plan and apply", () => {
  let db: Db;
  beforeEach(async () => {
    db = await makeTestDb();
  });

  test("a dry run gives the counts and writes nothing", async () => {
    const plan = await planCopy(db, parseExport(exportFile()));
    expect(plan.counts.fb).toEqual({ total: 2, added: 2, unchanged: 0, overwritten: 0 });
    expect(plan.counts.id).toEqual({ total: 2, added: 2, unchanged: 0, overwritten: 0 });
    expect(plan.counts["tg:chat"]).toEqual({ total: 1, added: 1, unchanged: 0, overwritten: 0 });
    expect(plan.skipped).toEqual({ rl: 2, other: 1 });
    expect(plan.pending).toHaveLength(5);
    expect(await rows(db)).toEqual([]);
  });

  test("the printed plan has counts and no key or value", async () => {
    const lines = describePlan(await planCopy(db, parseExport(exportFile())), "Dry run (local)").join("\n");
    expect(lines).toContain("fb:");
    expect(lines).toContain("skipped: rl 2, other 1");
    for (const secret of [FB1, ID1, ID2, "Made-up remark", "100200300", "203.0.113.7", "something:else"]) expect(lines).not.toContain(secret);
  });

  test("apply writes the copied keys and only those, with the values as they were", async () => {
    const file = exportFile();
    const written = await applyCopy(db, await planCopy(db, parseExport(file)));
    expect(written).toBe(5);
    const stored = await rows(db);
    expect(stored.map((r) => r.key)).toEqual([FB1, `id:${ID1}`, FB2, `id:${ID2}`, "tg:chat"].sort());
    expect(Object.fromEntries(stored.map((r) => [r.key, r.value]))).toEqual(Object.fromEntries(file.slice(0, 5).map((e) => [e.name, e.value])));
    expect(stored.every((r) => r.expiresAt === null)).toBe(true);
  });

  test("the copied comments read back through the app's store", async () => {
    await applyCopy(db, await planCopy(db, parseExport(exportFile())));
    const kv = new PgKv(db);
    expect(await kv.get(`id:${ID1}`)).toBe(FB1);
    expect(JSON.parse((await kv.get(FB1))!).text).toBe("Made-up remark one.");
    expect(await kv.get("tg:chat")).toBe("100200300");
    expect((await kv.list({ prefix: "fb:" })).keys.map((k) => k.name)).toEqual([FB1, FB2]);
    expect(await kv.get("rl:feedback:203.0.113.7")).toBeNull();
  });

  test("apply twice gives identical rows, and the second run has nothing to write", async () => {
    const parsed = parseExport(exportFile());
    await applyCopy(db, await planCopy(db, parsed));
    const first = await rows(db);
    const second = await planCopy(db, parsed);
    expect(second.pending).toEqual([]);
    expect(second.counts.fb).toEqual({ total: 2, added: 0, unchanged: 2, overwritten: 0 });
    expect(await applyCopy(db, second)).toBe(0);
    expect(await rows(db)).toEqual(first);
    expect(first).toHaveLength(5);
  });

  test("rl: rows are never written, not even with an expiration", async () => {
    await applyCopy(db, await planCopy(db, parseExport(exportFile())));
    expect((await rows(db)).filter((r) => r.key.startsWith("rl:"))).toEqual([]);
  });

  test("expiration maps to expires_at in the table", async () => {
    const parsed = parseExport([
      { name: "tg:chat", value: "1", expiration: 1790000000 },
      { name: FB1, value: "{}" },
    ]);
    await applyCopy(db, await planCopy(db, parsed));
    const byKey = Object.fromEntries((await rows(db)).map((r) => [r.key, r.expiresAt]));
    expect(byKey["tg:chat"]).toEqual(new Date(1790000000 * 1000));
    expect(byKey[FB1]).toBeNull();
    // run again: the same expiry is the same row
    expect((await planCopy(db, parsed)).pending).toEqual([]);
  });

  test("a row that differs is overwritten (counted as such in the dry run), the others are left alone", async () => {
    const file = exportFile();
    await applyCopy(db, await planCopy(db, parseExport(file)));
    const kv = new PgKv(db);
    await kv.put("tg:chat", "someone-elses-chat");
    await kv.put("fb:2026-10-01T00:00:00.000Z:newcomment0001", "{}"); // a comment made on the new site meanwhile
    const plan = await planCopy(db, parseExport(file));
    expect(plan.counts["tg:chat"]).toEqual({ total: 1, added: 0, unchanged: 0, overwritten: 1 });
    expect(plan.counts.fb).toEqual({ total: 2, added: 0, unchanged: 2, overwritten: 0 });
    expect(plan.pending.map((r) => r.key)).toEqual(["tg:chat"]);
    await applyCopy(db, plan);
    expect(await kv.get("tg:chat")).toBe("100200300");
    expect(await kv.get("fb:2026-10-01T00:00:00.000Z:newcomment0001")).toBe("{}"); // not in the file: untouched
  });

  test("a large export is written in batches", async () => {
    const big = Array.from({ length: 1203 }, (_, i) => ({ name: `fb:2026-09-01T00:00:00.000Z:${String(i).padStart(8, "0")}`, value: `{"n":${i}}` }));
    const parsed = parseExport(big);
    expect(await applyCopy(db, await planCopy(db, parsed))).toBe(1203);
    expect(await rows(db)).toHaveLength(1203);
    expect((await planCopy(db, parsed)).pending).toEqual([]);
  });
});

describe("the CLI's guards", () => {
  test("--target must agree with the address (the same guard as fill-ru)", () => {
    expect(targetMatches("postgres://u:p@localhost:5432/mslab", "local")).toBe(true);
    expect(targetMatches("postgres://u:p@x.proxy.rlwy.net:123/railway", "local")).toBe(false);
    expect(targetMatches("postgres://u:p@x.proxy.rlwy.net:123/railway", "railway")).toBe(true);
    expect(targetMatches("postgres://u:p@localhost:5432/mslab", "railway")).toBe(false);
    expect(targetMatches("postgres://u:p@db.example.test/x", "railway")).toBe(false);
    expect(targetMatches("not a url", "local")).toBe(false);
  });
});
