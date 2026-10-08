import { eq, isNull, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { beforeEach, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { clients, clientSessions } from "@/db/schema";
import { lockAddress, redeemClientPassword, type PasswordGate } from "@/server/client-auth";
import { removeClientPassword, setClientPassword } from "@/server/client-password";
import { DUMMY_HASH, verifyPassword } from "@/server/password";
import { makeTestDb } from "./helpers";

// Phase 2c (spec 7): the optional password in the database — set, changed and removed (only the scrypt hash and the time are kept), and
// the login check, which starts the code's own session (one device) and runs scrypt against the dummy hash when there is no password
// to check (the spy below sees it), so an unknown address takes as long as a wrong password.

vi.mock("@/server/password", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/password")>();
  return { ...real, verifyPassword: vi.fn(real.verifyPassword) };
});

const NOW = new Date("2026-10-08T10:00:00Z");
let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
  vi.mocked(verifyPassword).mockClear();
});
/** A gate that never limits (the real one is Task 12's; the gate is a required argument, so a test that needs none passes this). */
const open: PasswordGate = () => ({ open: async () => true, failed: async () => undefined });
const kati = async () => (await db.insert(clients).values({ email: "kati@example.test", locale: "ru" }).returning())[0];

test("setClientPassword keeps the scrypt hash and the time, never the password; refuses a short, a long and the e-mail itself; a gone client", async () => {
  const c = await kati();
  expect(await setClientPassword(db, c.id, "lühike", NOW)).toEqual({ kind: "problem", problem: "short" });
  expect(await setClientPassword(db, c.id, "x".repeat(201), NOW)).toEqual({ kind: "problem", problem: "long" });
  expect(await setClientPassword(db, c.id, "Kati@Example.test", NOW)).toEqual({ kind: "problem", problem: "email" });
  expect((await db.select().from(clients))[0].passwordHash).toBeNull();
  expect(await setClientPassword(db, c.id, "pikk-parool-2026", NOW)).toEqual({ kind: "saved", email: "kati@example.test", locale: "ru", changedAt: NOW });
  const [row] = await db.select().from(clients);
  expect(row.passwordHash).toMatch(/^scrypt\$15\$8\$1\$/);
  expect(row.passwordHash).not.toContain("pikk-parool-2026");
  expect(row.passwordChangedAt).toEqual(NOW);
  expect(await setClientPassword(db, 987654, "pikk-parool-2026", NOW)).toEqual({ kind: "gone" });
});

test("removeClientPassword clears the hash and the time and says whether there was one; the removed password no longer logs in", async () => {
  const c = await kati();
  expect(await removeClientPassword(db, c.id)).toEqual({ email: "kati@example.test", locale: "ru", had: false });
  await setClientPassword(db, c.id, "pikk-parool-2026", NOW);
  expect(await redeemClientPassword(db, "kati@example.test", "pikk-parool-2026", NOW, open)).toMatchObject({ clientId: c.id }); // it worked
  expect(await removeClientPassword(db, c.id)).toEqual({ email: "kati@example.test", locale: "ru", had: true });
  expect((await db.select().from(clients))[0]).toMatchObject({ passwordHash: null, passwordChangedAt: null });
  expect(await redeemClientPassword(db, "kati@example.test", "pikk-parool-2026", new Date(NOW.getTime() + 1000), open)).toBeNull(); // and now it is nothing
  expect(await db.select().from(clientSessions)).toHaveLength(1); // only the login before the removal
  expect(await removeClientPassword(db, 987654)).toBeNull();
});

test("redeemClientPassword: the right password starts a session and ends the other one (one device); a wrong one is null", async () => {
  const c = await kati();
  await setClientPassword(db, c.id, "pikk-parool-2026", NOW);
  expect(await redeemClientPassword(db, " KATI@example.test ", "pikk-parool-2026", NOW, open)).toMatchObject({ clientId: c.id, locale: "ru", isNew: false });
  expect(await redeemClientPassword(db, "kati@example.test", "pikk-parool-2026", new Date(NOW.getTime() + 1000), open)).toMatchObject({ clientId: c.id });
  const sessions = await db.select().from(clientSessions).where(eq(clientSessions.clientId, c.id));
  expect(sessions).toHaveLength(2);
  expect(await db.select().from(clientSessions).where(isNull(clientSessions.endedAt))).toHaveLength(1);
  expect(await redeemClientPassword(db, "kati@example.test", "pikk-parool-2025", NOW, open)).toBeNull();
});

