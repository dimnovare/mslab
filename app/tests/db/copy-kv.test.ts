import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asc, sql } from "drizzle-orm";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTestDb } from "./helpers";
import type { Db } from "@/db/client";
import { kvEntries } from "@/db/schema";
import { applyCopy, copyRefusal, describePlan, MAX_EXPIRATION, parseExport, planCopy, readExport, runCli, settle, type Connect, type Io } from "@/db/copy-kv";
import { targetMatches } from "@/db/fill-ru";
import { safeDbError } from "@/db/safe-error";
import { PgKv } from "@/server/kv";

// The copy of the review comments from the old Cloudflare KV (an export file) into kv_entries. All data here is made up.

const ID1 = "abc123def456gh";
const ID2 = "zz99yy88xx77ww";
const FB1 = `fb:2026-09-01T10:00:00.000Z:${ID1}`;
const FB2 = `fb:2026-09-02T11:30:00.000Z:${ID2}`;
const comment = (id: string, text: string) => JSON.stringify({ id, at: "2026-09-01T10:00:00.000Z", name: "Test Person", dir: "site", text, el: {}, done: false });
const NUL = String.fromCharCode(0);
/** 2100-01-01T00:00:00Z: far enough ahead that no test depends on the clock. */
const FUTURE = 4102444800;
const NOW = new Date("2026-10-02T12:00:00.000Z");

/** A small export in the shape wrangler gives: two comments with their lookups, the chat id, and keys that are not copied. */
const exportFile = () => [
  { name: FB1, value: comment(ID1, "Made-up remark one.") },
  { name: `id:${ID1}`, value: FB1 },
  { name: FB2, value: comment(ID2, "Made-up remark two.") },
  { name: `id:${ID2}`, value: FB2 },
  { name: "tg:chat", value: "100200300" },
  { name: "rl:feedback:203.0.113.7", value: "3", expiration: FUTURE },
  { name: "rl:contact:203.0.113.8", value: "1" },
  { name: "something:else", value: "x" },
];

const rows = (db: Db) => db.select().from(kvEntries).orderBy(asc(kvEntries.key));

