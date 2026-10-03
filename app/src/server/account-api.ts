import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { clients } from "@/db/schema";
import { isEmail, isSampleAddress, normalizeEmail } from "@/domain/email";
import type { Locale } from "@/i18n/locales";
import { deletionMail, loginMail, verifyLink } from "./account-mail";
import { LIMITS, parseChangeRequest, parseDeletion, parseFavourite, parseMerge, parseNewsletter, parseProfile, parseSlug, parseTerms } from "./account-input";
import { isCrossSite } from "./auth";
import {
  CLIENT_COOKIE, CLIENT_SESSION_TTL_MS, HINT_COOKIE, endClientSession, getClientSession, issueClientLogin, redeemClientCode,
  redeemClientLink, reserveLoginMail,
} from "./client-auth";
import {
  acceptTerms, createChangeRequest, deleteClient, loadDashboard, loadEcourse, mergeFavourites, setFavourite, setNewsletter, updateProfile,
} from "./client-data";
import { logFailure, logNote } from "./log";
import { changeRequestSummary } from "./messages";
import { adminUrl, notifyMaria, sendMail, type Env } from "./notify";
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
//
// Behind a session (the data endpoints, at the bottom): GET / the dashboard, GET /kursus/:slug an e-course, POST /lemmikud and
// /lemmikud/merge favourites, PATCH /andmed the profile, POST /uudiskiri the newsletter, POST /muutmine a request to cancel or
// move a registration (Maria is told after the response), POST /tingimused the e-course terms, POST /kustuta account deletion.
// Each one starts with requireClient and answers through clientResponse (a renewed session's cookies reach the browser); the
// client is always the session's, never a value from the request. A body that is not what the endpoint expects is 400
// { ok: false, error: "<field>" } (account-input.ts), a record that is not the client's is 404.

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
/** A favourites merge carries up to 100 slugs of up to 200 characters each. */
const MERGE_BODY_CHARS = LIMITS.mergeSlugs * (LIMITS.slug + 4) + 64;
/** Change requests a client may send per hour: each one e-mails Maria (and pings her on Telegram). */
const CHANGE_REQUESTS_PER_HOUR = 5;

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
    const sep = part.indexOf("=");
    if (sep > 0 && part.slice(0, sep).trim() === name) return part.slice(sep + 1).trim();
  }
  return undefined;
}

/** The JSON object in the request body; null for anything else (not JSON, an array, a number, longer than `max`). Never throws. */
async function readObject(request: Request, max = MAX_BODY_CHARS): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > max) return null;
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

/** The same fail-open limit for a signed-in client, counted per client (not per address): `limit` in `windowSec`. */
async function withinClientLimit(deps: AccountDeps, clientId: number, form: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    return await rateLimit(deps.env.KV, rateKey(form, String(clientId)), limit, windowSec);
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

/** A signed-in request: the client, and the cookies the answer must carry (none, or the session's two cookies when it was just renewed). */
export type ClientSession = { clientId: number; cookies: string[] };

/**
 * The client of this request's session cookie, or the 401 answer to return (`reason`: no cookie or an unknown session,
 * or why the session ended: another device signed in, logout, 180 days unused). Every endpoint behind a session starts with
 * this and answers with `clientResponse(session, body)`: the session is renewed in the database at most once a day, and
 * then the cookies are sent again with a fresh Max-Age, or the browser would drop them 180 days after the login.
 */
export async function requireClient(request: Request, deps: AccountDeps): Promise<ClientSession | Response> {
  const raw = cookieValue(request.headers.get("cookie"), CLIENT_COOKIE);
  const session = await getClientSession(deps.db, raw, deps.now);
  if (!session) return unauthorized("none");
  if (session.ended) return unauthorized(session.ended);
  return { clientId: session.clientId, cookies: session.renewed && raw ? sessionCookies(raw) : [] };
}

/** The answer for a signed-in client: `body` plus the cookies of a renewed session (see requireClient). */
export const clientResponse = (session: ClientSession, body: unknown, status = 200): Response => accountResponse(body, status, session.cookies);

/** GET /me: `{ ok: true, email, name }` of the signed-in client. */
async function me(request: Request, deps: AccountDeps): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const [client] = await deps.db.select({ email: clients.email, name: clients.name }).from(clients).where(eq(clients.id, session.clientId)).limit(1);
  return client ? clientResponse(session, { ok: true, email: client.email, name: client.name }) : unauthorized("none");
}

/** 400 for a body the endpoint cannot use, answered like every other signed-in answer. */
const badInput = (session: ClientSession, field: string): Response => clientResponse(session, { ok: false, error: field }, 400);

/** GET /: the client's dashboard (`Dashboard` in client-data.ts): profile, the cards, favourites, the prepayment instructions. */
async function dashboard(request: Request, deps: AccountDeps): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const data = await loadDashboard(deps.db, session.clientId, deps.now);
  return data ? clientResponse(session, data) : unauthorized("none"); // the client was deleted since the session was checked
}

/** GET /kursus/:slug: the e-course page's data (`EcourseView`), or 404 without active access (or for a slug that cannot be one). */
async function ecourse(request: Request, deps: AccountDeps, rawSlug: string): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const slug = parseSlug(rawSlug);
  const view = slug === null ? null : await loadEcourse(deps.db, session.clientId, slug, deps.now);
  return view ? clientResponse(session, view) : clientResponse(session, { ok: false }, 404);
}

/** POST /lemmikud `{ slug, on }`: hearts or un-hearts a published course. 200 `{ ok, favourites }`; 404 `{ error: "slug" }` for a course that is not published. */
async function favourite(request: Request, deps: AccountDeps): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const input = parseFavourite(await readObject(request));
  if (!input.ok) return badInput(session, input.error);
  const favourites = await setFavourite(deps.db, session.clientId, input.data.slug, input.data.on);
  return favourites ? clientResponse(session, { ok: true, favourites }) : clientResponse(session, { ok: false, error: "slug" }, 404);
}