test("an unknown address and one without a password run scrypt against the dummy hash (as long as a wrong password), and are null; no session", async () => {
  await kati();
  const verify = vi.mocked(verifyPassword);
  expect(await redeemClientPassword(db, "keegi@example.test", "pikk-parool-2026", NOW, open)).toBeNull();
  expect(verify).toHaveBeenLastCalledWith("pikk-parool-2026", DUMMY_HASH);
  expect(await redeemClientPassword(db, "kati@example.test", "pikk-parool-2026", NOW, open)).toBeNull(); // she has no password
  expect(verify).toHaveBeenLastCalledWith("pikk-parool-2026", DUMMY_HASH);
  expect(verify).toHaveBeenCalledTimes(2);
  expect(await db.select().from(clientSessions)).toEqual([]);
  expect(await db.select().from(clients)).toHaveLength(1); // a password login never creates a client
});

test("a match with the dummy hash never logs anyone in: an unknown address and one without a password stay null, with no session and no new client", async () => {
  await kati();
  const counted: string[] = [];
  const gate: PasswordGate = () => ({ open: async () => true, failed: async () => void counted.push("failed") });
  const verify = vi.mocked(verifyPassword);
  // as if the dummy hash matched (a bug in verifyPassword, a dummy made from a known password): it must still be a failure
  verify.mockResolvedValueOnce(true);
  expect(await redeemClientPassword(db, "keegi@example.test", "pikk-parool-2026", NOW, gate)).toBeNull();
  verify.mockResolvedValueOnce(true);
  expect(await redeemClientPassword(db, "kati@example.test", "pikk-parool-2026", NOW, gate)).toBeNull(); // she has no password
  expect(verify).toHaveBeenCalledTimes(2);
  expect(counted).toEqual(["failed", "failed"]);
  expect(await db.select().from(clientSessions)).toEqual([]);
  expect(await db.select().from(clients)).toHaveLength(1);
});

test("the gate (Task 12's lock), asked under the address lock: shut, nothing is checked and nothing counted; open, a failure is counted and a success is not", async () => {
  const c = await kati();
  await setClientPassword(db, c.id, "pikk-parool-2026", NOW);
  const counted: string[] = [];
  const gate = (open: boolean) => () => ({ open: async () => open, failed: async () => void counted.push("failed") });
  const verify = vi.mocked(verifyPassword);
  verify.mockClear();
  expect(await redeemClientPassword(db, "kati@example.test", "pikk-parool-2026", NOW, gate(false))).toBe("locked");
  expect(verify).not.toHaveBeenCalled();
  expect(counted).toEqual([]);
  expect(await redeemClientPassword(db, "kati@example.test", "vale-parool-2026", NOW, gate(true))).toBeNull();
  expect(await redeemClientPassword(db, "kati@example.test", "pikk-parool-2026", NOW, gate(true))).toMatchObject({ clientId: c.id });
  expect(counted).toEqual(["failed"]);
});

test("a failure with no password to check (an unknown address, none set) is counted too: the lock does not tell which addresses have accounts", async () => {
  await kati();
  const counted: string[] = [];
  const gate: PasswordGate = () => ({ open: async () => true, failed: async () => void counted.push("failed") });
  expect(await redeemClientPassword(db, "keegi@example.test", "pikk-parool-2026", NOW, gate)).toBeNull();
  expect(await redeemClientPassword(db, "kati@example.test", "pikk-parool-2026", NOW, gate)).toBeNull(); // she has no password
  expect(counted).toEqual(["failed", "failed"]);
});

// ---- the address lock -------------------------------------------------------------------------------------------------------------

