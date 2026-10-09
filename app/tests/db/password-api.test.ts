import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import type { Db } from "@/db/client";
import { clients, clientSessions, kvEntries, settings } from "@/db/schema";
import { handleAccountApi, type AccountDeps } from "@/server/account-api";
import { CLIENT_SESSION_TTL_MS } from "@/server/client-auth";
import { PgKv } from "@/server/kv";
import { verifyPassword } from "@/server/password";
import { rateKey } from "@/server/ratelimit";
import { newToken, sha256 } from "@/server/token";
import { stubFetch } from "../fakes";
import { makeTestDb } from "./helpers";

// Phase 2c (spec 7): the optional password through the account API — POST /parool sets or changes it, DELETE /parool removes it (each
// change mailed to her, the session going on), GET / says passwordSetAt, and POST /parool-login signs in with it: one answer for every
// failure, a lock after 5 failures for an address or 20 from an IP in 15 minutes. The KV store is the real Postgres one, with a clock
// the tests move. Mails go to a stubbed Resend (example.com addresses: a sample one, @example.test, is never mailed).
// verifyPassword is a spy on the real one (the lock must refuse before scrypt runs); `countingDb` sees how many transactions a login opens.

vi.mock("@/server/password", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/password")>();
  return { ...real, verifyPassword: vi.fn(real.verifyPassword) };
});

const NOW = new Date("2026-10-08T10:00:00Z");
const SITE = "https://mslab.example";
const PASSWORD = "pikk-parool-2026";
let db: Db;
let clock = NOW;
let infoSpy: MockInstance;
let errorSpy: MockInstance;