/** POST /lemmikud/merge `{ slugs }` (at most 100): the browser's favourites join the account's; unknown slugs are ignored. 200 `{ ok, favourites }`. */
async function mergeFavouriteList(request: Request, deps: AccountDeps): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const input = parseMerge(await readObject(request, MERGE_BODY_CHARS));
  if (!input.ok) return badInput(session, input.error);
  return clientResponse(session, { ok: true, favourites: await mergeFavourites(deps.db, session.clientId, input.data.slugs) });
}

/** PATCH /andmed `{ name, phone, locale }`. 200 `{ ok: true }`. */
async function profile(request: Request, deps: AccountDeps): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const input = parseProfile(await readObject(request));
  if (!input.ok) return badInput(session, input.error);
  return (await updateProfile(deps.db, session.clientId, input.data)) ? clientResponse(session, { ok: true }) : unauthorized("none");
}

/** POST /uudiskiri `{ on }`: the account's address subscribes (confirmed: the login proved it) or unsubscribes. 200 `{ ok: true }`. */
async function newsletter(request: Request, deps: AccountDeps): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const input = parseNewsletter(await readObject(request));
  if (!input.ok) return badInput(session, input.error);
  return (await setNewsletter(deps.db, session.clientId, input.data.on, deps.now)) ? clientResponse(session, { ok: true }) : unauthorized("none");
}

/**
 * POST /muutmine `{ registrationId, kind, message }`: a request to cancel (`cancel`) or move (`change`) one of the client's own
 * registrations. It changes nothing itself: it is stored for the admin's inbox and Maria is told after the response. 404
 * `{ error: "registration" }` for a registration that is not the client's (or is cancelled, past or called off), 429 `{ error: "rate" }` after 5 in an hour.
 */
async function changeRequest(request: Request, deps: AccountDeps): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const input = parseChangeRequest(await readObject(request));
  if (!input.ok) return badInput(session, input.error);
  if (!(await withinClientLimit(deps, session.clientId, "client-change", CHANGE_REQUESTS_PER_HOUR, 60 * 60))) {
    console.info("[account] change request rate limited");
    return clientResponse(session, { ok: false, error: "rate" }, 429);
  }
  const { registrationId, kind, message } = input.data;
  const info = await createChangeRequest(deps.db, session.clientId, registrationId, kind, message, deps.now);
  if (!info) return clientResponse(session, { ok: false, error: "registration" }, 404);
  const summary = changeRequestSummary({ ...info, kind, message }, adminUrl(deps.siteUrl));
  deps.later(() => notifyMaria(deps.env, summary.subject, summary.text, { short: summary.short, replyTo: info.email, siteUrl: deps.siteUrl }));
  return clientResponse(session, { ok: true });
}

/**
 * POST /tingimused `{ slug, version }`: the client accepts the e-course terms, the version the page showed (`terms.version` of the e-course view).
 * 404 `{ error: "slug" }` without active access to that course; 409 `{ error: "version" }` when the terms have changed since the page was loaded
 * (nothing is stored: the page loads the course again and shows the new text).
 */
async function terms(request: Request, deps: AccountDeps): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const input = parseTerms(await readObject(request));
  if (!input.ok) return badInput(session, input.error);
  const result = await acceptTerms(deps.db, session.clientId, input.data.slug, input.data.version, deps.now);
  if (result === "accepted") return clientResponse(session, { ok: true });
  return result === "stale" ? clientResponse(session, { ok: false, error: "version" }, 409) : clientResponse(session, { ok: false, error: "slug" }, 404);
}

/**
 * POST /kustuta `{ confirm: true }`: deletes the account (client-data.ts deleteClient: registrations stay with Maria) and answers with
 * both cookies cleared, the one answer that does not go through clientResponse. The confirmation e-mail goes out after the
 * response, never to a sample address (`@example.test`) and never in development.
 */
async function deleteAccount(request: Request, deps: AccountDeps): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const input = parseDeletion(await readObject(request));
  if (!input.ok) return badInput(session, input.error);
  const gone = await deleteClient(deps.db, session.clientId);
  if (gone && !deps.dev && !isSampleAddress(gone.email)) {
    const mail = deletionMail(gone.email, gone.locale);
    deps.later(() => sendMail(deps.env, mail));
  }
  return accountResponse({ ok: true }, 200, clearedCookies());
}

/** The path of one e-course: /kursus/<slug>. */
const COURSE_PATH = /^\/kursus\/([^/]+)$/;

/** The endpoints behind a session; any other method and path is unknown (404, with or without a session). */
async function dataRoute(request: Request, path: string, deps: AccountDeps): Promise<Response> {
  switch (`${request.method} ${path}`) {
    case "GET /": return dashboard(request, deps);
    case "POST /lemmikud": return favourite(request, deps);
    case "POST /lemmikud/merge": return mergeFavouriteList(request, deps);
    case "PATCH /andmed": return profile(request, deps);
    case "POST /uudiskiri": return newsletter(request, deps);
    case "POST /muutmine": return changeRequest(request, deps);
    case "POST /tingimused": return terms(request, deps);
    case "POST /kustuta": return deleteAccount(request, deps);
  }
  const course = request.method === "GET" ? COURSE_PATH.exec(path) : null;
  return course ? ecourse(request, deps, course[1]) : accountResponse({ ok: false }, 404);
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
      default: return await dataRoute(request, path, deps);
    }
  } catch (e) {
    logFailure("[account] request failed", e);
    return accountResponse({ ok: false, error: "server" }, 500);
  }
}
