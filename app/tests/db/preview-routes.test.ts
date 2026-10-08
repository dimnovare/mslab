import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { PREVIEW_COOKIE, PREVIEW_TTL_S, verifyPreview } from "@/lib/preview-cookie";
import { createLoginToken, createSession, SESSION_COOKIE } from "@/server/auth";
import { makeTestDb } from "./helpers";

// The admins' preview cookie of the coming-soon gate (lib/preview-cookie.ts): set next to the session at sign-in
// (/api/auth/verify), set again by "Vaata kodulehte" (GET /api/admin/preview, a signed-in admin only), cleared at logout.
// The routes run with the database (PGlite), the request cookie and the environment faked.

const state = vi.hoisted(() => ({ db: null as unknown, cookie: undefined as string | undefined, preview: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = name === "__Host-mslab_admin" ? state.cookie : name === "mslab_preview" ? state.preview : undefined;
      return value === undefined ? undefined : { name, value };
    },
  }),
}));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));

import { GET as preview } from "@/app/api/admin/preview/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as verify } from "@/app/api/auth/verify/route";

const SECRET = "preview-secret-for-tests-0123456789abcdef";
const ORIGIN = "https://mslab.example";

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});
beforeEach(() => {
  state.db = db;
  state.cookie = undefined;
  state.preview = undefined;
  vi.stubEnv("ADMIN_EMAILS", "admin@example.test,second.admin@example.com");
  vi.stubEnv("PREVIEW_SECRET", SECRET);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The Set-Cookie lines of an answer, by cookie name: the value and the attributes as the browser reads them. */
function setCookies(res: Response): Record<string, { value: string; attrs: string[] }> {
  const out: Record<string, { value: string; attrs: string[] }> = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(";").map((s) => s.trim());
    const at = pair.indexOf("=");
    out[pair.slice(0, at)] = { value: decodeURIComponent(pair.slice(at + 1)), attrs: attrs.map((a) => a.toLowerCase()) };
  }
  return out;
}

/** HttpOnly, Secure, SameSite=Lax, Path=/ and the given Max-Age. */
function expectAttributes(attrs: string[], maxAge: number): void {
  expect(attrs).toEqual(expect.arrayContaining(["httponly", "secure", "samesite=lax", "path=/", `max-age=${maxAge}`]));
  expect(attrs.some((a) => a.startsWith("domain="))).toBe(false);
}

const where = (res: Response) => {
  const location = res.headers.get("location");
  return location ? new URL(location, ORIGIN).pathname + new URL(location, ORIGIN).search : null;
};

describe("GET /api/auth/verify (the login link)", () => {
  test("a good link: the session cookie and the preview cookie, both for 30 days", async () => {
    const token = await createLoginToken(db, "admin@example.test");
    const res = await verify(new Request(`${ORIGIN}/api/auth/verify?t=${token}`));
    expect(res.status).toBe(303);
    expect(where(res)).toBe("/admin");
    const cookies = setCookies(res);
    expect(Object.keys(cookies).sort()).toEqual([SESSION_COOKIE, PREVIEW_COOKIE].sort());
    expectAttributes(cookies[PREVIEW_COOKIE].attrs, PREVIEW_TTL_S);
    expect(PREVIEW_TTL_S).toBe(30 * 24 * 60 * 60);
    expect(await verifyPreview(cookies[PREVIEW_COOKIE].value, SECRET)).toBe(true);
    // it expires with the session, give or take the seconds of the test
    const exp = Number(cookies[PREVIEW_COOKIE].value.split(".")[0]);
    expect(Math.abs(exp - (Date.now() / 1000 + PREVIEW_TTL_S))).toBeLessThan(60);
  });

  test("a used, unknown or no longer allowed link: no cookie at all", async () => {
    const token = await createLoginToken(db, "admin@example.test");
    await verify(new Request(`${ORIGIN}/api/auth/verify?t=${token}`));
    const again = await verify(new Request(`${ORIGIN}/api/auth/verify?t=${token}`));
    expect(where(again)).toBe("/admin/login?viga=link");
    expect(again.headers.getSetCookie()).toEqual([]);
    expect((await verify(new Request(`${ORIGIN}/api/auth/verify?t=${"A".repeat(43)}`))).headers.getSetCookie()).toEqual([]);
    const former = await createLoginToken(db, "former.admin@example.com");
    expect((await verify(new Request(`${ORIGIN}/api/auth/verify?t=${former}`))).headers.getSetCookie()).toEqual([]);
  });

  test("a prefetch of the link touches nothing and sets nothing", async () => {
    const token = await createLoginToken(db, "admin@example.test");
    const res = await verify(new Request(`${ORIGIN}/api/auth/verify?t=${token}`, { headers: { "sec-purpose": "prefetch" } }));
    expect(where(res)).toBe("/admin/login");
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  test("without PREVIEW_SECRET the sign-in still works: the session cookie only", async () => {
    vi.stubEnv("PREVIEW_SECRET", "");
    const token = await createLoginToken(db, "admin@example.test");
    const res = await verify(new Request(`${ORIGIN}/api/auth/verify?t=${token}`));
    expect(where(res)).toBe("/admin");
    expect(Object.keys(setCookies(res))).toEqual([SESSION_COOKIE]);
  });
});

describe("GET /api/admin/preview ('Vaata kodulehte')", () => {
  const call = (headers: Record<string, string> = {}) => preview(new Request(`${ORIGIN}/api/admin/preview`, { headers }), {});

  test("without a session: refused like every admin API (401 JSON, no-store), no cookie", async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  test("an unknown session, or one whose address left the allow-list: 401 too", async () => {
    state.cookie = "A".repeat(43);
    expect((await call()).status).toBe(401);
    state.cookie = await createSession(db, "former.admin@example.com");
    const res = await call();
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  test("a signed-in admin: 303 to the home page with the preview cookie (30 days), never kept", async () => {
    state.cookie = await createSession(db, "second.admin@example.com");
    const res = await call();
    expect(res.status).toBe(303);
    expect(where(res)).toBe("/");
    expect(new URL(res.headers.get("location")!, "https://elsewhere.example").origin).toBe(ORIGIN); // the request's own site
    expect(res.headers.get("cache-control")).toBe("no-store");
    const cookies = setCookies(res);
    expect(Object.keys(cookies)).toEqual([PREVIEW_COOKIE]);
    expectAttributes(cookies[PREVIEW_COOKIE].attrs, PREVIEW_TTL_S);
    expect(await verifyPreview(cookies[PREVIEW_COOKIE].value, SECRET)).toBe(true);
  });

  test("a link from another site (a top-level GET with the Lax session cookie) only gives the admin the pass: no Origin check on GET", async () => {
    state.cookie = await createSession(db, "admin@example.test");
    const res = await call({ origin: "https://evil.example", referer: "https://evil.example/" });
    expect(res.status).toBe(303);
    expect(where(res)).toBe("/");
  });

  test("without PREVIEW_SECRET: still 303 to the home page (with the gate off it shows the site), no cookie", async () => {
    vi.stubEnv("PREVIEW_SECRET", "   ");
    state.cookie = await createSession(db, "admin@example.test");
    const res = await call();
    expect(res.status).toBe(303);
    expect(where(res)).toBe("/");
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  test("with the gate on and no PREVIEW_SECRET it is noted (no value in the note)", async () => {
    vi.stubEnv("SITE_GATE", "1");
    vi.stubEnv("PREVIEW_SECRET", "");
    state.cookie = await createSession(db, "admin@example.test");
    await call();
    expect(vi.mocked(console.error).mock.calls.flat().join("\n")).toContain("PREVIEW_SECRET");
  });
});

describe("POST /api/auth/logout", () => {
  const call = (headers: Record<string, string> = {}) => logout(new Request(`${ORIGIN}/api/auth/logout`, { method: "POST", headers }));

  test("signed in: the session ends, and the session cookie and the preview cookie are both cleared", async () => {
    state.cookie = await createSession(db, "admin@example.test");
    state.preview = "1.x";
    const res = await call({ origin: ORIGIN });
    expect(res.status).toBe(303);
    expect(where(res)).toBe("/admin/login");
    const cookies = setCookies(res);
    expect(cookies[SESSION_COOKIE]).toMatchObject({ value: "" });
    expect(cookies[PREVIEW_COOKIE]).toMatchObject({ value: "" });
    expectAttributes(cookies[PREVIEW_COOKIE].attrs, 0);
  });

  test("only the preview cookie (the session cookie expired or cleared): the preview cookie is cleared all the same", async () => {
    state.preview = "";
    const res = await call();
    expect(res.status).toBe(303);
    const cookies = setCookies(res);
    expect(cookies[PREVIEW_COOKIE]).toMatchObject({ value: "" });
    expectAttributes(cookies[PREVIEW_COOKIE].attrs, 0);
    expect(cookies[SESSION_COOKIE]).toBeUndefined();
  });

  test("no cookie sent: nothing to clear, no Set-Cookie at all; a session without the preview cookie clears the session only", async () => {
    const res = await call();
    expect(res.status).toBe(303);
    expect(res.headers.getSetCookie()).toEqual([]);
    state.cookie = await createSession(db, "admin@example.test");
    expect(Object.keys(setCookies(await call()))).toEqual([SESSION_COOKIE]);
  });

  test("from another site: 403, nothing cleared", async () => {
    state.cookie = await createSession(db, "admin@example.test");
    state.preview = "1.x";
    const res = await call({ origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});
