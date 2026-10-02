import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BAD_DATABASE_URL } from "@/server/env";

// getDb(): one postgres.js pool for the whole process, made from DATABASE_URL on first use. It is never closed by the
// app (no sql.end() per request) and never tied to a request. Nothing here connects: postgres.js connects on the first
// query, and these tests make none.

type Client = { options: { max: number; connect_timeout: number; idle_timeout: number | null; host: string[]; port: number[]; fetch_types: boolean }; end: () => Promise<void> };
const clientOf = (db: unknown): Client => (db as { $client: Client }).$client;
const POOL = "__mslabDb";
const forget = () => delete (globalThis as Record<string, unknown>)[POOL];

/** A fresh copy of the module, as after a restart (or a hot reload of `next dev`). */
const load = async () => {
  vi.resetModules();
  return (await import("@/db/client")).getDb;
};

beforeEach(() => {
  forget();
  vi.stubEnv("DATABASE_URL", "postgres://test:test@127.0.0.1:9/none");
});
afterEach(() => {
  vi.unstubAllEnvs();
  forget();
});

describe("getDb", () => {
  test("every call, wherever it is made, gets the same pool; it is never closed", async () => {
    const getDb = await load();
    const first = getDb();
    const end = vi.spyOn(clientOf(first), "end");
    const seen = await Promise.all([1, 2, 3].map(async () => (await Promise.resolve(), getDb())));
    for (const db of seen) expect(db).toBe(first);
    expect(end).not.toHaveBeenCalled();
  });

  test("the pool: at most 5 connections, 5 s to connect, idle ones closed after 20 s, address from DATABASE_URL", async () => {
    const options = clientOf((await load())()).options;
    expect(options).toMatchObject({ max: 5, connect_timeout: 5, idle_timeout: 20, host: ["127.0.0.1"], port: [9] });
  });

  test("evaluating the module again (a hot reload of next dev) does not open a second pool", async () => {
    const first = (await load())();
    const again = (await load())();
    expect(again).toBe(first);
  });

  test("production without DATABASE_URL fails with an error that names the variable and shows no value", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ADMIN_EMAILS", "admin@example.test");
    const getDb = await load();
    let message = "";
    try {
      getDb();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain("admin@example.test");
  });

  test("a DATABASE_URL that is not a postgres URL (garbage, or another scheme) fails with an error that names the variable and shows none of the value", async () => {
    const getDb = await load();
    for (const url of ["postgres://app:s3cret-pw#oops@db.example.com:5432/mslab", "https://app:s3cret-pw@db.example.com/mslab"]) {
      vi.stubEnv("DATABASE_URL", url);
      let error: unknown;
      try {
        getDb();
      } catch (e) {
        error = e;
      }
      expect((error as Error).message, url).toBe(BAD_DATABASE_URL);
      expect(JSON.stringify(error, Object.getOwnPropertyNames(error)), url).not.toContain("s3cret-pw"); // message, stack and any cause
    }
  });

  test("without DATABASE_URL outside production it is the local development database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const options = clientOf((await load())()).options;
    expect(options).toMatchObject({ host: ["localhost"], port: [5432] });
  });
});
