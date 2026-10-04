import { and, count, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Db, Q } from "@/db/client";
import * as schema from "@/db/schema";
import { clientLoginTokens, clients, clientSessions, mailQuota, registrations, requests, subscribers } from "@/db/schema";
import { normalizeEmail } from "@/domain/email";
import { isTokenShape, newToken, sha256 } from "./token";

export const CLIENT_COOKIE = "__Host-mslab_client";
export { HINT_COOKIE } from "@/lib/account-cookies";
export const LOGIN_TTL_MS = 30 * 60_000;
export const CLIENT_SESSION_TTL_MS = 180 * 86_400_000;
export const CODE_ATTEMPTS = 5;
export const CLIENT_LOGIN_CAP = 3;
/**
 * The day's mails to visitors share one counter (the `mail_quota` row; Resend Free sends 100 a day, form notifications to Maria
 * included): a login e-mail or a confirmation that carries a login code stops at 60, a confirmation without a code at 50 (so
 * the last 10 of the 60 are left for sign-ins, and Maria's notifications keep their room).
 */
export const LOGIN_MAIL_DAILY_CAP = 60;
export const CONFIRMATION_MAIL_DAILY_CAP = 50;
/** Renew the session expiry at most once a day (fewer writes). */
const RENEW_AFTER_MS = 86_400_000;

export type ClientLogin = { sessionRaw: string; clientId: number; locale: "et" | "ru"; isNew: boolean };

const tx = <T>(db: Db, fn: (t: Db) => Promise<T>) =>
  (db as PostgresJsDatabase<typeof schema>).transaction((t) => fn(t as unknown as Db));

/**
 * Serialises everything that counts or starts a login for one address, until the transaction ends: parallel code
 * guesses are counted one after another (so 5 wrong tries really end the token), and two logins cannot both create the
 * client or both leave a session open (the one-device rule). Re-entrant within a transaction, so taking it again is harmless.
 * Always taken before any token row is locked (lock order address, then row), so a link and a code for one token cannot deadlock.
 */
export async function lockAddress(t: Db, address: string): Promise<void> {
  await t.execute(sql`select pg_advisory_xact_lock(hashtext(${"client-login:" + address}))`);
}

/** Six digits, uniform (rejection sampling). */
function sixDigits(): string {
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= 4_294_000_000);
  return String(a[0] % 1_000_000).padStart(6, "0");
}

/** A login for `email` (link token + code), or null when the address already has CLIENT_LOGIN_CAP live logins. */
export async function issueClientLogin(db: Db, email: string, now = new Date()): Promise<{ token: string; code: string } | null> {
  const address = normalizeEmail(email);
  return tx(db, async (t) => {
    await lockAddress(t, address);
    await t.delete(clientLoginTokens).where(lt(clientLoginTokens.expiresAt, now));
    const [{ n }] = await t.select({ n: count() }).from(clientLoginTokens)
      .where(and(eq(clientLoginTokens.email, address), isNull(clientLoginTokens.usedAt), gt(clientLoginTokens.expiresAt, now)));
    if (n >= CLIENT_LOGIN_CAP) return null;
    const token = newToken();
    const code = sixDigits();
    const hash = await sha256(token);
    await t.insert(clientLoginTokens).values({
      hash, codeHash: await sha256(`${hash}:${code}`), email: address, expiresAt: new Date(now.getTime() + LOGIN_TTL_MS),
    });
    return { token, code };
  });
}

/**
 * Creates the client if new, ends its other sessions, links its records and starts a session. `newClientLocale` (the
 * language of the page the login was asked for) is the language of a client created here; an existing client keeps its own.
 */
async function startSession(t: Db, address: string, now: Date, newClientLocale?: "et" | "ru"): Promise<ClientLogin> {
  await lockAddress(t, address); // both callers already hold it (re-entrant, no wait); kept so no future caller can skip it
  const [existing] = await t.select().from(clients).where(eq(clients.email, address)).limit(1);
  const client = existing ?? (await t.insert(clients).values({ email: address, ...(newClientLocale ? { locale: newClientLocale } : {}) }).returning())[0];
  await t.update(clientSessions).set({ endedAt: now, endReason: "replaced" })
    .where(and(eq(clientSessions.clientId, client.id), isNull(clientSessions.endedAt)));
  const sessionRaw = newToken();
  await t.insert(clientSessions).values({
    idHash: await sha256(sessionRaw), clientId: client.id, createdAt: now, expiresAt: new Date(now.getTime() + CLIENT_SESSION_TTL_MS),
  });
  await linkClientRecords(t, client.id, address);
  return { sessionRaw, clientId: client.id, locale: client.locale, isNew: !existing };
}

