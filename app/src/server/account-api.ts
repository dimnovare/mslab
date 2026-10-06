import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { clients } from "@/db/schema";
import { isEmail, isSampleAddress, normalizeEmail } from "@/domain/email";
import type { Locale } from "@/i18n/locales";
import { LOGIN_MARK } from "@/lib/account-marks";
import { parseRowId } from "@/lib/row-id";
import { deletionMail, loginMail, verifyLink } from "./account-mail";
import {
  LIMITS, parseChangeRequest, parseDeletion, parseFavourite, parseMerge, parseNewsletter, parseProfile, parseProgress, parseSlug, parseTerms,
} from "./account-input";
import { isCrossSite } from "./auth";
import type { BunnyConfig } from "./bunny";
import {
  CLIENT_COOKIE, CLIENT_SESSION_TTL_MS, HINT_COOKIE, endClientSession, getClientSession, issueClientLogin, redeemClientCode,
  redeemClientLink, reserveLoginMail,
} from "./client-auth";
import {
  acceptTerms, createChangeRequest, deleteClient, loadDashboard, loadEcourse, loadFavouriteCards, mergeFavourites, setFavourite, setNewsletter, updateProfile,
} from "./client-data";
import { lessonFileFor, loadLesson, markTextLessonDone, saveProgress } from "./lesson-data";
import { attachmentHeader, FILE_URL_TTL_SEC } from "./lesson-files";
import { logFailure, logNote } from "./log";
import type { FileStore } from "./media";
import { changeRequestSummary } from "./messages";
import { adminUrl, notifyMaria, sendMail, type Env } from "./notify";
import { isPrefetch } from "./prefetch";
import { clientIp, rateKey, rateLimit, windowKey } from "./ratelimit";

// The client account's JSON API (/api/konto/*) without Next.js: app/api/konto/[[...path]]/route.ts builds the dependencies
// (database, settings, Postgres KV store, after()) and calls handleAccountApi; the tests call it with PGlite and fakes.
//
// Sign-in: POST login ({ email, locale }) e-mails a 6-digit code and a link (e-mail goes out after the response); POST code
// ({ email, code, locale }) or GET verify (?t=<link token>&l=<locale>) uses the login once and starts the session (the
// one-device rule is in client-auth.ts). The login page's language travels with the login (`locale`, the link's `l`): an
// account the login creates speaks it, and a failed link opens the login page in it. The session is the `__Host-mslab_client` cookie (HttpOnly) plus `mslab_in=1`, a hint the static pages
// read to show "Minu konto" instead of "Logi sisse" (it grants nothing). The login answer is the same for every address.
// Every answer is `private, no-store`: it is one visitor's data, never kept by a CDN or a shared cache.
//
// Behind a session (the data endpoints, at the bottom): GET / the dashboard, GET /kursus/:slug an e-course with its lessons and their states,
// GET /kursus/:slug/:lesson one lesson (an open one with a signed video URL; 403 terms or locked), POST …/:lesson/progress how far a video has
// been watched, POST …/:lesson/tehtud "Märgi tehtuks" for a text lesson, GET …/:lesson/fail/:file a lesson file, GET /lemmikud the
// favourites as course cards, POST /lemmikud and /lemmikud/merge favourites, PATCH /andmed the profile, POST /uudiskiri the newsletter, POST /muutmine a request to cancel or
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
  /** The store of the lesson files (media-store.ts mediaStore()); absent or null: no downloads (404). */
  files?: FileStore | null;
  /** Bunny Stream (bunny.ts bunnyConfig()); absent or null: a lesson's video is "soon" ("Video lisandub peagi"). */
  bunny?: BunnyConfig | null;
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
/** Progress reports a student may send per clock minute, across lessons (spec 6: it caps the writes; the player sends about 4). */
const PROGRESS_PER_MINUTE = 12;

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

/**
 * A fail-open limit for a signed-in client of `limit` per fixed window of `windowSec` (ratelimit.ts windowKey: the count starts again at
 * every window). withinClientLimit's window restarts with each accepted request, which for a steady sender (the player's report every
 * 15 s) means one that never ends; this is for those. Up to twice `limit` can pass across a window's edge.
 */
