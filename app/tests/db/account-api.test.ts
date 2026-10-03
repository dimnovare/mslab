import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { clientLoginTokens, clients, clientSessions, mailQuota } from "@/db/schema";
import { clearedCookies, handleAccountApi, sessionCookies, type AccountDeps } from "@/server/account-api";
import { CLIENT_SESSION_TTL_MS, LOGIN_MAIL_DAILY_CAP } from "@/server/client-auth";
import { sha256 } from "@/server/token";
import { fakeKv, stubFetch } from "../fakes";
import { makeTestDb } from "./helpers";

// The client account's sign-in API without Next.js: PGlite database, in-memory KV (the rate-limit store), stubbed fetch
// for Resend. `later` collects what production runs after the response (the e-mail); `flush()` awaits it.
// EMAIL is a sample address (`@example.test`: never mailed outside development); MAILED is a stand-in for a real one.

const NOW = new Date("2026-10-02T10:00:00Z");
const SITE = "https://mslab.example";
const EMAIL = "kati@example.test";
const MAILED = "kati@example.com";

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});
beforeEach(async () => {
  await db.delete(clientLoginTokens);
  await db.delete(clientSessions);
  await db.delete(clients);
  await db.delete(mailQuota);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Setup = { dev?: boolean; key?: boolean; kv?: ReturnType<typeof fakeKv>; now?: Date };

function setup(opts: Setup = {}) {
  const kv = opts.kv ?? fakeKv();
  const tasks: (() => Promise<unknown>)[] = [];
  const deps: AccountDeps = {
    db,
    env: {
      KV: kv, MAIL_FROM: "MS LAB <info@send.example>", MARIA_EMAIL: "maria@example.test", SITE_URL: SITE,
      ...(opts.key === false ? {} : { RESEND_API_KEY: "re_test" }),
    },
    now: opts.now ?? NOW,
    siteUrl: SITE,
    later: (task) => void tasks.push(task),
    dev: opts.dev ?? true,
  };
  return { deps, kv, queued: () => tasks.length, flush: () => Promise.all(tasks.splice(0).map((task) => task())) };
}

type Call = { body?: unknown; method?: string; cookie?: string; headers?: Record<string, string>; ip?: string | null };

/** One request to the router; `ip` is the visitor's address (x-forwarded-for), null for none. */
async function call(deps: AccountDeps, path: string, o: Call = {}): Promise<Response> {
  const headers = new Headers(o.headers);
  if (o.cookie) headers.set("cookie", o.cookie);
  const ip = o.ip === undefined ? "203.0.113.1" : o.ip;
  if (ip) headers.set("x-forwarded-for", ip);
  const res = await handleAccountApi(
    new Request(`${SITE}/api/konto${path}`, {
      method: o.method ?? (o.body !== undefined ? "POST" : "GET"),
      headers,
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    }),
    deps,
  );
  return res!;
}

/** The raw session id in a Set-Cookie list, as the Cookie header a browser would send back. */
const sessionCookie = (res: Response): string | undefined => {
  const line = res.headers.getSetCookie().find((c) => c.startsWith("__Host-mslab_client=") && !c.includes("Max-Age=0"));
  return line?.split(";")[0];
};
const rawOf = (cookie: string) => cookie.slice("__Host-mslab_client=".length);

/** Login in development, then the code from the answer: the Cookie header of the new session. */
async function signIn(deps: AccountDeps, email = EMAIL, ip?: string): Promise<string> {
  const login = await (await call(deps, "/login", { body: { email, locale: "et" }, ip })).json();
  const res = await call(deps, "/code", { body: { email, code: login.devCode }, ip });
  expect(res.status).toBe(200);
  return sessionCookie(res)!;
}

const tokens = () => db.select().from(clientLoginTokens);
const sessions = () => db.select().from(clientSessions);
const quota = () => db.select().from(mailQuota);
const tokenOf = (link: string) => new URL(link).searchParams.get("t")!;

/** Resend as the stub fetch sees it: the e-mails sent. */
function resend(respond: () => Response = () => Response.json({ id: "email_1" })) {
  const f = stubFetch(respond);
  return { mails: () => f.calls.filter((c) => c.url.includes("resend")).map((c) => c.body as { from: string; to: string; subject: string; text: string }), calls: f.calls };
}
const codeOf = (mail: { text: string }) => mail.text.split("\n").find((l) => /^\d{6}$/.test(l))!;

describe("login in development", () => {
  test("the code and the link come back in the answer, a token row is stored, nothing is mailed or counted", async () => {
    const { mails } = resend();
    const { deps, queued, flush } = setup({ dev: true }); // a RESEND_API_KEY is set: still no mail
    const res = await call(deps, "/login", { body: { email: EMAIL, locale: "et" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, devCode: expect.stringMatching(/^\d{6}$/), devLink: expect.stringContaining(`${SITE}/api/konto/verify?t=`) });
    const rows = await tokens();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: EMAIL, attempts: 0, usedAt: null, expiresAt: new Date(NOW.getTime() + 30 * 60_000) });
    expect(rows[0].hash).toBe(await sha256(tokenOf(body.devLink)));
    expect(queued()).toBe(0);
    await flush();
    expect(mails()).toHaveLength(0);
    expect(await quota()).toEqual([]);
  });

  test("the address is trimmed and lower-cased", async () => {
    const { deps } = setup();
    expect((await call(deps, "/login", { body: { email: " Kati@Example.TEST " } })).status).toBe(200);
    expect((await tokens()).map((t) => t.email)).toEqual([EMAIL]);
  });

  test("the code logs in, once: two cookies, and /me answers for them", async () => {
    const { deps } = setup();
    const { devCode } = await (await call(deps, "/login", { body: { email: EMAIL } })).json();
    const res = await call(deps, "/code", { body: { email: EMAIL.toUpperCase(), code: devCode } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, locale: "et" });
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    const cookie = sessionCookie(res)!;
    expect(cookies).toEqual(sessionCookies(rawOf(cookie)));
    // only the hash of the session id is stored
    const [session] = await sessions();
    expect(session.idHash).toBe(await sha256(rawOf(cookie)));
    expect(session.expiresAt).toEqual(new Date(NOW.getTime() + CLIENT_SESSION_TTL_MS));

    const me = await call(deps, "/me", { cookie: `other=1; ${cookie}; mslab_in=1` });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ ok: true, email: EMAIL, name: "" });
    expect(me.headers.getSetCookie()).toEqual([]);

    expect((await call(deps, "/code", { body: { email: EMAIL, code: devCode } })).status).toBe(400); // used up
  });

  test("a code typed with a space (\"123 456\") is the same code", async () => {
    const { deps } = setup();
    const { devCode } = await (await call(deps, "/login", { body: { email: EMAIL } })).json();
    const res = await call(deps, "/code", { body: { email: EMAIL, code: ` ${devCode.slice(0, 3)} ${devCode.slice(3)} ` } });
    expect(res.status).toBe(200);
  });

  test("a failing rate limit store lets the login through, and logs no address", async () => {
    const kv = fakeKv();
    kv.get = async () => { throw new Error(`store down for ${EMAIL}`); };
    const { deps } = setup({ kv });
    const res = await call(deps, "/login", { body: { email: EMAIL } });
    expect(res.status).toBe(200);
    expect((await res.json()).devCode).toMatch(/^\d{6}$/);
    const logged = vi.mocked(console.error).mock.calls.flat().join("\n");
    expect(logged).toContain("[account] rate limit unavailable, allowing");
    expect(logged).not.toMatch(/kati|example\.test/);
  });
});