/** How many advisory locks on this address's login key (lockAddress: hashtext of "client-login:<address>") the connection holds now. */
async function addressLocksHeld(t: Db, address: string): Promise<number> {
  const out = await t.execute<{ n: number }>(sql`
    select count(*)::int as n from pg_locks
    where locktype = 'advisory' and granted and pid = pg_backend_pid()
      and ((classid::bigint << 32) | objid::bigint) = hashtext(${"client-login:" + address})::bigint`);
  return (Array.isArray(out) ? out : out.rows)[0].n;
}

test("the gate is asked, and the failure counted, while the transaction holds the lock of the normalised address", async () => {
  const c = await kati();
  await setClientPassword(db, c.id, "pikk-parool-2026", NOW);
  const held: number[] = [];
  const gate: PasswordGate = (t) => ({
    open: async () => (held.push(await addressLocksHeld(t, "kati@example.test")), true),
    failed: async () => void held.push(await addressLocksHeld(t, "kati@example.test")),
  });
  expect(await addressLocksHeld(db, "kati@example.test")).toBe(0); // outside a transaction nothing is held: the probe can tell
  expect(await redeemClientPassword(db, " KATI@Example.test ", "vale-parool-2026", NOW, gate)).toBeNull();
  expect(held).toEqual([1, 1]); // when the gate is asked, and when the failure is counted
});

type Call = (...args: unknown[]) => unknown;
const dialect = new PgDialect();

/**
 * PGlite has one connection and runs one transaction at a time, so parallel logins would wait for each other here whatever the code
 * does, and a missing lock could never show. This gives Postgres's behaviour back for the test: transactions run side by side (their
 * queries interleave) and `pg_advisory_xact_lock(key)` makes a later transaction wait for the key until the one that holds it ends
 * (taking a key again in the same transaction is free). Everything else goes straight to the database. `onWait` is called when a
 * transaction has to wait for a key somebody else holds, so a test can tell "is waiting" from "went through" without guessing a time.
 */
function sideBySide(real: Db, onWait?: () => void): Db {
  const lines = new Map<string, Promise<void>>(); // per key: the end of the line of transactions waiting for it
  const inLine = new Map<string, number>(); // per key: how many transactions hold it or wait for it
  const plain = (target: object) =>
    new Proxy(target, {
      get(on, prop) {
        const value: unknown = Reflect.get(on, prop);
        return typeof value === "function" ? (value as Call).bind(on) : value;
      },
    });
  return new Proxy(real, {
    get(target, prop) {
      if (prop !== "transaction") return Reflect.get(plain(target), prop);
      return async (run: (t: Db) => Promise<unknown>) => {
        const mine = new Map<string, () => void>(); // the keys this transaction holds, and how to let each go
        const lock = async (key: string) => {
          if (mine.has(key)) return;
          const before = lines.get(key) ?? Promise.resolve();
          if ((inLine.get(key) ?? 0) > 0) onWait?.();
          inLine.set(key, (inLine.get(key) ?? 0) + 1);
          const done = new Promise<void>((release) => mine.set(key, () => (inLine.set(key, (inLine.get(key) ?? 1) - 1), release())));
          lines.set(key, before.then(() => done));
          await before;
        };
        const t = new Proxy(real, {
          get(on, name) {
            if (name !== "execute") return Reflect.get(plain(on), name);
            return async (query: { getSQL(): Parameters<PgDialect["sqlToQuery"]>[0] }) => {
              const { sql: text, params } = dialect.sqlToQuery(query.getSQL());
              if (!text.includes("pg_advisory_xact_lock")) return real.execute(query as never);
              await lock(String(params[0]));
              return [];
            };
          },
        }) as Db;
        try {
          return await run(t);
        } finally {
          for (const release of mine.values()) release();
        }
      };
    },
  }) as Db;
}

