import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { SESSION_COOKIE, SESSION_TTL_MS, consumeLoginToken, createSession, isAllowedAdmin, sessionCookieOptions } from "@/server/auth";
import { logFailure } from "@/server/log";

/**
 * The link in the login e-mail (`?t=<token>`): uses the token (single use, 15 minutes), starts a session of 30 days in
 * the `mslab_admin` cookie and sends the admin to /admin. Anything else goes to /admin/login with a notice:
 * ?viga=link (unknown, expired or used token, or an address that is no longer allowed), =server (the database failed).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let session: string | null = null;
  let failure: "link" | "server" = "link";
  try {
    const db = getDb();
    const email = await consumeLoginToken(db, url.searchParams.get("t") ?? "");
    // The allow-list is checked again: an address taken off the list since the link was sent does not get in.
    if (email && isAllowedAdmin(email, getCloudflareContext().env.ADMIN_EMAILS)) session = await createSession(db, email);
  } catch (e) {
    logFailure("[auth] verify failed", e); // never the message: it holds the token hash and the e-mail
    failure = "server";
  }
  const res = NextResponse.redirect(new URL(session ? "/admin" : `/admin/login?viga=${failure}`, url.origin), 303);
  if (session) res.cookies.set(SESSION_COOKIE, session, { ...sessionCookieOptions, maxAge: SESSION_TTL_MS / 1000 });
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "no-referrer"); // the token is in this URL
  return res;
}

/** Mail scanners and link previews often send HEAD first; Next would run GET for it and use up the token. */
export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { allow: "GET", "cache-control": "no-store" } });
}