describe("parsing the export", () => {
  test("copies fb:, id: and tg:chat; counts rl: and everything else as skipped", () => {
    const parsed = parseExport(exportFile(), NOW);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows.map((r) => r.key)).toEqual([FB1, `id:${ID1}`, FB2, `id:${ID2}`, "tg:chat"]);
    expect(parsed.skipped).toEqual({ rl: 2, other: 1, expired: 0 });
  });

  test("only the exact key tg:chat is copied: tg:chat2, tg:other, TG:chat and a trailing space are skipped", () => {
    const parsed = parseExport(
      [
        { name: "tg:chat2", value: "1" },
        { name: "tg:other", value: "1" },
        { name: "TG:chat", value: "1" },
        { name: "tg:chat ", value: "1" },
        { name: " tg:chat", value: "1" },
        { name: "tg:", value: "1" },
        { name: "FB:x", value: "1" },
        { name: "ID:x", value: "1" },
        { name: "RL:x", value: "1" },
        { name: "fb", value: "1" },
        { name: "tg:chat", value: "42" },
      ],
      NOW,
    );
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toEqual([{ key: "tg:chat", value: "42", expiresAt: null }]);
    expect(parsed.skipped).toEqual({ rl: 0, other: 10, expired: 0 }); // "RL:x" is not rl: either
  });

  test("expiration (unix seconds) becomes expiresAt; no expiration is null", () => {
    const parsed = parseExport(
      [
        { name: "tg:chat", value: "1", expiration: FUTURE },
        { name: FB1, value: "{}" },
      ],
      NOW,
    );
    expect(parsed.rows[0].expiresAt).toEqual(new Date("2100-01-01T00:00:00.000Z"));
    expect(parsed.rows[1].expiresAt).toBeNull();
  });

  test("an expiration outside the range of a date is refused, so the dry run refuses what the apply would fail on", () => {
    const at = (expiration: unknown) => parseExport([{ name: FB1, value: "{}", expiration }], NOW);
    expect(at(MAX_EXPIRATION).problems).toEqual([]); // 9999-12-31T23:59:59Z
    expect(at(MAX_EXPIRATION).rows[0].expiresAt).toEqual(new Date("9999-12-31T23:59:59.000Z"));
    for (const bad of [MAX_EXPIRATION + 1, Number.MAX_SAFE_INTEGER, 8.64e15, 1e21, 0, -1, 1.5, NaN, Infinity, "1790000000", null, true]) {
      expect(at(bad).problems.map((p) => p.index), String(bad)).toEqual([0]);
    }
  });

  test("a copied entry whose expiration has passed is skipped and counted as expired; the boundary second is expired too", () => {
    const nowSec = NOW.getTime() / 1000;
    const parsed = parseExport(
      [
        { name: FB1, value: "{}", expiration: nowSec - 1 },
        { name: `id:${ID1}`, value: FB1, expiration: nowSec }, // not after now: expired
        { name: FB2, value: "{}", expiration: nowSec + 1 }, // still alive
        { name: "tg:chat", value: "1" },
        { name: "rl:x", value: "1", expiration: 5 }, // an rl: key counts as rl, however old
      ],
      NOW,
    );
    expect(parsed.problems).toEqual([]);
    expect(parsed.skipped).toEqual({ rl: 1, other: 0, expired: 2 });
    expect(parsed.rows.map((r) => r.key)).toEqual([FB2, "tg:chat"]);
  });

  test("an expired entry is still checked: a bad shape or a duplicate is refused even when it would be skipped", () => {
    const parsed = parseExport(
      [
        { name: FB1, value: "{}", expiration: 5 },
        { name: FB1, value: "{}", expiration: 5 }, // duplicate
        { name: FB2, value: 7, expiration: 5 }, // value not a string
      ],
      NOW,
    );
    expect(parsed.problems.map((p) => p.index)).toEqual([1, 2]);
  });

  test("a skipped entry needs only a name: a rate limit exported without its value is no problem", () => {
    const parsed = parseExport([{ name: "rl:feedback:203.0.113.7" }, { name: "x", value: 5 }], NOW);
    expect(parsed.problems).toEqual([]);
    expect(parsed.skipped).toEqual({ rl: 1, other: 1, expired: 0 });
  });

  test("malformed entries are listed by index and reason, never by content", () => {
    const secret = "very-private-client-text";
    const parsed = parseExport(
      [
        { name: FB1, value: "{}" }, // 0: fine
        { name: FB2, value: 42 }, // 1: value not a string
        "just a string", // 2: not an object
        { value: secret }, // 3: no name
        { name: `id:${ID1}`, value: FB1, expiration: "tomorrow" }, // 4: bad expiration
        { name: `id:${ID2}`, value: FB2, expiration: -5 }, // 5: bad expiration
        { name: FB1, value: secret }, // 6: the same key twice
        null, // 7
        { name: "tg:chat", value: `a${NUL}${secret}` }, // 8: NUL in the value
        { name: `fb:${NUL}${secret}`, value: "{}" }, // 9: NUL in the key
      ],
      NOW,
    );
    expect(parsed.problems.map((p) => p.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(JSON.stringify(parsed.problems)).not.toContain(secret);
    expect(JSON.stringify(parsed.problems)).not.toContain(ID1);
    expect(parsed.rows).toHaveLength(1); // the caller refuses the whole file; the good entry is not special
  });

  test("a file that is not an array is refused", () => {
    expect(parseExport({ name: "tg:chat", value: "1" }, NOW).problems).toHaveLength(1);
    expect(parseExport("[]", NOW).problems).toHaveLength(1);
    expect(parseExport([], NOW).problems).toEqual([]);
  });
});

describe("plan and apply", () => {
  let db: Db;
  beforeEach(async () => {
    db = await makeTestDb();
  });

  test("a dry run gives the counts and writes nothing", async () => {
    const plan = await planCopy(db, parseExport(exportFile(), NOW));
    expect(plan.counts.fb).toEqual({ total: 2, added: 2, unchanged: 0, overwritten: 0 });
    expect(plan.counts.id).toEqual({ total: 2, added: 2, unchanged: 0, overwritten: 0 });
    expect(plan.counts["tg:chat"]).toEqual({ total: 1, added: 1, unchanged: 0, overwritten: 0 });
    expect(plan.skipped).toEqual({ rl: 2, other: 1, expired: 0 });
    expect(plan.pending).toHaveLength(5);
    expect(await rows(db)).toEqual([]);
  });

  test("the printed plan has counts and no key or value", async () => {
    const parsed = parseExport([...exportFile(), { name: "fb:old", value: "{}", expiration: 5 }], NOW);
    const lines = describePlan(await planCopy(db, parsed), "Dry run (local)").join("\n");
    expect(lines).toContain("fb:");
    expect(lines).toContain("skipped: rl 2, other 1, expired 1");
    for (const secret of [FB1, ID1, ID2, "Made-up remark", "100200300", "203.0.113.7", "something:else", "fb:old"]) expect(lines).not.toContain(secret);
  });

  test("apply writes the copied keys and only those, with the values as they were", async () => {
    const file = exportFile();
    const written = await applyCopy(db, await planCopy(db, parseExport(file, NOW)));
    expect(written).toBe(5);
    const stored = await rows(db);
    expect(stored.map((r) => r.key)).toEqual([FB1, `id:${ID1}`, FB2, `id:${ID2}`, "tg:chat"].sort());
    expect(Object.fromEntries(stored.map((r) => [r.key, r.value]))).toEqual(Object.fromEntries(file.slice(0, 5).map((e) => [e.name, e.value])));
    expect(stored.every((r) => r.expiresAt === null)).toBe(true);
  });

  test("the copied comments read back through the app's store", async () => {
    await applyCopy(db, await planCopy(db, parseExport(exportFile(), NOW)));
    const kv = new PgKv(db);
    expect(await kv.get(`id:${ID1}`)).toBe(FB1);
    expect(JSON.parse((await kv.get(FB1))!).text).toBe("Made-up remark one.");
    expect(await kv.get("tg:chat")).toBe("100200300");
    expect((await kv.list({ prefix: "fb:" })).keys.map((k) => k.name)).toEqual([FB1, FB2]);
    expect(await kv.get("rl:feedback:203.0.113.7")).toBeNull();
  });

  test("apply twice gives identical rows, and the second run has nothing to write", async () => {
    const parsed = parseExport(exportFile(), NOW);
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
    await applyCopy(db, await planCopy(db, parseExport(exportFile(), NOW)));
    expect((await rows(db)).filter((r) => r.key.startsWith("rl:"))).toEqual([]);
  });

  test("expiration maps to expires_at in the table, up to the largest accepted second", async () => {
    const parsed = parseExport(
      [
        { name: "tg:chat", value: "1", expiration: FUTURE },
        { name: FB1, value: "{}" },
        { name: FB2, value: "{}", expiration: MAX_EXPIRATION },
      ],
      NOW,
    );
    await applyCopy(db, await planCopy(db, parsed));
    const byKey = Object.fromEntries((await rows(db)).map((r) => [r.key, r.expiresAt]));
    expect(byKey["tg:chat"]).toEqual(new Date(FUTURE * 1000));
    expect(byKey[FB1]).toBeNull();
    expect(byKey[FB2]).toEqual(new Date("9999-12-31T23:59:59.000Z"));
    // run again: the same expiry is the same row
    expect((await planCopy(db, parsed)).pending).toEqual([]);
  });

  test("an entry that has expired is not written", async () => {
    const parsed = parseExport(
      [
        { name: FB1, value: "{}", expiration: 5 },
        { name: FB2, value: "{}", expiration: FUTURE },
      ],
      NOW,
    );
    expect(parsed.skipped.expired).toBe(1);
    await applyCopy(db, await planCopy(db, parsed));
    expect((await rows(db)).map((r) => r.key)).toEqual([FB2]);
  });

  test("a row that differs is overwritten (counted as such in the dry run), the others are left alone", async () => {
    const file = exportFile();
    await applyCopy(db, await planCopy(db, parseExport(file, NOW)));
    const kv = new PgKv(db);
    await kv.put("tg:chat", "someone-elses-chat");
    await kv.put("fb:2026-10-01T00:00:00.000Z:newcomment0001", "{}"); // a comment made on the new site meanwhile
    const plan = await planCopy(db, parseExport(file, NOW));
    expect(plan.counts["tg:chat"]).toEqual({ total: 1, added: 0, unchanged: 0, overwritten: 1 });
    expect(plan.counts.fb).toEqual({ total: 2, added: 0, unchanged: 2, overwritten: 0 });
    expect(plan.pending.map((r) => r.key)).toEqual(["tg:chat"]);
    await applyCopy(db, plan);
    expect(await kv.get("tg:chat")).toBe("100200300");
    expect(await kv.get("fb:2026-10-01T00:00:00.000Z:newcomment0001")).toBe("{}"); // not in the file: untouched
  });

  test("a large export is written in batches", async () => {
    const big = Array.from({ length: 1203 }, (_, i) => ({ name: `fb:2026-09-01T00:00:00.000Z:${String(i).padStart(8, "0")}`, value: `{"n":${i}}` }));
    const parsed = parseExport(big, NOW);
    expect(await applyCopy(db, await planCopy(db, parsed))).toBe(1203);
    expect(await rows(db)).toHaveLength(1203);
    expect((await planCopy(db, parsed)).pending).toEqual([]);
  });
});

describe("a failing database says nothing of the data", () => {
  const SECRET_VALUE = "private-comment-text-from-a-client";
  const SECRET_KEY = "fb:2026-09-03T09:00:00.000Z:secretkey000001";

  test("a row Postgres cannot store (NUL, past the file checks): the error text has its code and neither the key nor the value", async () => {
    const db = await makeTestDb();
    const row = { key: SECRET_KEY, value: `a${NUL}${SECRET_VALUE}`, expiresAt: null };
    const plan = await planCopy(db, { rows: [row], skipped: { rl: 0, other: 0, expired: 0 }, problems: [] });
    const failure = await applyCopy(db, plan).then(
      () => null,
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(Error);
    const text = safeDbError(failure);
    expect(text).toContain("22021"); // invalid byte sequence for encoding UTF8: the SQLSTATE of the driver's error, found under Drizzle's wrapper
    expect(text).not.toContain(SECRET_KEY);
    expect(text).not.toContain(SECRET_VALUE);
    expect(await rows(db)).toEqual([]); // the one transaction rolled back
  });

  test("the CLI path: a failing apply prints a fixed text with the SQLSTATE, exits 1, closes the connection, leaves the table unchanged", async () => {
    const db = await makeTestDb();
    await db.execute(sql.raw(`alter table kv_entries add constraint kv_no_poison check (value <> '${SECRET_VALUE}')`));
    const file = writeExport([
      { name: FB1, value: comment(ID1, "Made-up remark one.") },
      { name: SECRET_KEY, value: SECRET_VALUE }, // the database refuses this one
    ]);
    const { io, out, err } = recorder();
    const close = vi.fn(async () => {});
    const code = await runCli(["--target", "local", "--file", file, "--apply"], { DATABASE_URL: LOCAL }, io, () => ({ db, close }), NOW);
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/Copy failed: database error \[23514\]/);
    for (const text of [...out, ...err]) {
      expect(text).not.toContain(SECRET_KEY);
      expect(text).not.toContain(SECRET_VALUE);
      expect(text).not.toContain(FB1);
      expect(text).not.toContain("Made-up remark");
    }
    expect(close).toHaveBeenCalledTimes(1);
    expect(await rows(db)).toEqual([]);
  });

  test("anything that escapes the CLI is one fixed line and a failing exit code", async () => {
    const errors: string[] = [];
    const code = await settle(Promise.reject(new Error(`Failed query: insert ... params: ${SECRET_VALUE}`)), { error: (l) => errors.push(l) });
    expect(code).toBe(1);
    expect(errors).toEqual(["Copy failed: unexpected error."]);
    expect(await settle(Promise.resolve(0), { error: () => errors.push("never") })).toBe(0);
    expect(errors).toHaveLength(1);
  });
});

const LOCAL = "postgres://u:p@localhost:5432/mslab";
const RAILWAY = "postgres://u:p@x.proxy.rlwy.net:123/railway";

const dir = mkdtempSync(join(tmpdir(), "copykv-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;
function writeExport(data: unknown, text?: string): string {
  const path = join(dir, `export-${n++}.json`);
  writeFileSync(path, text ?? JSON.stringify(data));
  return path;
}
function recorder(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { log: (l) => out.push(l), error: (l) => err.push(l) }, out, err };
}

describe("the CLI's guards", () => {
  test("--target must agree with the address (the same guard as fill-ru)", () => {
    expect(targetMatches("postgres://u:p@localhost:5432/mslab", "local")).toBe(true);
    expect(targetMatches("postgres://u:p@x.proxy.rlwy.net:123/railway", "local")).toBe(false);
    expect(targetMatches("postgres://u:p@x.proxy.rlwy.net:123/railway", "railway")).toBe(true);
    expect(targetMatches("postgres://u:p@localhost:5432/mslab", "railway")).toBe(false);
    expect(targetMatches("postgres://u:p@db.example.test/x", "railway")).toBe(false);
    expect(targetMatches("not a url", "local")).toBe(false);
  });

  test("copyRefusal: a target, a file and a database that agree, else the reason (never the address)", () => {
    expect(copyRefusal(LOCAL, ["--target", "local", "--file", "x.json"])).toBeNull();
    expect(copyRefusal(RAILWAY, ["--file", "x.json", "--target", "railway", "--apply"])).toBeNull();
    expect(copyRefusal(LOCAL, ["--file", "x.json"])).toMatch(/Say which database/);
    expect(copyRefusal(LOCAL, ["--target", "prod", "--file", "x.json"])).toMatch(/Say which database/);
    expect(copyRefusal(LOCAL, ["--target"])).toMatch(/Say which database/);
    expect(copyRefusal(LOCAL, ["--target", "local"])).toMatch(/--file/);
    expect(copyRefusal(LOCAL, ["--target", "local", "--file"])).toMatch(/--file/);
    expect(copyRefusal(LOCAL, ["--target", "local", "--file", "--apply"])).toMatch(/--file/);
    expect(copyRefusal(undefined, ["--target", "local", "--file", "x.json"])).toMatch(/DATABASE_URL is not set/);
    expect(copyRefusal(RAILWAY, ["--target", "local", "--file", "x.json"])).toMatch(/not a local database/);
    expect(copyRefusal(LOCAL, ["--target", "railway", "--file", "x.json"])).toMatch(/not a Railway database/);
    expect(copyRefusal("postgres://u:p@db.example.test/x", ["--target", "railway", "--file", "x.json"])).toMatch(/not a Railway database/);
    expect(copyRefusal("not a url", ["--target", "local", "--file", "x.json"])).toMatch(/not a local database/);
    for (const text of [copyRefusal(RAILWAY, ["--target", "local", "--file", "x.json"]), copyRefusal(LOCAL, ["--target", "railway", "--file", "x.json"])]) {
      expect(text).not.toContain("rlwy");
      expect(text).not.toContain("u:p");
    }
  });

  test("the CLI refuses before any connection: no target, no file, no URL, a mismatch, a bad file", async () => {
    const good = writeExport(exportFile());
    const malformed = writeExport([{ name: FB1, value: 5 }]);
    const notJson = writeExport(null, "{ not json private-text");
    const cases: { args: string[]; env?: string; says: RegExp }[] = [
      { args: ["--file", good], says: /Say which database/ },
      { args: ["--target", "local"], says: /--file/ },
      { args: ["--target", "local", "--file", good], env: "", says: /DATABASE_URL is not set/ },
      { args: ["--target", "railway", "--file", good], says: /not a Railway database/ }, // LOCAL url
      { args: ["--target", "local", "--file", good, "--apply"], env: RAILWAY, says: /not a local database/ },
      { args: ["--target", "local", "--file", join(dir, "missing.json")], says: /file cannot be read/ },
      { args: ["--target", "local", "--file", notJson], says: /not valid JSON/ },
      { args: ["--target", "local", "--file", malformed], says: /1 malformed entry, nothing written/ },
    ];
    for (const c of cases) {
      const connect = vi.fn<Connect>(() => {
        throw new Error("connected");
      });
      const { io, out, err } = recorder();
      const code = await runCli(c.args, { DATABASE_URL: c.env ?? LOCAL }, io, connect, NOW);
      expect(code, c.args.join(" ")).toBe(1);
      expect(err.join("\n")).toMatch(c.says);
      expect(out).toEqual([]);
      expect(connect).not.toHaveBeenCalled();
      expect(err.join("\n")).not.toContain("private-text");
      expect(err.join("\n")).not.toContain("rlwy");
    }
  });

  test("a malformed file is named by entry index only", async () => {
    const file = writeExport([{ name: FB1, value: "{}" }, { name: FB2, value: 7 }, "x"]);
    const { io, err } = recorder();
    expect(await runCli(["--target", "local", "--file", file], { DATABASE_URL: LOCAL }, io, undefined, NOW)).toBe(1);
    expect(err).toEqual(["Refusing: 2 malformed entries, nothing written.", "  entry 1: value is not a string", "  entry 2: not an object"]);
  });

  test("a file with a byte order mark is read", () => {
    const path = writeExport(null, String.fromCharCode(0xfeff) + JSON.stringify([{ name: "tg:chat", value: "1" }]));
    expect(readExport(path)).toEqual([{ name: "tg:chat", value: "1" }]);
  });

  test("a dry run through the CLI path prints counts and writes nothing; --apply writes, twice is the same", async () => {
    const db = await makeTestDb();
    const file = writeExport(exportFile());
    const close = vi.fn(async () => {});
    const connect: Connect = () => ({ db, close });

    const dry = recorder();
    expect(await runCli(["--target", "local", "--file", file], { DATABASE_URL: LOCAL }, dry.io, connect, NOW)).toBe(0);
    expect(dry.out[0]).toBe("Dry run (local): 5 row(s) to write.");
    expect(dry.out.join("\n")).toContain("skipped: rl 2, other 1, expired 0");
    expect(await rows(db)).toEqual([]);

    const first = recorder();
    expect(await runCli(["--target", "local", "--file", file, "--apply"], { DATABASE_URL: LOCAL }, first.io, connect, NOW)).toBe(0);
    expect(first.out.at(-1)).toBe("Applied: 5 row(s) written. Left to write now: 0.");
    const stored = await rows(db);
    expect(stored).toHaveLength(5);

    const second = recorder();
    expect(await runCli(["--target", "local", "--file", file, "--apply"], { DATABASE_URL: LOCAL }, second.io, connect, NOW)).toBe(0);
    expect(second.out.at(-1)).toBe("Applied: 0 row(s) written. Left to write now: 0.");
    expect(await rows(db)).toEqual(stored);

    for (const text of [...dry.out, ...first.out, ...second.out]) {
      for (const secret of [FB1, ID1, "Made-up remark", "100200300", "203.0.113.7", LOCAL, "u:p"]) expect(text).not.toContain(secret);
    }
    expect(close).toHaveBeenCalledTimes(3);
  });
});