/** The session for a login link (once); `newClientLocale` as in startSession. Null: unknown, used, expired or dead. */
export async function redeemClientLink(db: Db, token: string, now = new Date(), newClientLocale?: "et" | "ru"): Promise<ClientLogin | null> {
  if (!isTokenShape(token)) return null;
  return tx(db, async (t) => {
    const hash = await sha256(token);
    // The address lock comes before the token row is locked by the UPDATE below: a code redeem for the same token
    // (lock, then row) would otherwise wait for this row while this waits for its lock.
    const [peek] = await t.select({ email: clientLoginTokens.email }).from(clientLoginTokens).where(eq(clientLoginTokens.hash, hash)).limit(1);
    if (!peek) return null;
    await lockAddress(t, peek.email);
    const [row] = await t.update(clientLoginTokens).set({ usedAt: now })
      .where(and(eq(clientLoginTokens.hash, hash), isNull(clientLoginTokens.usedAt), gt(clientLoginTokens.expiresAt, now),
        lt(clientLoginTokens.attempts, CODE_ATTEMPTS)))
      .returning();
    return row ? startSession(t, row.email, now, newClientLocale) : null;
  });
}

/**
 * The session for a right code; "wrong" (attempts counted on every live token of the address); null when none is live.
 * `newClientLocale` as in startSession.
 */
export async function redeemClientCode(db: Db, email: string, code: string, now = new Date(), newClientLocale?: "et" | "ru"): Promise<ClientLogin | "wrong" | null> {
  const address = normalizeEmail(email);
  if (!/^\d{6}$/.test(code)) return "wrong";
  return tx(db, async (t) => {
    await lockAddress(t, address); // before reading the attempts: parallel guesses are counted one after another
    const live = await t.select().from(clientLoginTokens)
      .where(and(eq(clientLoginTokens.email, address), isNull(clientLoginTokens.usedAt), gt(clientLoginTokens.expiresAt, now),
        lt(clientLoginTokens.attempts, CODE_ATTEMPTS)));
    if (!live.length) return null;
    for (const row of live) {
      if ((await sha256(`${row.hash}:${code}`)) === row.codeHash) {
        await t.update(clientLoginTokens).set({ usedAt: now }).where(eq(clientLoginTokens.hash, row.hash));
        return startSession(t, address, now, newClientLocale);
      }
    }
    // Counts against the live tokens just read (under the lock), never the expired rows a parallel purge may be deleting.
    await t.update(clientLoginTokens).set({ attempts: sql`${clientLoginTokens.attempts} + 1` })
      .where(inArray(clientLoginTokens.hash, live.map((row) => row.hash)));
    return "wrong";
  });
}

/**
 * The session of a cookie value: its client, or why it is over (`ended`). A live session is renewed (180 days from now) at most
 * once a day; `renewed` says it was, and then the caller must send the cookies again (api: account-api.ts requireClient), or the
 * browser drops them 180 days after the login however often the student comes back.
 */
export async function getClientSession(db: Db, raw: string | undefined, now = new Date()) {
  if (!isTokenShape(raw)) return null;
  const idHash = await sha256(raw);
  const [row] = await db.select().from(clientSessions).where(eq(clientSessions.idHash, idHash)).limit(1);
  if (!row) return null;
  if (row.endedAt) return { ended: row.endReason ?? "logout" } as const;
  if (row.expiresAt <= now) return { ended: "expired" } as const;
  let renewed = false;
  if (row.expiresAt.getTime() - now.getTime() < CLIENT_SESSION_TTL_MS - RENEW_AFTER_MS) {
    // Only an open session is renewed: a logout or a newer login between the read and this write keeps it ended, and then
    // no fresh cookies go out. (The cast: on the Db union, returning(fields) has no common overload.)
    const done = await (db as PostgresJsDatabase<typeof schema>).update(clientSessions)
      .set({ expiresAt: new Date(now.getTime() + CLIENT_SESSION_TTL_MS) })
      .where(and(eq(clientSessions.idHash, idHash), isNull(clientSessions.endedAt)))
      .returning({ one: sql<number>`1` });
    renewed = done.length > 0;
  }
  return { clientId: row.clientId, renewed } as const;
}

export async function endClientSession(db: Db, raw: string | undefined, now = new Date()): Promise<void> {
  if (!isTokenShape(raw)) return;
  await db.update(clientSessions).set({ endedAt: now, endReason: "logout" })
    .where(and(eq(clientSessions.idHash, await sha256(raw)), isNull(clientSessions.endedAt)));
}

/** One more login e-mail today, unless `cap` is reached (the row cannot fail open like the rate limits). */
export async function reserveLoginMail(db: Q, now = new Date(), cap = LOGIN_MAIL_DAILY_CAP): Promise<boolean> {
  const day = now.toISOString().slice(0, 10);
  const rows = await db.insert(mailQuota).values({ day, sent: 1 })
    .onConflictDoUpdate({ target: mailQuota.day, set: { sent: sql`${mailQuota.sent} + 1` }, setWhere: sql`${mailQuota.sent} < ${cap}` })
    .returning();
  return rows.length > 0;
}

/** Links registrations, requests (payload e-mail) and the newsletter row of `email` to the client. */
export async function linkClientRecords(db: Q, clientId: number, email: string): Promise<void> {
  const address = normalizeEmail(email);
  await db.update(registrations).set({ clientId }).where(and(isNull(registrations.clientId), sql`lower(${registrations.email}) = ${address}`));
  await db.update(requests).set({ clientId }).where(and(isNull(requests.clientId), sql`lower(${requests.payload}->>'email') = ${address}`));
  await db.update(subscribers).set({ clientId }).where(and(isNull(subscribers.clientId), sql`lower(${subscribers.email}) = ${address}`));
}