describe("login outside development", () => {
  test("a mailed address gets the same plain answer and the e-mail goes out after the response, counted once", async () => {
    const { mails } = resend();
    const { deps, queued, flush } = setup({ dev: false });
    const res = await call(deps, "/login", { body: { email: MAILED, locale: "et" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true }); // no devCode, no devLink
    expect(await tokens()).toHaveLength(1);
    expect(queued()).toBe(1);
    expect(mails()).toHaveLength(0); // sent after the response
    expect((await quota())[0]).toMatchObject({ day: "2026-10-02", sent: 1 });
    await flush();
    const [mail] = mails();
    expect(mail).toMatchObject({ from: "MS LAB <info@send.example>", to: MAILED });
    const code = codeOf(mail);
    expect(mail.subject).toBe(`${code} — MS LAB sisselogimiskood`);
    expect(mail.text).toContain(`${SITE}/api/konto/verify?t=`);
    // the e-mailed code and the e-mailed link each sign in (the first one used wins)
    const link = new URL(mail.text.match(/https:\/\/\S+/)![0]);
    const signedIn = await call(deps, `${link.pathname.slice("/api/konto".length)}${link.search}`);
    expect(signedIn.status).toBe(303);
    expect(signedIn.headers.get("location")).toBe(`${SITE}/konto`);
    expect((await call(deps, "/code", { body: { email: MAILED, code } })).status).toBe(400); // the token is used
  });

  test("the e-mailed code signs in", async () => {
    const { mails } = resend();
    const { deps, flush } = setup({ dev: false });
    await call(deps, "/login", { body: { email: MAILED } });
    await flush();
    const res = await call(deps, "/code", { body: { email: MAILED, code: codeOf(mails()[0]) } });
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toBeDefined();
  });

  test("Russian: the page language, or the client's own language when the address has an account", async () => {
    const { mails } = resend();
    const { deps, flush } = setup({ dev: false });
    await call(deps, "/login", { body: { email: MAILED, locale: "ru" } });
    await flush();
    expect(mails()[0].subject).toMatch(/^\d{6} — код входа MS LAB$/);
    expect(mails()[0].text).toContain("Код и ссылка действуют 30 минут.");

    await db.insert(clients).values({ email: "olga@example.com", locale: "ru" });
    await db.insert(clients).values({ email: "mari@example.com", locale: "et" });
    await call(deps, "/login", { body: { email: "olga@example.com", locale: "et" } }); // an account in Russian wins over the page
    await call(deps, "/login", { body: { email: "mari@example.com", locale: "ru" } }); // and one in Estonian too
    await flush();
    expect(mails().slice(1).map((m) => m.subject.replace(/^\d{6}/, "N"))).toEqual(["N — код входа MS LAB", "N — MS LAB sisselogimiskood"]);
  });

  test("a missing or unknown language is Estonian", async () => {
    const { mails } = resend();
    const { deps, flush } = setup({ dev: false });
    for (const body of [{ email: "a@example.com" }, { email: "b@example.com", locale: "fr" }, { email: "c@example.com", locale: 7 }])
      await call(deps, "/login", { body });
    await flush();
    expect(mails().map((m) => m.subject.replace(/^\d{6}/, "N"))).toEqual(Array(3).fill("N — MS LAB sisselogimiskood"));
  });

  test("a sample address (@example.test) gets { ok: true } and a login row, but no mail and no count against the daily cap", async () => {
    const { mails } = resend();
    const { deps, queued, flush } = setup({ dev: false });
    const res = await call(deps, "/login", { body: { email: "Kati@Example.TEST" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await tokens()).toHaveLength(1);
    expect(queued()).toBe(0);
    await flush();
    expect(mails()).toHaveLength(0);
    expect(await quota()).toEqual([]);
  });

  test("the daily cap reached: the same answer, a login row, no mail queued, and a note in the log without the address", async () => {
    const { mails } = resend();
    await db.insert(mailQuota).values({ day: "2026-10-02", sent: LOGIN_MAIL_DAILY_CAP });
    const { deps, queued, flush } = setup({ dev: false });
    const res = await call(deps, "/login", { body: { email: MAILED } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await tokens()).toHaveLength(1);
    expect(queued()).toBe(0);
    await flush();
    expect(mails()).toHaveLength(0);
    expect((await quota())[0].sent).toBe(LOGIN_MAIL_DAILY_CAP); // not counted past the cap
    const logged = vi.mocked(console.error).mock.calls.flat().join("\n");
    expect(logged).toContain("[account] daily login mail cap reached");
    expect(logged).not.toMatch(/kati|example\.com/);
  });

  test("an address with 3 live logins already: the same answer, no fourth login, no fourth mail", async () => {
    const { mails } = resend();
    const { deps, flush } = setup({ dev: false });
    const answers = [];
    for (let i = 0; i < 4; i++) answers.push(await (await call(deps, "/login", { body: { email: MAILED } })).json());
    await flush();
    expect(answers).toEqual(Array(4).fill({ ok: true }));
    expect(await tokens()).toHaveLength(3);
    expect(mails()).toHaveLength(3);
    expect((await quota())[0].sent).toBe(3);
  });

  test("a failing e-mail provider does not change the answer", async () => {
    const { mails } = resend(() => Response.json({ name: "validation_error", message: `${MAILED} is not allowed` }, { status: 422 }));
    const { deps, flush } = setup({ dev: false });
    const res = await call(deps, "/login", { body: { email: MAILED } });
    expect(await res.json()).toEqual({ ok: true });
    await flush();
    expect(mails()).toHaveLength(1);
  });

  test("without RESEND_API_KEY nothing is sent", async () => {
    const { mails } = resend();
    const { deps, flush } = setup({ dev: false, key: false });
    expect((await call(deps, "/login", { body: { email: MAILED } })).status).toBe(200);
    await flush();
    expect(mails()).toHaveLength(0);
  });
});

describe("rate limits", () => {
  test("login: 10 per 10 minutes per address of the visitor, then 429 { error: \"rate\" } and no login row", async () => {
    const { deps, kv } = setup();
    for (let i = 0; i < 10; i++) expect((await call(deps, "/login", { body: { email: `s${i}@example.test` }, ip: "203.0.113.7" })).status).toBe(200);
    const res = await call(deps, "/login", { body: { email: "s10@example.test" }, ip: "203.0.113.7" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, error: "rate" });
    expect(await tokens()).toHaveLength(10);
    expect(kv.store.get("rl:client-login:203.0.113.7")).toBe("10");
    expect(kv.ttl.get("rl:client-login:203.0.113.7")).toBe(600);
    // another visitor is not affected
    expect((await call(deps, "/login", { body: { email: "s11@example.test" }, ip: "203.0.113.8" })).status).toBe(200);
  });

  test("requests that are not well-formed are not counted", async () => {
    const { deps, kv } = setup();
    for (let i = 0; i < 12; i++) await call(deps, "/login", { body: { email: "nope" }, ip: "203.0.113.7" });
    expect(kv.store.size).toBe(0);
    expect((await call(deps, "/login", { body: { email: EMAIL }, ip: "203.0.113.7" })).status).toBe(200);
  });

  test("every address of an IPv6 /64 shares one bucket", async () => {
    const { deps, kv } = setup();
    await call(deps, "/login", { body: { email: EMAIL }, ip: "2001:db8:1:2:aaaa:bbbb:cccc:dddd" });
    await call(deps, "/login", { body: { email: EMAIL }, ip: "2001:db8:1:2:1111:2222:3333:4444" });
    expect(kv.store.get("rl:client-login:2001:db8:1:2::/64")).toBe("2");
  });

  test("code: 20 per 10 minutes per visitor (its own bucket), then 429 { error: \"rate\" }", async () => {
    const { deps, kv } = setup();
    for (let i = 0; i < 20; i++) expect((await call(deps, "/code", { body: { email: EMAIL, code: "000000" }, ip: "203.0.113.7" })).status).toBe(400);
    const res = await call(deps, "/code", { body: { email: EMAIL, code: "000000" }, ip: "203.0.113.7" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, error: "rate" });
    expect(kv.store.get("rl:client-code:203.0.113.7")).toBe("20");
    expect(kv.store.has("rl:client-login:203.0.113.7")).toBe(false);
  });

  test("no visitor address: development uses one local bucket, production does not limit (and writes nothing)", async () => {
    const dev = setup({ dev: true });
    await call(dev.deps, "/login", { body: { email: EMAIL }, ip: null });
    expect(dev.kv.store.get("rl:client-login:local")).toBe("1");
    const prod = setup({ dev: false });
    for (let i = 0; i < 12; i++) expect((await call(prod.deps, "/login", { body: { email: EMAIL }, ip: null })).status).toBe(200);
    expect(prod.kv.store.size).toBe(0);
  });
});

describe("wrong and missing codes", () => {
  test("a wrong code is 400 { error: \"code\" }; five wrong tries end the login even for the right code", async () => {
    const { deps } = setup();
    const { devCode } = await (await call(deps, "/login", { body: { email: EMAIL } })).json();
    const wrong = devCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const res = await call(deps, "/code", { body: { email: EMAIL, code: wrong } });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "code" });
      expect(res.headers.getSetCookie()).toEqual([]);
    }
    const res = await call(deps, "/code", { body: { email: EMAIL, code: devCode } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "expired" });
    expect(await sessions()).toEqual([]);
  });

  test("no live login for the address (unknown address, expired, used): 400 { error: \"expired\" }", async () => {
    const { deps } = setup();
    const unknown = await call(deps, "/code", { body: { email: "nobody@example.test", code: "123456" } });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ ok: false, error: "expired" });

    const { devCode } = await (await call(deps, "/login", { body: { email: EMAIL } })).json();
    const later = setup({ now: new Date(NOW.getTime() + 30 * 60_000 + 1) }).deps;
    const res = await call(later, "/code", { body: { email: EMAIL, code: devCode } });
    expect(await res.json()).toEqual({ ok: false, error: "expired" });
  });

  test("the code of an address does not work for another address", async () => {
    const { deps } = setup();
    const { devCode } = await (await call(deps, "/login", { body: { email: EMAIL } })).json();
    await call(deps, "/login", { body: { email: "other@example.test" } });
    const res = await call(deps, "/code", { body: { email: "other@example.test", code: devCode } });
    expect(res.status).toBe(400);
    expect(sessionCookie(res)).toBeUndefined();
  });
});