async function withinClientWindow(deps: AccountDeps, clientId: number, form: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    return await rateLimit(deps.env.KV, windowKey(rateKey(form, String(clientId)), deps.now, windowSec), limit, 2 * windowSec);
  } catch (e) {
    logFailure("[account] rate limit unavailable, allowing", e);
    return true;
  }
}

/** A page language sent by the browser (`locale` in a body, `l` in the login link): "et" or "ru", anything else is no language. */
const pageLocaleOf = (value: unknown): Locale | undefined => (value === "et" || value === "ru" ? value : undefined);

/** The language of the login e-mail: the client's own when the address has an account, else the page the visitor asked from. */
async function mailLocale(db: Db, address: string, pageLocale: unknown): Promise<Locale> {
  const [client] = await db.select({ locale: clients.locale }).from(clients).where(eq(clients.email, address)).limit(1);
  return client?.locale ?? (pageLocale === "ru" ? "ru" : "et");
}

/**
 * POST /login `{ email, locale }`: a login (code + link) for the address, e-mailed after the response. `locale` is the login
 * page's language: the e-mail's language when the address has no account yet, and the link's `l` (the page the link opens
 * on a failure, and the language of an account the link creates). The answer is
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

  const page = pageLocaleOf(body?.locale) ?? "et";
  const issued = await issueClientLogin(deps.db, address, deps.now);
  if (issued && !deps.dev && !isSampleAddress(address)) {
    // The language is read before the daily counter is raised, so a database failure in between cannot count a mail that is never queued.
    const mail = loginMail(deps.siteUrl, address, issued.token, issued.code, await mailLocale(deps.db, address, page), page);
    if (await reserveLoginMail(deps.db, deps.now)) {
      deps.later(() => sendMail(deps.env, mail));
    } else {
      logNote("[account] daily login mail cap reached");
    }
  }
  // Tests and local development have no mailbox: the code and link come back in the answer (and are never e-mailed as well).
  return accountResponse(issued && deps.dev ? { ok: true, devCode: issued.code, devLink: verifyLink(deps.siteUrl, issued.token, page) } : { ok: true });
}

/**
 * POST /code `{ email, code, locale? }`: the 6 digits from the e-mail. Starts the session (200 `{ ok: true, locale }` + cookies,
 * `locale` the client's own). `locale` ("et" / "ru", anything else ignored) is the login page's language, kept by an account
 * this login creates; an existing account keeps its own.
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

  const result = await redeemClientCode(deps.db, address, digits, deps.now, pageLocaleOf(body?.locale));
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
 * GET /verify?t=<token>&l=<et|ru>: the link in the login e-mail. Uses the login once, starts the session and goes to the
 * client's own page (/konto#sisse, /ru/konto#sisse, by the client's language: the fragment tells the browser to forget the copy of
 * the favourites a previous session left, lib/account-marks.ts LOGIN_MARK). `l` is the language of the page the login was asked from
 * (absent: Estonian; anything but "et" / "ru" is ignored): an account this link creates gets it, and the login page of that
 * language is where the link goes when it fails. A token that is unknown, used, expired or dead goes to
 * /konto/sisene#viga=link (/ru/konto/sisene#viga=link); a database failure to #viga=server (the link is still usable then,
 * as for the admin). A prefetch or prerender goes to the login page without touching the token.
 */
