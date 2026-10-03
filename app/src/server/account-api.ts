import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { clients } from "@/db/schema";
import { isEmail, isSampleAddress, normalizeEmail } from "@/domain/email";
import type { Locale } from "@/i18n/locales";
import { loginMail, verifyLink } from "./account-mail";
import { isCrossSite } from "./auth";
import {
  CLIENT_COOKIE, CLIENT_SESSION_TTL_MS, HINT_COOKIE, endClientSession, getClientSession, issueClientLogin, redeemClientCode,
  redeemClientLink, reserveLoginMail,
} from "./client-auth";
import { logFailure, logNote } from "./log";
import { sendMail, type Env } from "./notify";
import { isPrefetch } from "./prefetch";
import { clientIp, rateKey, rateLimit } from "./ratelimit";

// The client account's JSON API (/api/konto/*) without Next.js: app/api/konto/[[...path]]/route.ts builds the dependencies
// (database, settings, Postgres KV store, after()) and calls handleAccountApi; the tests call it with PGlite and fakes.
//
// Sign-in: POST login ({ email, locale }) e-mails a 6-digit code and a link (e-mail goes out after the response); POST code
// ({ email, code }) or GET verify (?t=<link token>) uses the login once and starts the session (the one-device rule is in
// client-auth.ts). The session is the `__Host-mslab_client` cookie (HttpOnly) plus `mslab_in=1`, a hint the static pages
// read to show "Minu konto" instead of "Logi sisse" (it grants nothing). The login answer is the same for every address.
// Every answer is `private, no-store`: it is one visitor's data, never kept by a CDN or a shared cache.

export type AccountDeps = {
  db: Db;
  /** The settings plus `KV`, the rate-limit store (Postgres `kv_entries`). */
  env: Env;
  now: Date;
  /** Base of the links in e-mails: the request's Host when it is one of ours (site.ts linkBase), else SITE_URL. */
  siteUrl: string;
  /** Runs work after the response has been sent: next/server after() in production, collected and awaited in tests. */
  later: (task: () => Promise<unknown>) => void;
  /** A local development request (non-production build and a local Host): the login code and link come back in the answer and nothing is mailed. */
  dev: boolean;
};

const SESSION_MAX_AGE = CLIENT_SESSION_TTL_MS / 1000;
const RATE_WINDOW_SEC = 10 * 60;
const LOGIN_RATE_LIMIT = 10;
const CODE_RATE_LIMIT = 20;
/** Request bodies here are a few dozen bytes; anything bigger is refused unread by the parser. */
const MAX_BODY_CHARS = 4096;

const BASE_HEADERS = { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } as const;

/** A JSON answer (`private, no-store`, not for search engines) with the given Set-Cookie lines. */
export function accountResponse(body: unknown, status = 200, cookies: string[] = []): Response {
  const res = Response.json(body, { status, headers: BASE_HEADERS });
  for (const cookie of cookies) res.headers.append("set-cookie", cookie);
  return res;
}

