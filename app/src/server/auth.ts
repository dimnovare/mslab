import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, type Db } from "@/db/client";
import { adminSessions, authTokens } from "@/db/schema";
import { logFailure } from "./log";
import { isTokenShape, newToken, sha256 } from "./token";

// Admin sign-in by magic link. Only the e-mails in ADMIN_EMAILS can sign in. A login link holds a random token that is
// valid for 15 minutes and works once; opening it starts a session of 30 days, kept in the `mslab_admin` cookie. The
// database holds only the SHA-256 hashes of tokens and session ids, never the values themselves.
//
// The functions up to `adminFirstName` take a Db and a clock and run without Next.js (tests/db/auth.test.ts); the
// guards below them read the cookie and the Worker bindings.

export const SESSION_COOKIE = "mslab_admin";
export const TOKEN_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

/** Attributes of the session cookie (Max-Age is added when it is set; 0 clears it). */
export const sessionCookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;

const normalize = (email: string) => email.trim().toLowerCase();

/** Is `email` in the comma-separated allow-list `allow`? Whole addresses only, case-insensitive, trimmed. */
export function isAllowedAdmin(email: string, allow: string): boolean {
  const wanted = normalize(email);
  if (!wanted) return false;
  return allow.split(",").some((entry) => normalize(entry) === wanted);
}

/** Greeting name of an admin: the known first names, otherwise the capitalised start of the address. */
export function adminFirstName(email: string): string {
  const known: Record<string, string> = { "maria@example.test": "Maria", "dim@example.test": "Dim" };
  const e = normalize(email);
  if (known[e]) return known[e];
  const local = e.split("@")[0].split(/[._+-]/)[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/**
 * A login token for `email`: returns the raw token (for the link), stores its hash and an expiry 15 minutes ahead.
 * Tokens that have expired are swept on the way, so the table does not grow.
 */
export async function createLoginToken(db: Db, email: string, now: Date = new Date()): Promise<string> {
  await db.delete(authTokens).where(lt(authTokens.expiresAt, now));
  const raw = newToken();
  await db.insert(authTokens).values({ hash: await sha256(raw), email: normalize(email), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS) });
  return raw;
}

/**
 * Uses a login token: the address it was issued for, or null when it is unknown, expired or already used. One
 * UPDATE both checks and burns it, so two simultaneous clicks cannot both get in.
 */
export async function consumeLoginToken(db: Db, raw: string, now: Date = new Date()): Promise<string | null> {
  if (!isTokenShape(raw)) return null;
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(and(eq(authTokens.hash, await sha256(raw)), isNull(authTokens.usedAt), gt(authTokens.expiresAt, now)))
    .returning();
  return row?.email ?? null;
}

/** A session for `email`: the raw session id for the cookie; its hash is stored, expiring in 30 days. Expired sessions are swept. */
export async function createSession(db: Db, email: string, now: Date = new Date()): Promise<string> {
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, now));
  const raw = newToken();
  await db.insert(adminSessions).values({ idHash: await sha256(raw), email: normalize(email), expiresAt: new Date(now.getTime() + SESSION_TTL_MS) });
  return raw;
}

/** The e-mail of a live session, or null (no cookie, unknown id, expired). */
export async function getSessionEmail(db: Db, raw: string | undefined, now: Date = new Date()): Promise<string | null> {
  if (!isTokenShape(raw)) return null;
  const [row] = await db
    .select({ email: adminSessions.email })
    .from(adminSessions)
    .where(and(eq(adminSessions.idHash, await sha256(raw)), gt(adminSessions.expiresAt, now)))
    .limit(1);
  return row?.email ?? null;
}

/** Ends a session (logout). An unknown or missing id is ignored. */
export async function deleteSession(db: Db, raw: string | undefined): Promise<void> {
  if (!isTokenShape(raw)) return;
  await db.delete(adminSessions).where(eq(adminSessions.idHash, await sha256(raw)));
}

// ---------- guards (cookie + Worker bindings) ----------

/**
 * The signed-in admin of this request, or null. The session must be live and its e-mail still in ADMIN_EMAILS (taking
 * an address off the list ends its access without touching the sessions). Memoised per request, so the layout and the
 * page share one lookup. A failing database is logged without details and thrown as a plain error (a 500, never a
 * redirect that looks like a logout).
 */
export const currentAdminEmail = cache(async (): Promise<string | null> => {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const email = await getSessionEmail(getDb(), raw);
    return email && isAllowedAdmin(email, getCloudflareContext().env.ADMIN_EMAILS) ? email : null;
  } catch (e) {
    logFailure("[auth] session lookup failed", e);
    throw new Error("admin session lookup failed");
  }
});

/**
 * For admin pages, layouts and server actions: the signed-in admin's e-mail, or a redirect to /admin/login.
 * A layout is not re-rendered when the visitor navigates between its pages, so every admin page (and action) calls
 * this itself; the layout's call is the first line of defence, not the only one.
 */
export async function requireAdmin(): Promise<string> {
  const email = await currentAdminEmail();
  if (!email) redirect("/admin/login");
  return email;
}

/**
 * For admin route handlers: the signed-in admin's e-mail, or throws a 401 Response. The handler catches it:
 * `try { const email = await requireAdminEmail(); … } catch (e) { if (e instanceof Response) return e; throw e; }`.
 */
export async function requireAdminEmail(): Promise<string> {
  const email = await currentAdminEmail();
  if (!email) {
    throw new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  return email;
}