async function verify(request: Request, url: URL, deps: AccountDeps): Promise<Response> {
  const page = pageLocaleOf(url.searchParams.get("l"));
  const login = page === "ru" ? "/ru/konto/sisene" : "/konto/sisene";
  if (isPrefetch(request.headers)) return redirect(url, login);
  try {
    const session = await redeemClientLink(deps.db, url.searchParams.get("t") ?? "", deps.now, page);
    if (!session) return redirect(url, `${login}#viga=link`);
    return redirect(url, `${session.locale === "ru" ? "/ru/konto" : "/konto"}#${LOGIN_MARK}`, sessionCookies(session.sessionRaw));
  } catch (e) {
    logFailure("[account] verify failed", e); // never the message: it holds the token hash and the e-mail
    return redirect(url, `${login}#viga=server`);
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

/**
 * A lesson file for the signed-in client: a 302 to a 5-minute signed R2 address (R2 answers with the name and type the file was
 * stored with), or, from the local folder of `next dev` and the e2e run, the bytes themselves as a download. The cookies of a renewed
 * session go with it, as with clientResponse. null when the store does not have the object.
 */
async function fileAnswer(session: ClientSession, store: FileStore, file: { key: string; name: string; contentType: string }): Promise<Response | null> {
  const base = { ...BASE_HEADERS, "referrer-policy": "no-referrer" }; // the lesson's address is not passed on to R2
  let res: Response;
  if (store.signedGetUrl) {
    res = new Response(null, { status: 302, headers: { ...base, location: await store.signedGetUrl(file.key, { expiresSec: FILE_URL_TTL_SEC }) } });
  } else {
    const object = await store.get(file.key);
    if (!object) return null;
    res = new Response(object.body, { headers: { ...base, "content-type": file.contentType, "content-disposition": attachmentHeader(file.name), "x-content-type-options": "nosniff" } });
  }
  for (const cookie of session.cookies) res.headers.append("set-cookie", cookie);
  return res;
}

/** The slug and lesson id of a lesson path (the one parse step of the four lesson handlers); null when either cannot be one (404). */
const lessonRef = (rawSlug: string, rawLesson: string): { slug: string; lessonId: number } | null => {
  const slug = parseSlug(rawSlug);
  const lessonId = parseRowId(rawLesson);
  return slug === null || lessonId === null ? null : { slug, lessonId };
};

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

/**
 * GET /kursus/:slug/:lesson: one lesson (lesson-data.ts LessonView) — the embed URL of a ready video (signed for 4 hours, from the
 * saved second), the short text, the files, the next lesson, the e-mail for the watermark. 403 `{ error: "terms" }` while the course's
 * terms are not accepted (the page sends the student to the notice); 403 `{ error: "locked", next }` for a lesson not open yet
 * (`next`: where "Jätka" goes); 404 without active access, or for anything that is not a visible lesson of that course.
 */
async function lesson(request: Request, deps: AccountDeps, rawSlug: string, rawLesson: string): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const ref = lessonRef(rawSlug, rawLesson);
  const result = ref ? await loadLesson(deps.db, deps.bunny ?? null, session.clientId, ref.slug, ref.lessonId, deps.now) : null;
  if (result?.kind === "lesson") return clientResponse(session, result.view);
  if (result?.kind === "terms") return clientResponse(session, { ok: false, error: "terms" }, 403);
  if (result?.kind === "locked") return clientResponse(session, { ok: false, error: "locked", next: result.next }, 403);
  return clientResponse(session, { ok: false }, 404);
}

/**
 * POST /kursus/:slug/:lesson/progress `{ watchedSec }`: how far the student has watched (the player sends it about every 15 s and at
 * pause and end). Kept at its highest; at 90 % of the length the lesson is done. 200 `{ ok, done, next }`; 400 `{ error: "watchedSec" }`
 * (no number, or past the length + 5 s); 403 locked; 404; 409 `{ error: "video" }` (a text lesson, or a video lesson still waiting for its
 * video: it cannot be completed, so the next lesson stays locked); 429 `{ error: "rate" }` after
 * 12 in one clock minute (a fixed window, so the player's steady report every 15 s always fits).
 */
async function progress(request: Request, deps: AccountDeps, rawSlug: string, rawLesson: string): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const ref = lessonRef(rawSlug, rawLesson);
  if (ref === null) return clientResponse(session, { ok: false }, 404);
  const input = parseProgress(await readObject(request));
  if (!input.ok) return badInput(session, input.error);
  if (!(await withinClientWindow(deps, session.clientId, "client-progress", PROGRESS_PER_MINUTE, 60))) {
    logNote("[account] progress rate limited");
    return clientResponse(session, { ok: false, error: "rate" }, 429);
  }
  const result = await saveProgress(deps.db, session.clientId, ref.slug, ref.lessonId, input.data.watchedSec, deps.now);
  if (result.kind === "saved") return clientResponse(session, { ok: true, done: result.done, next: result.next });
  if (result.kind === "locked") return clientResponse(session, { ok: false, error: "locked", next: result.next }, 403);
  if (result.kind === "video") return clientResponse(session, { ok: false, error: "video" }, 409);
  if (result.kind === "range") return badInput(session, "watchedSec");
  return clientResponse(session, { ok: false }, 404); // notFound (terms is never asked for here)
}