const SESSION_COOKIE_LINE = (raw: string) => `${CLIENT_COOKIE}=${raw}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
const HINT_COOKIE_LINE = `${HINT_COOKIE}=1; Path=/; Max-Age=${SESSION_MAX_AGE}; Secure; SameSite=Lax`;
const CLEARED_SESSION_COOKIE = `${CLIENT_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
const CLEARED_HINT_COOKIE = `${HINT_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;

/** The two cookies of a started session: the session id (HttpOnly) and the readable `mslab_in` hint. */
export const sessionCookies = (raw: string): string[] => [SESSION_COOKIE_LINE(raw), HINT_COOKIE_LINE];

/** Both cookies cleared (logout, account deletion). */
export const clearedCookies = (): string[] => [CLEARED_SESSION_COOKIE, CLEARED_HINT_COOKIE];

/** The value of cookie `name` in a Cookie header, or undefined. */
function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** The JSON object in the request body; null for anything else (not JSON, an array, a number, too long). Never throws. */
async function readObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return null;
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * A rate limit that fails open: when the store is unavailable (or over its write quota) students can still sign in. No
 * address (never on Vercel, whose edge sets x-forwarded-for) is not limited either: one shared bucket would lock everybody out.
 * `next dev` without the header uses one local bucket. The daily e-mail cap in login() never fails open.
 */
async function withinRateLimit(request: Request, deps: AccountDeps, form: string, limit: number): Promise<boolean> {
  const ip = clientIp(request.headers) ?? (deps.dev ? "local" : null);
  if (ip === null) return true;
  try {
    return await rateLimit(deps.env.KV, rateKey(form, ip), limit, RATE_WINDOW_SEC);
  } catch (e) {
    logFailure("[account] rate limit unavailable, allowing", e);
    return true;
  }
}

/** The language of the login e-mail: the client's own when the address has an account, else the page the visitor asked from. */
async function mailLocale(db: Db, address: string, pageLocale: unknown): Promise<Locale> {
  const [client] = await db.select({ locale: clients.locale }).from(clients).where(eq(clients.email, address)).limit(1);
  return client?.locale ?? (pageLocale === "ru" ? "ru" : "et");
}

/**
 * POST /login `{ email, locale }`: a login (code + link) for the address, e-mailed after the response. The answer is
 * `{ ok: true }` for every well-formed address: unknown, over the per-address cap (3 live logins) or over the daily e-mail
 * cap look the same. 400 `{ error: "email" }`, 429 `{ error: "rate" }` (10 per 10 minutes per IP). In development the
 * answer carries `devCode` and `devLink` (and nothing is mailed); a sample address (`@example.test`) outside development
 * gets the login row but no mail and no count against the daily cap.
 */
async function login(request: Request, deps: AccountDeps): Promise<Response> {
  const body = await readObject(request);
  const address = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!isEmail(address)) return accountResponse({ ok: false, error: "email" }, 400);
  if (!(await withinRateLimit(request, deps, "client-login", LOGIN_RATE_LIMIT))) {
    console.info("[account] login request rate limited");
    return accountResponse({ ok: false, error: "rate" }, 429);
  }

  const issued = await issueClientLogin(deps.db, address, deps.now);
  if (issued && !deps.dev && !isSampleAddress(address)) {
    // The language is read before the daily counter is raised, so a database failure in between cannot count a mail that is never queued.
    const mail = loginMail(deps.siteUrl, address, issued.token, issued.code, await mailLocale(deps.db, address, body?.locale));
    if (await reserveLoginMail(deps.db, deps.now)) {
      deps.later(() => sendMail(deps.env, mail));
    } else {
      logNote("[account] daily login mail cap reached");
    }
  }
  // Tests and local development have no mailbox: the code and link come back in the answer (and are never e-mailed as well).
  return accountResponse(issued && deps.dev ? { ok: true, devCode: issued.code, devLink: verifyLink(deps.siteUrl, issued.token) } : { ok: true });
}

/**
 * POST /code `{ email, code }`: the 6 digits from the e-mail. Starts the session (200 `{ ok: true, locale }` + cookies).
 * 400 `{ error: "code" }` for a wrong or malformed code (5 wrong tries end the login), 400 `{ error: "expired" }` when the
 * address has no live login, 429 `{ error: "rate" }` (20 per 10 minutes per IP).
 */
async function code(request: Request, deps: AccountDeps): Promise<Response> {
  const body = await readObject(request);
  const address = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  // A code typed or pasted as "123 456" is the same code.
  const digits = typeof body?.code === "string" && body.code.length <= 32 ? body.code.replace(/\s+/g, "") : "";
  if (!isEmail(address) || !/^\d{6}$/.test(digits)) return accountResponse({ ok: false, error: "code" }, 400);
  if (!(await withinRateLimit(request, deps, "client-code", CODE_RATE_LIMIT))) {
    console.info("[account] code request rate limited");
    return accountResponse({ ok: false, error: "rate" }, 429);
  }

  const result = await redeemClientCode(deps.db, address, digits, deps.now);
  if (result === "wrong") return accountResponse({ ok: false, error: "code" }, 400);
  if (result === null) return accountResponse({ ok: false, error: "expired" }, 400);
  return accountResponse({ ok: true, locale: result.locale }, 200, sessionCookies(result.sessionRaw));
}

/** A redirect (303) that carries no body: `target` is made absolute against this request's origin. */
function redirect(url: URL, target: string, cookies: string[] = []): Response {
  const res = new Response(null, {
    status: 303,
    headers: { ...BASE_HEADERS, location: new URL(target, url.origin).toString(), "referrer-policy": "no-referrer" }, // the token is in this URL
  });
  for (const cookie of cookies) res.headers.append("set-cookie", cookie);
  return res;
}

/**
 * GET /verify?t=<token>: the link in the login e-mail. Uses the login once, starts the session and goes to the client's
 * own page (/konto, /ru/konto). A token that is unknown, used, expired or dead goes to /konto/sisene?viga=link; a database
 * failure to ?viga=server (the link is still usable then, as for the admin). A prefetch or prerender goes to
 * /konto/sisene without touching the token.
 */
async function verify(request: Request, url: URL, deps: AccountDeps): Promise<Response> {
  if (isPrefetch(request.headers)) return redirect(url, "/konto/sisene");
  try {
    const session = await redeemClientLink(deps.db, url.searchParams.get("t") ?? "", deps.now);
    if (!session) return redirect(url, "/konto/sisene?viga=link");
    return redirect(url, session.locale === "ru" ? "/ru/konto" : "/konto", sessionCookies(session.sessionRaw));
  } catch (e) {
    logFailure("[account] verify failed", e); // never the message: it holds the token hash and the e-mail
    return redirect(url, "/konto/sisene?viga=server");
  }
}

/** POST /logout: ends the session this cookie holds (no matter which, or none) and clears both cookies. */
async function logout(request: Request, deps: AccountDeps): Promise<Response> {
  await endClientSession(deps.db, cookieValue(request.headers.get("cookie"), CLIENT_COOKIE), deps.now);
  return accountResponse({ ok: true }, 200, clearedCookies());
}

export type SessionEnd = "none" | "replaced" | "logout" | "expired";

/** 401 `{ reason }` for a request without a live session; clears the hint cookie so the pages stop showing "Minu konto". */
export const unauthorized = (reason: SessionEnd): Response => accountResponse({ ok: false, reason }, 401, [CLEARED_HINT_COOKIE]);

/**
 * The client of this request's session cookie, or the 401 answer to return (`reason`: no cookie or an unknown session,
 * or why the session ended: another device signed in, logout, 180 days unused). The data endpoints start with this.
 */
export async function requireClient(request: Request, deps: AccountDeps): Promise<{ clientId: number } | Response> {
  const session = await getClientSession(deps.db, cookieValue(request.headers.get("cookie"), CLIENT_COOKIE), deps.now);
  if (!session) return unauthorized("none");
  if (session.ended) return unauthorized(session.ended);
  return { clientId: session.clientId };
}

/** GET /me: `{ ok: true, email, name }` of the signed-in client. */
async function me(request: Request, deps: AccountDeps): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const [client] = await deps.db.select({ email: clients.email, name: clients.name }).from(clients).where(eq(clients.id, session.clientId)).limit(1);
  return client ? accountResponse({ ok: true, email: client.email, name: client.name }) : unauthorized("none");
}

/** The data endpoints (dashboard, favourites, profile, …) come with Task 4; until then every other path is unknown. */
function dataRoute(): Response {
  return accountResponse({ ok: false }, 404);
}

/** The router: `null` when the path is not `/api/konto/…`. Every failure is a JSON answer; nothing it throws reaches the framework. */
export async function handleAccountApi(request: Request, deps: AccountDeps): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/konto(\/.*)?$/);
  if (!m) return null;
  const path = m[1] ?? "/";
  // The cookie is SameSite=Lax already; this is the second layer (as withAdmin for the admin API).
  if (request.method !== "GET" && request.method !== "HEAD" && isCrossSite(request)) return accountResponse({ ok: false }, 403);
  try {
    switch (`${request.method} ${path}`) {
      case "POST /login": return await login(request, deps);
      case "POST /code": return await code(request, deps);
      case "GET /verify": return await verify(request, url, deps);
      case "POST /logout": return await logout(request, deps);
      case "GET /me": return await me(request, deps);
      default: return dataRoute();
    }
  } catch (e) {
    logFailure("[account] request failed", e);
    return accountResponse({ ok: false, error: "server" }, 500);
  }
}