describe("one device", () => {
  test("a second login ends the first session: its /me says 401 { reason: \"replaced\" } and clears the hint cookie", async () => {
    const { deps } = setup();
    const first = await signIn(deps);
    expect((await call(deps, "/me", { cookie: first })).status).toBe(200);
    const second = await signIn(deps, EMAIL, "198.51.100.9"); // another device
    expect(second).not.toBe(first);

    const old = await call(deps, "/me", { cookie: first });
    expect(old.status).toBe(401);
    expect(await old.json()).toEqual({ ok: false, reason: "replaced" });
    expect(old.headers.getSetCookie()).toEqual([clearedCookies()[1]]);
    const now = await call(deps, "/me", { cookie: second });
    expect(now.status).toBe(200);
    expect(await now.json()).toMatchObject({ ok: true, email: EMAIL });
    expect(await db.select().from(clients)).toHaveLength(1);
  });

  test("the link also ends the other session", async () => {
    const { deps } = setup();
    const first = await signIn(deps);
    const { devLink } = await (await call(deps, "/login", { body: { email: EMAIL } })).json();
    const verified = await call(deps, `/verify?t=${tokenOf(devLink)}`);
    expect(verified.status).toBe(303);
    expect((await call(deps, "/me", { cookie: first })).status).toBe(401);
    expect((await call(deps, "/me", { cookie: sessionCookie(verified)! })).status).toBe(200);
  });
});