/** POST /kursus/:slug/:lesson/tehtud: "Märgi tehtuks" for a text lesson (kind "text"). 200 `{ ok, done: true, next }`; 403 locked; 404; 409 `{ error: "video" }` (a video lesson). */
async function lessonDone(request: Request, deps: AccountDeps, rawSlug: string, rawLesson: string): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const ref = lessonRef(rawSlug, rawLesson);
  const result = ref ? await markTextLessonDone(deps.db, session.clientId, ref.slug, ref.lessonId, deps.now) : null;
  if (result?.kind === "saved") return clientResponse(session, { ok: true, done: true, next: result.next });
  if (result?.kind === "locked") return clientResponse(session, { ok: false, error: "locked", next: result.next }, 403);
  if (result?.kind === "video") return clientResponse(session, { ok: false, error: "video" }, 409);
  return clientResponse(session, { ok: false }, 404);
}

/** GET /kursus/:slug/:lesson/fail/:file: a file of an open lesson (fileAnswer: a signed R2 address or the bytes). 403 `{ error: "locked" }`; 404. */
async function lessonFile(request: Request, deps: AccountDeps, rawSlug: string, rawLesson: string, rawFile: string): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const ref = lessonRef(rawSlug, rawLesson);
  const fileId = parseRowId(rawFile);
  const file = ref && fileId !== null ? await lessonFileFor(deps.db, session.clientId, ref.slug, ref.lessonId, fileId, deps.now) : null;
  if (file?.kind === "locked") return clientResponse(session, { ok: false, error: "locked" }, 403);
  const answer = file?.kind === "file" && deps.files ? await fileAnswer(session, deps.files, file) : null;
  return answer ?? clientResponse(session, { ok: false }, 404);
}

/**
 * GET /lemmikud?l=<et|ru>: the Lemmikud tab, `{ ok, favourites, cards }` (client-data.ts FavouriteCards): the client's published favourites
 * as the catalogue's course cards, newest first, in the page's language `l` (anything but "ru" is Estonian).
 */
async function favouriteCourses(request: Request, deps: AccountDeps): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const locale = pageLocaleOf(new URL(request.url).searchParams.get("l")) ?? "et";
  return clientResponse(session, { ok: true, ...(await loadFavouriteCards(deps.db, session.clientId, locale, deps.now)) });
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
/** A lesson's paths: /kursus/<slug>/<lesson>, …/progress, …/tehtud, …/fail/<file>. */
const LESSON_PATH = /^\/kursus\/([^/]+)\/([^/]+)(?:\/(progress|tehtud)|\/fail\/([^/]+))?$/;

/** The endpoints behind a session; any other method and path is unknown (404, with or without a session). */
async function dataRoute(request: Request, path: string, deps: AccountDeps): Promise<Response> {
  switch (`${request.method} ${path}`) {
    case "GET /": return dashboard(request, deps);
    case "GET /lemmikud": return favouriteCourses(request, deps);
    case "POST /lemmikud": return favourite(request, deps);
    case "POST /lemmikud/merge": return mergeFavouriteList(request, deps);
    case "PATCH /andmed": return profile(request, deps);
    case "POST /uudiskiri": return newsletter(request, deps);
    case "POST /muutmine": return changeRequest(request, deps);
    case "POST /tingimused": return terms(request, deps);
    case "POST /kustuta": return deleteAccount(request, deps);
  }
  const course = request.method === "GET" ? COURSE_PATH.exec(path) : null;
  if (course) return ecourse(request, deps, course[1]);
  const lessonPath = LESSON_PATH.exec(path);
  if (lessonPath) {
    const [, slug, id, action, file] = lessonPath;
    if (request.method === "GET" && action === undefined && file === undefined) return lesson(request, deps, slug, id);
    if (request.method === "POST" && action === "progress") return progress(request, deps, slug, id);
    if (request.method === "POST" && action === "tehtud") return lessonDone(request, deps, slug, id);
    if (request.method === "GET" && file !== undefined) return lessonFile(request, deps, slug, id, file);
  }
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
      default: return await dataRoute(request, path, deps);
    }
  } catch (e) {
    logFailure("[account] request failed", e);
    return accountResponse({ ok: false, error: "server" }, 500);
  }
}
