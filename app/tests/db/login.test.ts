import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { authTokens } from "@/db/schema";
import { LOGIN_TOKEN_CAP, consumeLoginToken, issueLoginToken } from "@/server/auth";
import { handleLoginRequest, verifyUrl, type LoginDeps, type LoginEnv } from "@/server/login";
import { RATE_LIMIT } from "@/server/ratelimit";
import { fakeKv, stubFetch } from "../fakes";
import { makeTestDb } from "./helpers";

// POST /api/auth/request without Next.js: PGlite database, in-memory KV, stubbed fetch for Resend.

const NOW = new Date("2026-10-01T10:00:00Z");
const ALLOW = "dim@example.test,maria@example.test";

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});
beforeEach(async () => {
  await db.delete(authTokens);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Dependencies with a fresh KV; `flush()` awaits the e-mail work that production runs after the response. */
function setup(opts: { key?: boolean; ip?: string | null; kv?: ReturnType<typeof fakeKv>; siteUrl?: string; host?: string | null } = {}) {
  const kv = opts.kv ?? fakeKv();
  const env: LoginEnv = {
    KV: kv,
    MAIL_FROM: "MS LAB <info@send.example>",
    MARIA_EMAIL: "maria@example.com",
    SITE_URL: "https://mslab.example",
    ADMIN_EMAILS: ALLOW,
    ...(opts.key === false ? {} : { RESEND_API_KEY: "re_test" }),
  };
  const tasks: (() => Promise<unknown>)[] = [];
  const deps: LoginDeps = {
    db,
    env,
    ip: opts.ip === undefined ? "203.0.113.1" : opts.ip,
    siteUrl: opts.siteUrl ?? "https://mslab.example",
    host: opts.host === undefined ? "localhost:3000" : opts.host,
    now: NOW,
    later: (task) => void tasks.push(task),
  };
  return { deps, kv, flush: () => Promise.all(tasks.splice(0).map((task) => task())) };
}

function resend(respond: () => Response = () => Response.json({ id: "email_1" })) {
  const f = stubFetch(respond);
  const mails = () => f.calls.filter((c) => c.url.includes("resend")).map((c) => c.body as { from: string; to: string; subject: string; text: string });
  return { mails, calls: f.calls };
}

const tokens = () => db.select().from(authTokens);
const tokenOf = (link: string) => new URL(link).searchParams.get("t")!;

describe("allowed address", () => {
  test("a token is stored and the link is e-mailed after the response", async () => {
    const { mails } = resend();
    const { deps, flush } = setup();
    const res = await handleLoginRequest(deps, { email: " dim@example.test " });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(await tokens()).toHaveLength(1);
    expect(mails()).toHaveLength(0); // sent after the response
    await flush();
    const [mail] = mails();
    expect(mail).toMatchObject({ from: "MS LAB <info@send.example>", to: "dim@example.test", subject: "MS LAB — sisselogimislink" });
    expect(mail.text).toContain("https://mslab.example/api/auth/verify?t=");
    expect(mail.text).toContain("15 minutit");
    expect(mail.text).toContain("ainult ühe korra");
    // the e-mailed link is the one that signs in, once
    const raw = mail.text.match(/\/api\/auth\/verify\?t=([A-Za-z0-9_-]+)/)![1];
    expect(await consumeLoginToken(db, raw, NOW)).toBe("dim@example.test");
    expect(await consumeLoginToken(db, raw, NOW)).toBeNull();
  });

  test("the link starts with the site address given to the handler", async () => {
    resend();
    const { deps } = setup({ siteUrl: "https://mslab-web.dim-novare.workers.dev" });
    const res = await handleLoginRequest(deps, { email: "maria@example.test" });
    expect(res.status === 200 && res.body.ok && res.body.devLink?.startsWith("https://mslab-web.dim-novare.workers.dev/api/auth/verify?t=")).toBe(true);
  });

  test("a failing e-mail provider does not change the answer", async () => {
    const { mails } = resend(() => Response.json({ name: "application_error", message: "dim@example.test is not allowed" }, { status: 422 }));
    const { deps, flush } = setup();
    const res = await handleLoginRequest(deps, { email: "dim@example.test" });
    expect(res.status).toBe(200);
    await flush();
    expect(mails()).toHaveLength(1);
    // no address, token or provider message in the logs
    const logged = [...vi.mocked(console.error).mock.calls, ...vi.mocked(console.info).mock.calls].flat().join("\n");
    expect(logged).not.toMatch(/dim\.novare|gmail/);
    expect(logged).not.toContain(tokenOf((res.body as { devLink: string }).devLink));
  });

  test("without RESEND_API_KEY (local development) nothing is sent", async () => {
    const { mails } = resend();
    const { deps, flush } = setup({ key: false });
    expect((await handleLoginRequest(deps, { email: "dim@example.test" })).status).toBe(200);
    await flush();
    expect(mails()).toHaveLength(0);
  });
});

describe("no account enumeration", () => {
  test("an address outside the allow-list gets the same answer, no token and no e-mail", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { mails } = resend();
    const { deps, flush } = setup();
    const allowed = await handleLoginRequest(deps, { email: "dim@example.test" });
    await db.delete(authTokens);
    const refused = await handleLoginRequest(deps, { email: "someone@gmail.com" });
    await flush();
    expect(refused).toEqual(allowed);
    expect(refused).toEqual({ status: 200, body: { ok: true } });
    expect(await tokens()).toHaveLength(0);
    expect(mails().map((m) => m.to)).toEqual(["dim@example.test"]); // only the allowed address got a mail
  });

  test("the rate limit counts allowed and not allowed addresses alike", async () => {
    resend();
    const { deps } = setup();
    for (let i = 0; i < RATE_LIMIT; i++) expect((await handleLoginRequest(deps, { email: i % 2 ? "dim@example.test" : "x@example.com" })).status).toBe(200);
    expect((await handleLoginRequest(deps, { email: "dim@example.test" })).status).toBe(429);
    expect((await handleLoginRequest(deps, { email: "x@example.com" })).status).toBe(429);
  });

  test("a failing database is an error only for the allowed address (the handler throws, the route answers 500)", async () => {
    resend();
    const broken = setup();
    broken.deps.db = {
      delete: () => {
        throw new Error("db down");
      },
    } as unknown as Db;
    await expect(handleLoginRequest(broken.deps, { email: "dim@example.test" })).rejects.toThrow();
    expect((await handleLoginRequest(broken.deps, { email: "other@example.com" })).status).toBe(200);
  });
});

describe("per-address cap", () => {
  const MIN = 60_000;

  test("the 4th request within 10 minutes still gets the neutral answer but creates no token and sends no mail", async () => {
    vi.stubEnv("NODE_ENV", "production"); // the answers are then byte-for-byte alike
    const { mails } = resend();
    const { deps, flush } = setup();
    const answers = [];
    for (let i = 0; i < LOGIN_TOKEN_CAP + 1; i++) answers.push(await handleLoginRequest(deps, { email: "dim@example.test" }));
    await flush();
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    expect(answers[0]).toEqual({ status: 200, body: { ok: true } });
    expect(await tokens()).toHaveLength(LOGIN_TOKEN_CAP);
    expect(mails()).toHaveLength(LOGIN_TOKEN_CAP);
    expect(LOGIN_TOKEN_CAP).toBe(3);
  });

  test("a capped request has no devLink either (nothing exists to link to)", async () => {
    resend();
    const { deps } = setup();
    for (let i = 0; i < LOGIN_TOKEN_CAP; i++) await handleLoginRequest(deps, { email: "dim@example.test" });
    expect(await handleLoginRequest(deps, { email: "dim@example.test" })).toEqual({ status: 200, body: { ok: true } });
  });

  test("it holds across IPs (the per-IP limit is not what protects an inbox), and other addresses are not affected", async () => {
    const { mails } = resend();
    const kv = fakeKv();
    const flushes = [];
    for (let i = 0; i < 6; i++) {
      const s = setup({ kv, ip: `198.51.100.${i}` });
      await handleLoginRequest(s.deps, { email: "dim@example.test" });
      flushes.push(s.flush());
    }
    const maria = setup({ kv, ip: "198.51.100.99" });
    await handleLoginRequest(maria.deps, { email: "maria@example.test" });
    await Promise.all([...flushes, maria.flush()]);
    expect(mails().filter((m) => m.to === "dim@example.test")).toHaveLength(LOGIN_TOKEN_CAP);
    expect(mails().filter((m) => m.to === "maria@example.test")).toHaveLength(1);
  });

  test("a burst of simultaneous requests cannot slip past the cap", async () => {
    resend();
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => handleLoginRequest(setup({ ip: `203.0.113.${i}` }).deps, { email: "dim@example.test" })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await tokens()).toHaveLength(LOGIN_TOKEN_CAP);
  });

  test("tokens issued more than 10 minutes ago and used ones do not count", async () => {
    resend();
    const old = new Date(NOW.getTime() - 11 * MIN); // still alive for 4 more minutes, but not "within the last 10 minutes"
    for (let i = 0; i < LOGIN_TOKEN_CAP; i++) expect(await issueLoginToken(db, "dim@example.test", old)).not.toBeNull();
    const first = await handleLoginRequest(setup().deps, { email: "dim@example.test" });
    expect(first.status === 200 && "devLink" in first.body).toBe(true);
    // used: sign in with each of two fresh links, then two more can be requested
    for (let i = 0; i < 2; i++) {
      const r = await handleLoginRequest(setup().deps, { email: "dim@example.test" });
      if (!(r.status === 200 && r.body.ok && r.body.devLink)) throw new Error("expected a link");
      expect(await consumeLoginToken(db, tokenOf(r.body.devLink), NOW)).toBe("dim@example.test");
    }
    expect(await handleLoginRequest(setup().deps, { email: "dim@example.test" })).toMatchObject({ body: { devLink: expect.any(String) } });
  });
});