describe("verify", () => {
  test("a bad token goes to /konto/sisene?viga=link: absolute address, no cookies, no Referer sent on", async () => {
    const { deps } = setup();
    for (const path of ["/verify?t=" + "A".repeat(43), "/verify?t=nope", "/verify?t=", "/verify"]) {
      const res = await call(deps, path);
      expect(res.status, path).toBe(303);
      expect(res.headers.get("location"), path).toBe(`${SITE}/konto/sisene?viga=link`);
      expect(res.headers.getSetCookie(), path).toEqual([]);
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  test("a prefetch leaves a good token unused; the click then signs in, once", async () => {
    const { deps } = setup();
    const { devLink } = await (await call(deps, "/login", { body: { email: EMAIL } })).json();
    const t = tokenOf(devLink);
    for (const headers of [{ "sec-purpose": "prefetch" }, { purpose: "prefetch" }, { "sec-purpose": "prefetch;prerender" }] as Record<string, string>[]) {
      const res = await call(deps, `/verify?t=${t}`, { headers });
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(`${SITE}/konto/sisene`);
      expect(res.headers.getSetCookie()).toEqual([]);
    }
    expect((await tokens())[0].usedAt).toBeNull();
    expect(await sessions()).toEqual([]);

    const res = await call(deps, `/verify?t=${t}`);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${SITE}/konto`);
    expect(res.headers.getSetCookie()).toEqual(sessionCookies(rawOf(sessionCookie(res)!)));
    expect((await call(deps, "/me", { cookie: sessionCookie(res)! })).status).toBe(200);

    const again = await call(deps, `/verify?t=${t}`);
    expect(again.headers.get("location")).toBe(`${SITE}/konto/sisene?viga=link`);
  });

  test("a client who uses Russian lands on /ru/konto", async () => {
    const { deps } = setup();
    await db.insert(clients).values({ email: EMAIL, locale: "ru" });
    const { devLink } = await (await call(deps, "/login", { body: { email: EMAIL } })).json();
    const res = await call(deps, `/verify?t=${tokenOf(devLink)}`);
    expect(res.headers.get("location")).toBe(`${SITE}/ru/konto`);
    const code = await (await call(deps, "/login", { body: { email: EMAIL } })).json();
    expect(await (await call(deps, "/code", { body: { email: EMAIL, code: code.devCode } })).json()).toEqual({ ok: true, locale: "ru" });
  });

  test("one login, one use: the code kills the link and the link kills the code", async () => {
    const { deps } = setup();
    const a = await (await call(deps, "/login", { body: { email: EMAIL } })).json();
    expect((await call(deps, "/code", { body: { email: EMAIL, code: a.devCode } })).status).toBe(200);
    expect((await call(deps, `/verify?t=${tokenOf(a.devLink)}`)).headers.get("location")).toBe(`${SITE}/konto/sisene?viga=link`);

    const b = await (await call(deps, "/login", { body: { email: EMAIL } })).json();
    expect((await call(deps, `/verify?t=${tokenOf(b.devLink)}`)).headers.get("location")).toBe(`${SITE}/konto`);
    expect((await call(deps, "/code", { body: { email: EMAIL, code: b.devCode } })).status).toBe(400);
  });

  test("an expired link goes to ?viga=link; a HEAD request does not use the token", async () => {
    const { deps } = setup();
    const { devLink } = await (await call(deps, "/login", { body: { email: EMAIL } })).json();
    expect((await call(deps, `/verify?t=${tokenOf(devLink)}`, { method: "HEAD" })).status).toBe(404);
    expect((await tokens())[0].usedAt).toBeNull();
    const later = setup({ now: new Date(NOW.getTime() + 30 * 60_000 + 1) }).deps;
    expect((await call(later, `/verify?t=${tokenOf(devLink)}`)).headers.get("location")).toBe(`${SITE}/konto/sisene?viga=link`);
  });

  test("a first login creates the client once", async () => {
    const { deps } = setup();
    await signIn(deps);
    await signIn(deps);
    expect(await db.select().from(clients)).toHaveLength(1);
  });
});

describe("logout and me", () => {
  test("logout ends this session (reason logout) and clears both cookies; /me then says so", async () => {
    const { deps } = setup();
    const cookie = await signIn(deps);
    const res = await call(deps, "/logout", { method: "POST", cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.getSetCookie()).toEqual(clearedCookies());
    expect((await sessions())[0]).toMatchObject({ endReason: "logout" });
    const me = await call(deps, "/me", { cookie });
    expect(me.status).toBe(401);
    expect(await me.json()).toEqual({ ok: false, reason: "logout" });
  });

  test("logout is cross-site protected and leaves the session alone", async () => {
    const { deps } = setup();
    const cookie = await signIn(deps);
    const res = await call(deps, "/logout", { method: "POST", cookie, headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    expect((await call(deps, "/me", { cookie })).status).toBe(200);
  });

  test("logout with a cookie that is not a session still answers ok", async () => {
    const { deps } = setup();
    const res = await call(deps, "/logout", { method: "POST", cookie: `__Host-mslab_client=${"B".repeat(43)}` });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toEqual(clearedCookies());
  });

  test("a session unused for 180 days is 401 { reason: \"expired\" }", async () => {
    const { deps } = setup();
    const cookie = await signIn(deps);
    const old = setup({ now: new Date(NOW.getTime() + CLIENT_SESSION_TTL_MS + 1000) }).deps;
    const res = await call(old, "/me", { cookie });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, reason: "expired" });
  });

  test("an unknown session id is 401 { reason: \"none\" }", async () => {
    const { deps } = setup();
    const res = await call(deps, "/me", { cookie: `__Host-mslab_client=${"C".repeat(43)}` });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, reason: "none" });
    expect(res.headers.getSetCookie()).toEqual([clearedCookies()[1]]);
  });

  test("/me gives the name from the account", async () => {
    const { deps } = setup();
    const cookie = await signIn(deps);
    await db.update(clients).set({ name: "Kati Tamm" }).where(eq(clients.email, EMAIL));
    expect(await (await call(deps, "/me", { cookie })).json()).toEqual({ ok: true, email: EMAIL, name: "Kati Tamm" });
  });
});

describe("no account enumeration", () => {
  test("a known and an unknown address get the same answer", async () => {
    resend();
    const { deps } = setup({ dev: false });
    await db.insert(clients).values({ email: MAILED });
    const known = await call(deps, "/login", { body: { email: MAILED } });
    const unknown = await call(deps, "/login", { body: { email: "nobody@example.com" } });
    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());
  });
});

describe("logs hold no personal data", () => {
  test("a whole sign-in with a failing provider, a failing store, a wrong code and the cap: no address, code, token or cookie", async () => {
    const f = resend(() => Response.json({ name: "validation_error", message: `${MAILED} is not allowed` }, { status: 422 }));
    const kv = fakeKv();
    const down = Object.assign(new Error(`down ${MAILED}`), { code: "ECONNRESET" });
    const { deps, flush } = setup({ dev: false, kv });
    await call(deps, "/login", { body: { email: MAILED } });
    await flush();
    const mail = f.mails()[0];
    const code = codeOf(mail);
    const token = mail.text.match(/\?t=([A-Za-z0-9_-]+)/)![1];
    kv.get = async () => { throw down; };
    await call(deps, "/code", { body: { email: MAILED, code: code === "000000" ? "111111" : "000000" } });
    const cookie = sessionCookie(await call(deps, "/code", { body: { email: MAILED, code } }))!;
    await call(deps, `/verify?t=${token}`);
    await call(deps, "/me", { cookie });
    await call(deps, "/logout", { method: "POST", cookie });
    await db.update(mailQuota).set({ sent: LOGIN_MAIL_DAILY_CAP });
    await call(deps, "/login", { body: { email: "other@example.com" } });

    const logged = ["info", "error", "log", "warn"].flatMap((m) => (console as unknown as Record<string, { mock?: { calls: unknown[][] } }>)[m].mock?.calls ?? []).flat().join("\n");
    expect(logged.length).toBeGreaterThan(0);
    for (const secret of [MAILED, "kati", "other@example", code, token, rawOf(cookie)]) expect(logged).not.toContain(secret);
  });
});