beforeEach(async () => {
  db = await makeTestDb();
  clock = NOW;
  vi.mocked(verifyPassword).mockClear();
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Dependencies at the current `clock`, with the real PgKv; `flush()` runs the work after the response, `queued()` counts it. */
function deps(over: Partial<AccountDeps> = {}) {
  const tasks: (() => Promise<unknown>)[] = [];
  const d: AccountDeps = {
    db,
    env: { KV: new PgKv(db, () => clock), MAIL_FROM: "MS LAB <info@send.example>", MARIA_EMAIL: "maria@example.test", SITE_URL: SITE, RESEND_API_KEY: "re_test" },
    now: clock,
    siteUrl: SITE,
    later: (task) => void tasks.push(task),
    dev: false,
    ...over,
  };
  return { d, flush: () => Promise.all(tasks.splice(0).map((task) => task())), queued: () => tasks.length };
}

/** `real`, counting the transactions opened through it (a login opens one; a request refused before the database opens none). */
function countingDb(real: Db) {
  const seen = { transactions: 0 };
  const proxy = new Proxy(real, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop === "transaction") return (...args: unknown[]) => (seen.transactions++, (value as (...a: unknown[]) => unknown).apply(target, args));
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { db: proxy as Db, seen };
}

/** A client with a live session (its cookie). */
async function signedIn(email = "kati@example.com") {
  const [client] = await db.insert(clients).values({ email }).returning();
  const raw = newToken();
  await db.insert(clientSessions).values({ idHash: await sha256(raw), clientId: client.id, createdAt: NOW, expiresAt: new Date(NOW.getTime() + CLIENT_SESSION_TTL_MS) });
  return { client, cookie: `__Host-mslab_client=${raw}` };
}

/** `ip`: the visitor's address (x-forwarded-for); null for no such header. */
type Call = { method: string; cookie?: string; body?: unknown; ip?: string | null };
const call = async (d: AccountDeps, path: string, c: Call) =>
  (await handleAccountApi(
    new Request(`${SITE}/api/konto${path}`, {
      method: c.method,
      headers: { ...(c.cookie ? { cookie: c.cookie } : {}), ...(c.ip === null ? {} : { "x-forwarded-for": c.ip ?? "203.0.113.9" }), "content-type": "application/json" },
      body: c.body === undefined ? undefined : JSON.stringify(c.body),
    }),
    d,
  ))!;
const resendCalls = (f: ReturnType<typeof stubFetch>) => f.calls.filter((c) => c.url.includes("resend")).map((c) => c.body as { to: string; subject: string; text: string });
/** A password login; `d` is built at `sec` seconds after NOW. */
const loginAt = (sec: number, body: unknown, ip?: string | null, over: Partial<AccountDeps> = {}) => {
  clock = new Date(NOW.getTime() + sec * 1000);
  return call(deps(over).d, "/parool-login", { method: "POST", body, ip });
};
const answer = async (res: Response) => [res.status, await res.json()];
/** The lock's counters above 0 (a slot given back leaves its row at "0" until the window ends). */
const counters = async () => Object.fromEntries((await db.select().from(kvEntries)).filter((r) => r.key.startsWith("rl:pw-") && r.value !== "0").map((r) => [r.key, r.value]));

test("POST /parool sets it: 200 with passwordSetAt, the dashboard says it, the change is mailed with Maria's address; the session goes on", async () => {
  const f = stubFetch(() => Response.json({ id: "email_1" }));
  await db.insert(settings).values({ key: "contact", value: { email: "info@mslab.ee" } });
  const { cookie } = await signedIn();
  const { d, flush } = deps();
  const res = await call(d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  expect([res.status, await res.json()]).toEqual([200, { ok: true, passwordSetAt: NOW.toISOString() }]);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  await flush();
  const mails = resendCalls(f);
  expect(mails.map((m) => [m.to, m.subject])).toEqual([["kati@example.com", "MS LABi konto parool on muudetud"]]);
  expect(mails[0].text).toContain("Kui see polnud sina, kirjuta kohe Mariale: info@mslab.ee");
  const dash = await call(d, "", { method: "GET", cookie });
  expect([dash.status, (await dash.json()).client.passwordSetAt]).toEqual([200, NOW.toISOString()]);
});

test("POST /parool refuses a short, a long or the e-mail address and a body without a string (400, nothing stored or mailed); 5 an hour (429)", async () => {
  const f = stubFetch(() => Response.json({ id: "email_1" }));
  const { cookie, client } = await signedIn();
  const { d, flush } = deps();
  const post = async (body: unknown) => {
    const r = await call(d, "/parool", { method: "POST", cookie, body });
    return [r.status, (await r.json()).error];
  };
  expect(await post({ password: "lühike" })).toEqual([400, "short"]);
  expect(await post({ password: "x".repeat(201) })).toEqual([400, "long"]);
  expect(await post({ password: "kati@example.com" })).toEqual([400, "email"]);
  expect(await post({ password: 12 })).toEqual([400, "password"]);
  expect((await db.select().from(clients).where(eq(clients.id, client.id)))[0].passwordHash).toBeNull();
  await flush();
  expect(resendCalls(f)).toEqual([]);
  // the three refusals after a usable body counted against the hour's 5
  expect(await post({ password: "pikk-parool-2026" })).toEqual([200, undefined]);
  expect(await post({ password: "teine-parool-2026" })).toEqual([200, undefined]);
  expect(await post({ password: "kolmas-parool-2026" })).toEqual([429, "rate"]);
});

test("DELETE /parool removes it: 200, passwordSetAt null again, the removal mailed; with none to remove nothing is mailed", async () => {
  const f = stubFetch(() => Response.json({ id: "email_1" }));
  const { cookie } = await signedIn();
  const { d, flush } = deps();
  expect((await call(d, "/parool", { method: "DELETE", cookie })).status).toBe(200);
  await flush();
  expect(resendCalls(f)).toEqual([]);
  await call(d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  const del = await call(d, "/parool", { method: "DELETE", cookie });
  expect(await del.json()).toEqual({ ok: true });
  await flush();
  expect(resendCalls(f)).toHaveLength(2);
  expect((await (await call(d, "", { method: "GET", cookie })).json()).client.passwordSetAt).toBeNull();
});

test("DELETE /parool counts in the same 5 changes an hour as POST: the 6th change, of either kind, is 429 { error: \"rate\" } and mails nothing; the password stays as it was", async () => {
  const f = stubFetch(() => Response.json({ id: "email_1" }));
  const { cookie } = await signedIn();
  const { d, flush } = deps();
  const change = async (method: "POST" | "DELETE") => {
    const r = await call(d, "/parool", { method, cookie, body: method === "POST" ? { password: PASSWORD } : undefined });
    return [r.status, (await r.json()).error];
  };
  for (const method of ["POST", "DELETE", "POST", "DELETE", "POST"] as const) expect(await change(method), method).toEqual([200, undefined]);
  await flush();
  expect(resendCalls(f)).toHaveLength(5); // five real changes, five mails
  expect(await change("DELETE")).toEqual([429, "rate"]);
  expect(await change("POST")).toEqual([429, "rate"]);
  await flush();
  expect(resendCalls(f)).toHaveLength(5);
  expect((await (await call(d, "", { method: "GET", cookie })).json()).client.passwordSetAt).toBe(NOW.toISOString()); // the refused DELETE removed nothing
  // the hour is the window of the last accepted change: an hour after it, a change is accepted again
  clock = new Date(NOW.getTime() + 61 * 60_000);
  expect((await call(deps().d, "/parool", { method: "DELETE", cookie })).status).toBe(200);
});

test("the answers of a refused DELETE hold neither the address nor the password in a log line", async () => {
  stubFetch(() => Response.json({ id: "email_1" }));
  const { cookie } = await signedIn();
  const { d } = deps();
  for (let i = 0; i < 6; i++) await call(d, "/parool", { method: "DELETE", cookie });
  const lines = JSON.stringify([...infoSpy.mock.calls, ...errorSpy.mock.calls]);
  expect(lines).toContain("password change rate limited");
  expect(lines).not.toContain("kati");
});

test("POST /parool-login: the right e-mail and password start the session (cookies, the old one replaced); every failure is the same 400", async () => {
  const { cookie } = await signedIn();
  const { d } = deps();
  await call(d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  await db.insert(clients).values({ email: "nopw@example.com" });
  const login = (body: unknown) => call(d, "/parool-login", { method: "POST", body });
  const ok = await login({ email: " KATI@example.com ", password: PASSWORD, locale: "ru" });
  expect([ok.status, await ok.json()]).toEqual([200, { ok: true, locale: "et" }]); // an existing account keeps its language
  expect(ok.headers.get("cache-control")).toBe("private, no-store");
  expect(ok.headers.getSetCookie().some((line) => line.startsWith("__Host-mslab_client="))).toBe(true);
  expect((await call(d, "", { method: "GET", cookie })).status).toBe(401); // one device: the old session was replaced
  for (const body of [
    { email: "kati@example.com", password: "vale-parool-2026" },
    { email: "keegi@example.com", password: PASSWORD },
    { email: "nopw@example.com", password: PASSWORD },
    { email: "kati@example.com" },
  ]) {
    const res = await login(body);
    expect([res.status, await res.json()], JSON.stringify(body)).toEqual([400, { ok: false, error: "password" }]);
  }
});

test("the lock per address: after 5 failures within 15 minutes even the right password is 429 locked, from any IP; 15 minutes after the last failure it works", async () => {
  const { cookie } = await signedIn();
  await call(deps().d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  const at = (sec: number) => {
    clock = new Date(NOW.getTime() + sec * 1000);
    return deps().d;
  };
  const login = (sec: number, password: string, ip: string) => call(at(sec), "/parool-login", { method: "POST", body: { email: "kati@example.com", password }, ip });
  for (let i = 0; i < 5; i++) expect((await login(i, `vale-${i}-parool`, `198.51.100.${i}`)).status).toBe(400);
  const locked = await login(10, PASSWORD, "198.51.100.77");
  expect([locked.status, await locked.json()]).toEqual([429, { ok: false, error: "locked" }]);
  expect((await login(4 + 15 * 60 + 1, PASSWORD, "198.51.100.78")).status).toBe(200);
}, 20_000);

// (PGlite has one connection and runs a transaction at a time, so this checks the counting of 8 attempts at once, not the advisory lock
// that makes them wait for each other on a real server: that is the pg_locks probe in client-password.test.ts.)
test("8 attempts sent at once at one address end as 5 failures and 3 refused as locked, whatever the IPs", async () => {
  const { cookie } = await signedIn();
  await call(deps().d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  const statuses = await Promise.all(
    Array.from({ length: 8 }, async (_, i) => (await call(deps().d, "/parool-login", { method: "POST", body: { email: "kati@example.com", password: `vale-${i}-parool` }, ip: `198.51.100.${i}` })).status),
  );
  expect(statuses.filter((s) => s === 400)).toHaveLength(5);
  expect(statuses.filter((s) => s === 429)).toHaveLength(3);
}, 20_000);

test("the lock per IP: 20 failures from one IP in 15 minutes, whatever the addresses (unknown ones too), lock that IP; another IP still signs in", async () => {
  const { cookie } = await signedIn();
  const { d } = deps();
  await call(d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  for (let i = 0; i < 20; i++)
    expect((await call(d, "/parool-login", { method: "POST", body: { email: `keegi${i}@example.com`, password: PASSWORD }, ip: "198.51.100.200" })).status).toBe(400);
  expect((await call(d, "/parool-login", { method: "POST", body: { email: "kati@example.com", password: PASSWORD }, ip: "198.51.100.200" })).status).toBe(429);
  expect((await call(d, "/parool-login", { method: "POST", body: { email: "kati@example.com", password: PASSWORD }, ip: "198.51.100.201" })).status).toBe(200);
}, 30_000);

// ---- the security properties the brief's tests above cannot fail on ---------------------------------------------------------------

test("one lock for an address with an account and one without: the same 429 locked; the counter is the hash of the normalised address, however it was typed", async () => {
  const { cookie } = await signedIn();
  await call(deps().d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  const known = ["kati@example.com", " KATI@example.com", "Kati@Example.com ", "kati@EXAMPLE.com", "\tkati@example.com\n"];
  const unknown = ["keegi@example.com", " KEEGI@example.com", "Keegi@Example.com ", "keegi@EXAMPLE.com", "\tkeegi@example.com\n"];
  for (const email of [...known, ...unknown]) expect((await loginAt(1, { email, password: "vale-parool-2026" })).status, email).toBe(400);
  const [lockedKnown, lockedUnknown] = await Promise.all([loginAt(2, { email: "kati@example.com", password: PASSWORD }), loginAt(2, { email: "keegi@example.com", password: PASSWORD })]);
  expect(await answer(lockedKnown)).toEqual([429, { ok: false, error: "locked" }]);
  expect(await answer(lockedUnknown)).toEqual([429, { ok: false, error: "locked" }]);
  for (const res of [lockedKnown, lockedUnknown]) expect(res.headers.get("cache-control")).toBe("private, no-store");
  // the rows: one counter per normalised address and one for the IP, none of them naming an address; the locked attempts counted nothing
  expect(await counters()).toEqual({
    [`rl:pw-mail:${await sha256("kati@example.com")}`]: "5",
    [`rl:pw-mail:${await sha256("keegi@example.com")}`]: "5",
    "rl:pw-ip:203.0.113.9": "10",
  });
});

test("a locked attempt is refused before scrypt runs and is counted nowhere: the address's lock, and the IP's lock before the login even opens a transaction", async () => {
  const { cookie } = await signedIn();
  await call(deps().d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  const verify = vi.mocked(verifyPassword);
  for (let i = 0; i < 5; i++) await loginAt(i, { email: "kati@example.com", password: `vale-${i}-parool` }, `198.51.100.${i}`);
  expect(verify).toHaveBeenCalledTimes(5);
  const before = await counters();
  // the address is locked: three attempts (right, wrong, with a new IP) check nothing and count nothing
  const counting = countingDb(db);
  for (const [password, ip] of [[PASSWORD, "198.51.100.1"], ["vale-parool-2026", "198.51.100.1"], [PASSWORD, "198.51.100.99"]] as const)
    expect(await answer(await loginAt(20, { email: "kati@example.com", password }, ip, { db: counting.db }))).toEqual([429, { ok: false, error: "locked" }]);
  expect(verify).toHaveBeenCalledTimes(5);
  expect(await counters()).toEqual(before);
  // the IP is locked: the answer comes before the login takes a database connection, let alone runs scrypt
  await new PgKv(db, () => clock).put(rateKey("pw-ip", "198.51.100.50"), "20", { expirationTtl: 900 });
  const sprayer = countingDb(db);
  expect(await answer(await loginAt(20, { email: "keegi@example.com", password: PASSWORD }, "198.51.100.50", { db: sprayer.db }))).toEqual([429, { ok: false, error: "locked" }]);
  expect(await answer(await loginAt(20, { email: "kati@example.com", password: PASSWORD }, "198.51.100.50", { db: sprayer.db }))).toEqual([429, { ok: false, error: "locked" }]);
  expect(sprayer.seen.transactions).toBe(0);
  expect(verify).toHaveBeenCalledTimes(5);
  expect((await counters())[rateKey("pw-ip", "198.51.100.50")]).toBe("20");
  // another IP takes the one transaction a login needs (the control: the proxy does see them)
  const other = countingDb(db);
  expect((await loginAt(20, { email: "keegi@example.com", password: PASSWORD }, "198.51.100.51", { db: other.db })).status).toBe(400);
  expect(other.seen.transactions).toBe(1);
}, 30_000);

test("a store that fails for the address's counter fails the login (500), never opens the lock: the right password does not sign in", async () => {
  const { cookie } = await signedIn();
  await call(deps().d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  await db.execute(sql`drop table kv_entries`);
  const sessionsBefore = (await db.select().from(clientSessions)).length;
  for (const password of [PASSWORD, "vale-parool-2026"]) {
    const res = await loginAt(1, { email: "kati@example.com", password });
    expect([res.status, await res.json()], password).toEqual([500, { ok: false, error: "server" }]);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.getSetCookie()).toEqual([]);
  }
  expect(await db.select().from(clientSessions)).toHaveLength(sessionsBefore); // no session started, the old one not replaced
  expect((await call(deps().d, "", { method: "GET", cookie })).status).toBe(200);
});

test("a failure that cannot be counted fails the login too (500), the success that needs no count does not", async () => {
  const { cookie } = await signedIn();
  await call(deps().d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  await db.execute(sql`create function no_counting() returns trigger language plpgsql as $$ begin raise exception 'no'; end $$`);
  await db.execute(sql`create trigger no_counting before insert or update on kv_entries for each row execute function no_counting()`);
  const wrong = await loginAt(1, { email: "kati@example.com", password: "vale-parool-2026" });
  expect([wrong.status, await wrong.json()]).toEqual([500, { ok: false, error: "server" }]);
  expect(await counters()).toEqual({}); // nothing was counted: the whole login was rolled back
  expect((await loginAt(2, { email: "kati@example.com", password: PASSWORD })).status).toBe(200);
});

test("the IP's store failing lets the attempt through (as the other limits); the address's lock does not depend on it", async () => {
  const { cookie } = await signedIn();
  await call(deps().d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  const down = async (): Promise<never> => { throw new Error("kv down"); };
  const broken = { get: down, put: down, reserve: down, release: down };
  const withBrokenIpStore = { env: { ...deps().d.env, KV: broken } };
  for (let i = 0; i < 5; i++) expect((await loginAt(i, { email: "kati@example.com", password: `vale-${i}-parool` }, undefined, withBrokenIpStore)).status).toBe(400);
  expect((await loginAt(6, { email: "kati@example.com", password: PASSWORD }, undefined, withBrokenIpStore)).status).toBe(429);
  expect((await loginAt(5 * 60, { email: "keegi@example.com", password: PASSWORD }, undefined, withBrokenIpStore)).status).toBe(400);
  expect((await loginAt(4 + 15 * 60 + 1, { email: "kati@example.com", password: PASSWORD }, undefined, withBrokenIpStore)).status).toBe(200);
}, 30_000);

test("without an address to key on: no IP counter in production (one bucket for everybody would lock everybody out), one local bucket in development; the address's lock holds either way", async () => {
  const { cookie } = await signedIn();
  await call(deps().d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  await db.insert(kvEntries).values({ key: "rl:old-and-expired", value: "1", expiresAt: new Date(NOW.getTime() - 1000) }); // for the sweep check below
  for (let i = 0; i < 5; i++) await loginAt(i, { email: "kati@example.com", password: `vale-${i}-parool` }, null);
  expect(await answer(await loginAt(6, { email: "kati@example.com", password: PASSWORD }, null))).toEqual([429, { ok: false, error: "locked" }]);
  expect(Object.keys(await counters()).filter((k) => k.startsWith("rl:pw-ip:"))).toEqual([]);
  // the counting happened on the login's transaction, which does not sweep: the expired row of another key was left to the next sweep
  expect((await db.select().from(kvEntries)).map((r) => r.key)).toContain("rl:old-and-expired");
  await loginAt(7, { email: "keegi@example.com", password: PASSWORD }, null, { dev: true });
  expect(await counters()).toMatchObject({ "rl:pw-ip:local": "1" });
}, 30_000);

test("no address, password or hash reaches a log line: set, the failures, the lock and the hourly limit", async () => {
  stubFetch(() => Response.json({ id: "email_1" }));
  const { cookie } = await signedIn();
  const { d, flush } = deps();
  await call(d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  await flush();
  for (let i = 0; i < 6; i++) await loginAt(i, { email: "kati@example.com", password: `vale-${i}-parool` });
  for (let i = 0; i < 6; i++) await call(d, "/parool", { method: "POST", cookie, body: { password: `muudetud-${i}-parool` } });
  const lines = JSON.stringify([...infoSpy.mock.calls, ...errorSpy.mock.calls]);
  expect(lines).toContain("password login locked"); // the lock was logged, so the check below has something to look at
  expect(lines).toContain("password change rate limited");
  const [stored] = await db.select().from(clients);
  for (const secret of ["kati@example.com", "kati", PASSWORD, "vale-", "muudetud-", "scrypt$", stored.passwordHash!, await sha256("kati@example.com")]) expect(lines, secret).not.toContain(secret);
});

test("the dashboard says when the password was set, and nothing of the hash", async () => {
  const { cookie } = await signedIn();
  const { d } = deps();
  const before = await (await call(d, "", { method: "GET", cookie })).json();
  expect(before.client.passwordSetAt).toBeNull();
  await call(d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  const after = await call(d, "", { method: "GET", cookie });
  const text = await after.text();
  expect(JSON.parse(text).client.passwordSetAt).toBe(NOW.toISOString());
  expect(text).not.toMatch(/scrypt|hash/i);
  expect(Object.keys(JSON.parse(text).client).sort()).toEqual(["email", "locale", "name", "newsletter", "passwordSetAt", "phone"]);
});

test("a replaced or ended session cannot set or remove the password; nothing is stored or mailed", async () => {
  const f = stubFetch(() => Response.json({ id: "email_1" }));
  const { cookie, client } = await signedIn();
  const { d, flush } = deps();
  await call(d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  await flush();
  expect((await loginAt(5, { email: "kati@example.com", password: PASSWORD })).status).toBe(200); // another device: the cookie above is replaced
  const [hash] = (await db.select().from(clients).where(eq(clients.id, client.id))).map((c) => c.passwordHash);
  for (const [method, body] of [["POST", { password: "teine-parool-2026" }], ["DELETE", undefined]] as const) {
    const res = await call(d, "/parool", { method, cookie, body });
    expect([res.status, await res.json()], method).toEqual([401, { ok: false, reason: "replaced" }]);
  }
  expect((await db.select().from(clients).where(eq(clients.id, client.id)))[0].passwordHash).toBe(hash);
  await flush();
  expect(resendCalls(f)).toHaveLength(1); // the first change only
});

test("the change mail goes out after the response and only then, never to a sample address, never in development, and says nothing of the password", async () => {
  const f = stubFetch(() => Response.json({ id: "email_1" }));
  const real = await signedIn("kati@example.com");
  const sample = await signedIn("sample@example.test");
  const { d, flush, queued } = deps();
  const set = (cookie: string) => call(d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  expect((await set(real.cookie)).status).toBe(200);
  expect(queued()).toBe(1);
  expect(resendCalls(f)).toEqual([]); // not before the response is on its way
  await flush();
  expect(resendCalls(f).map((m) => m.to)).toEqual(["kati@example.com"]);
  // a sample address: set, changed and removed, nothing is queued and nothing is sent
  expect((await set(sample.cookie)).status).toBe(200);
  expect((await call(d, "/parool", { method: "DELETE", cookie: sample.cookie })).status).toBe(200);
  expect(queued()).toBe(0);
  // development: the same, for a real-looking address
  const dev = deps({ dev: true });
  expect((await call(dev.d, "/parool", { method: "POST", cookie: real.cookie, body: { password: "teine-parool-2026" } })).status).toBe(200);
  expect((await call(dev.d, "/parool", { method: "DELETE", cookie: real.cookie })).status).toBe(200);
  expect(dev.queued()).toBe(0);
  await Promise.all([flush(), dev.flush()]);
  expect(resendCalls(f)).toHaveLength(1);
  expect(JSON.stringify(f.calls)).not.toContain(PASSWORD);
  expect(JSON.stringify(f.calls)).not.toContain("scrypt");
});

test("the change mail without Maria's address in Seaded writes the line without one", async () => {
  const f = stubFetch(() => Response.json({ id: "email_1" }));
  await db.insert(settings).values({ key: "contact", value: { email: "  " } });
  const { cookie } = await signedIn();
  const { d, flush } = deps();
  await call(d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  await flush();
  expect(resendCalls(f)[0].text).toContain("Kui see polnud sina, kirjuta kohe Mariale.");
  expect(resendCalls(f)[0].text).not.toContain("Mariale:");
});

// ---- the IP's slots are taken atomically, before the transaction and scrypt (fix round 1) -----------------------------------------

const IP = "198.51.100.60";
const ipSlot = async () => (await counters())[rateKey("pw-ip", IP)];
/** Puts the IP's counter at `n`, a window that starts now (the clock). */
const seedIp = (n: number, ip = IP) => new PgKv(db, () => clock).put(rateKey("pw-ip", ip), String(n), { expirationTtl: 900 });
const loginFrom = (d: AccountDeps, email: string, password: string, ip = IP) => call(d, "/parool-login", { method: "POST", body: { email, password }, ip });

test("40 attempts sent at once from one IP at 40 addresses: 20 take a slot and are checked, the other 20 are refused before the transaction and scrypt; 20 are counted", async () => {
  const counting = countingDb(db);
  const statuses = await Promise.all(Array.from({ length: 40 }, async (_, i) => (await loginFrom(deps({ db: counting.db }).d, `keegi${i}@example.com`, PASSWORD)).status));
  expect([statuses.filter((s) => s === 400).length, statuses.filter((s) => s === 429).length]).toEqual([20, 20]);
  expect(vi.mocked(verifyPassword)).toHaveBeenCalledTimes(20);
  expect(counting.seen.transactions).toBe(20);
  expect(await ipSlot()).toBe("20");
}, 30_000);

test("at 20 failures the 21st attempt from the IP, the right password too, is refused before the transaction and scrypt, and the counter stays 20", async () => {
  const { cookie } = await signedIn();
  await call(deps().d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  await seedIp(19);
  const counting = countingDb(db);
  const verify = vi.mocked(verifyPassword);
  expect(await answer(await loginFrom(deps({ db: counting.db }).d, "keegi@example.com", PASSWORD))).toEqual([400, { ok: false, error: "password" }]); // the 20th
  expect([await ipSlot(), verify.mock.calls.length, counting.seen.transactions]).toEqual(["20", 1, 1]);
  for (const [email, password] of [["keegi@example.com", PASSWORD], ["kati@example.com", PASSWORD], ["kati@example.com", "vale-parool-2026"]])
    expect(await answer(await loginFrom(deps({ db: counting.db }).d, email, password)), email).toEqual([429, { ok: false, error: "locked" }]);
  expect([await ipSlot(), verify.mock.calls.length, counting.seen.transactions]).toEqual(["20", 1, 1]);
});

test("a success and an attempt at a locked address give their slot back; a plain failure keeps it, and that is the count", async () => {
  const { cookie } = await signedIn();
  await call(deps().d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  await seedIp(3);
  expect((await loginFrom(deps().d, "kati@example.com", PASSWORD)).status).toBe(200);
  expect(await ipSlot()).toBe("3");
  expect((await loginFrom(deps().d, "kati@example.com", "vale-parool-2026")).status).toBe(400);
  expect(await ipSlot()).toBe("4");
  for (let i = 1; i <= 4; i++) await loginFrom(deps().d, "kati@example.com", `vale-${i}-parool`, `198.51.100.${60 + i}`); // the address has its 5 now
  expect(await ipSlot()).toBe("4");
  expect(await answer(await loginFrom(deps().d, "kati@example.com", PASSWORD))).toEqual([429, { ok: false, error: "locked" }]);
  expect(await ipSlot()).toBe("4");
});

test("an expired window starts again at 1: 15 minutes after the last failure the IP is open, and its next failure is its first", async () => {
  await seedIp(20);
  expect(await answer(await loginAt(10, { email: "keegi@example.com", password: PASSWORD }, IP))).toEqual([429, { ok: false, error: "locked" }]);
  expect(await ipSlot()).toBe("20");
  expect((await loginAt(15 * 60 + 1, { email: "keegi@example.com", password: PASSWORD }, IP)).status).toBe(400);
  expect(await ipSlot()).toBe("1");
});

test("the change mail goes out even when the contact setting cannot be read: the line without Maria's address", async () => {
  const f = stubFetch(() => Response.json({ id: "email_1" }));
  const { cookie } = await signedIn();
  await db.execute(sql`drop table settings`);
  const { d, flush } = deps();
  expect((await call(d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } })).status).toBe(200);
  await flush(); // does not reject
  const mails = resendCalls(f);
  expect(mails.map((m) => m.to)).toEqual(["kati@example.com"]);
  expect(mails[0].text).toContain("Kui see polnud sina, kirjuta kohe Mariale.");
  expect(mails[0].text).not.toContain("Mariale:");
});

test("a store that fails when the slot is given back does not fail a login that succeeded or was refused as locked (the IP keeps the slot, logged)", async () => {
  const { cookie } = await signedIn();
  await call(deps().d, "/parool", { method: "POST", cookie, body: { password: PASSWORD } });
  const pg = new PgKv(db, () => clock);
  const down = async (): Promise<never> => { throw new Error("kv down"); };
  const noRelease = { env: { ...deps().d.env, KV: { get: pg.get.bind(pg), put: pg.put.bind(pg), reserve: pg.reserve.bind(pg), release: down } } };
  expect((await loginAt(1, { email: "kati@example.com", password: PASSWORD }, IP, noRelease)).status).toBe(200);
  expect(await ipSlot()).toBe("1"); // not given back
  for (let i = 0; i < 5; i++) await loginAt(2 + i, { email: "kati@example.com", password: `vale-${i}-parool` }, `198.51.100.${70 + i}`);
  expect((await loginAt(10, { email: "kati@example.com", password: PASSWORD }, IP, noRelease)).status).toBe(429);
  expect(errorSpy.mock.calls.length).toBeGreaterThan(0); // the failures of the store were logged (class and code only)
});