describe("devLink", () => {
  test("is returned outside production (tests and local development) and works as a login link", async () => {
    resend();
    const { deps } = setup();
    const res = await handleLoginRequest(deps, { email: "dim@example.test" });
    if (!(res.status === 200 && res.body.ok)) throw new Error("expected ok");
    expect(res.body.devLink).toBe(verifyUrl("https://mslab.example", tokenOf(res.body.devLink!)));
    expect(await consumeLoginToken(db, tokenOf(res.body.devLink!), NOW)).toBe("dim@example.test");
  });

  test("is never returned in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    resend();
    const { deps } = setup();
    const res = await handleLoginRequest(deps, { email: "dim@example.test" });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(JSON.stringify(res)).not.toMatch(/devLink|verify|http/);
    expect(await tokens()).toHaveLength(1); // the token itself is stored and e-mailed
  });

  test("is returned only for a local Host: not for a preview or staging address even in a non-production build", async () => {
    resend();
    for (const host of ["localhost:3000", "127.0.0.1:3001", "localhost"]) {
      const res = await handleLoginRequest(setup({ host }).deps, { email: "dim@example.test" });
      expect(res.status === 200 && "devLink" in res.body, host).toBe(true);
      await db.delete(authTokens);
    }
    for (const host of ["mslab-web.dim-novare.workers.dev", "mslab.example", "localhost.evil.example", "evil.example:3000", "", null]) {
      const res = await handleLoginRequest(setup({ host }).deps, { email: "dim@example.test" });
      expect(res, String(host)).toEqual({ status: 200, body: { ok: true } });
      await db.delete(authTokens);
    }
  });

  test("production + a local Host: still never", async () => {
    vi.stubEnv("NODE_ENV", "production");
    resend();
    expect(await handleLoginRequest(setup({ host: "localhost:3000" }).deps, { email: "dim@example.test" })).toEqual({ status: 200, body: { ok: true } });
  });

  test("is not returned for an address outside the allow-list either", async () => {
    resend();
    const { deps } = setup();
    expect(await handleLoginRequest(deps, { email: "someone@gmail.com" })).toEqual({ status: 200, body: { ok: true } });
  });
});