test("attempts sent at once for one address go one after another: the lock's counter stops them at 5, none passes alongside the others", async () => {
  const c = await kati();
  await setClientPassword(db, c.id, "pikk-parool-2026", NOW);
  const LIMIT = 5;
  const counter = { failures: 0 };
  // the lock's counter as Task 12 keeps it: read before the check (open), written after it (failed)
  const gate: PasswordGate = () => ({ open: async () => counter.failures < LIMIT, failed: async () => void (counter.failures += 1) });
  const verify = vi.mocked(verifyPassword);
  verify.mockClear();
  const racing = sideBySide(db); // one database for all eight, so they share the lock's line
  const results = await Promise.all(Array.from({ length: 8 }, () => redeemClientPassword(racing, "kati@example.test", "vale-parool-2026", NOW, gate)));
  expect(results.filter((r) => r === null)).toHaveLength(LIMIT); // checked and counted: wrong
  expect(results.filter((r) => r === "locked")).toHaveLength(8 - LIMIT); // met the shut gate: nothing checked
  expect(verify).toHaveBeenCalledTimes(LIMIT);
  expect(counter.failures).toBe(LIMIT);
});

/** Holds the login lock of `address` in a transaction of its own until `release()` (a login that is checking a password); resolves once it is held. */
async function holdLock(racing: Db, address: string): Promise<{ release(): void; ended: Promise<unknown> }> {
  let release!: () => void;
  const held = new Promise<void>((go) => (release = go));
  let taken!: () => void;
  const isTaken = new Promise<void>((go) => (taken = go));
  const ended = (racing as PostgresJsDatabase<typeof schema>).transaction(async (t) => {
    await lockAddress(t as unknown as Db, address);
    taken();
    await held;
  });
  await isTaken;
  return { release, ended };
}

/**
 * Starts `write` while a login holds the lock of Kati's address. `first`: "waiting" when the write reached the lock and had to wait,
 * "finished" when it went through without one; `hashThen`: her stored hash at that moment, with the lock still held.
 */
async function writeWhileALoginHoldsTheLock<T>(write: (racing: Db) => Promise<T>) {
  let wait!: () => void;
  const waiting = new Promise<"waiting">((go) => (wait = () => go("waiting")));
  const racing = sideBySide(db, wait);
  const login = await holdLock(racing, "kati@example.test");
  const writing = write(racing);
  const first = await Promise.race([waiting, writing.then(() => "finished" as const)]);
  const hashThen = (await db.select().from(clients))[0].passwordHash;
  login.release();
  const result = await writing;
  await login.ended;
  return { first, hashThen, result };
}

test("removing the password waits for a login that holds the address lock (one that read the hash before cannot be let through after), then removes it", async () => {
  const c = await kati();
  await setClientPassword(db, c.id, "pikk-parool-2026", NOW);
  const before = (await db.select().from(clients))[0].passwordHash;
  const { first, hashThen, result } = await writeWhileALoginHoldsTheLock((racing) => removeClientPassword(racing, c.id));
  expect(first).toBe("waiting");
  expect(hashThen).toBe(before); // still there while the login holds the lock
  expect(result).toEqual({ email: "kati@example.test", locale: "ru", had: true });
  expect((await db.select().from(clients))[0]).toMatchObject({ passwordHash: null, passwordChangedAt: null });
});

test("setting or changing the password waits for the address lock too, then writes", async () => {
  const c = await kati();
  await setClientPassword(db, c.id, "pikk-parool-2026", NOW);
  const before = (await db.select().from(clients))[0].passwordHash;
  const later = new Date(NOW.getTime() + 60_000);
  const { first, hashThen, result } = await writeWhileALoginHoldsTheLock((racing) => setClientPassword(racing, c.id, "uus-parool-2027", later));
  expect(first).toBe("waiting");
  expect(hashThen).toBe(before);
  expect(result).toEqual({ kind: "saved", email: "kati@example.test", locale: "ru", changedAt: later });
  const [row] = await db.select().from(clients);
  expect(row.passwordHash).not.toBe(before);
  expect(row.passwordChangedAt).toEqual(later);
  expect(await redeemClientPassword(db, "kati@example.test", "uus-parool-2027", later, open)).toMatchObject({ clientId: c.id });
});