describe("validation", () => {
  test.each([[{}], [{ email: "" }], [{ email: "no-at-sign" }], [{ email: 42 }], [{ email: "a".repeat(200) + "@example.com" }], [null], ["dim@example.test"], [[]]])(
    "%j is refused with 400 and nothing stored",
    async (input) => {
      const { deps, kv } = setup();
      expect(await handleLoginRequest(deps, input)).toEqual({ status: 400, body: { ok: false, error: "email" } });
      expect(await tokens()).toHaveLength(0);
      expect(kv.store.size).toBe(0); // an invalid request does not use up the rate limit
    },
  );
});

describe("rate limit", () => {
  test("5 requests per 10 minutes per IP, then 429; another IP is not affected", async () => {
    resend();
    const { deps, kv } = setup({ ip: "198.51.100.7" });
    for (let i = 0; i < RATE_LIMIT; i++) expect((await handleLoginRequest(deps, { email: "dim@example.test" })).status).toBe(200);
    expect(await handleLoginRequest(deps, { email: "dim@example.test" })).toEqual({ status: 429, body: { ok: false, error: "rate" } });
    expect(await tokens()).toHaveLength(LOGIN_TOKEN_CAP); // 5 accepted requests, but one address gets 3 links; the refused 6th created none
    expect(kv.ttl.get("rl:login:198.51.100.7")).toBe(600);
    const other = setup({ kv, ip: "198.51.100.8" });
    expect((await handleLoginRequest(other.deps, { email: "dim@example.test" })).status).toBe(200);
  });

  test("a request without an address is not rate limited", async () => {
    resend();
    const { deps, kv } = setup({ ip: null });
    for (let i = 0; i < RATE_LIMIT + 2; i++) expect((await handleLoginRequest(deps, { email: "someone@gmail.com" })).status).toBe(200);
    expect(kv.store.size).toBe(0);
  });

  test("when KV is unavailable the admins can still sign in", async () => {
    resend();
    const kv = { ...fakeKv(), get: () => Promise.reject(new Error("KV down")), put: () => Promise.reject(new Error("KV down")) };
    const { deps } = setup({ kv });
    expect((await handleLoginRequest(deps, { email: "dim@example.test" })).status).toBe(200);
    expect(await tokens()).toHaveLength(1);
  });
});
