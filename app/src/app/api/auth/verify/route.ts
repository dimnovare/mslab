import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { SESSION_COOKIE, SESSION_TTL_MS, redeemLoginToken, sessionCookieOptions } from "@/server/auth";
import { serverEnv } from "@/server/env";
import { logFailure } from "@/server/log";

/** A browser or proxy fetching the link ahead of the click (Chrome's `Sec-Purpose: prefetch`, older `Purpose: prefetch`). */
const isPrefetch = (h: Headers) => /prefetch|prerender/i.test(`${h.get("sec-purpose") ?? ""} ${h.get("purpose") ?? ""}`);

/**
 * The link in the login e-mail (`?t=<token>`): uses the token (single use, 15 minutes), starts a session of 30 days in
 * the `__Host-mslab_admin` cookie and sends the admin to /admin. Using the token and creating the session are one
 * transaction, so a database failure in between leaves the link usable. Anything else goes to /admin/login:
 * ?viga=link (unknown, expired or used token, or an address that is no longer allowed), =server (the database failed);
 * a prefetch goes there without a notice and without touching the token.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let session: string | null = null;
  let target = "/admin/login";
  if (!isPrefetch(request.headers)) {
    try {
      // The allow-list is checked again inside: an address taken off the list since the link was sent does not get in.
      session = await redeemLoginToken(getDb(), url.searchParams.get("t") ?? "", serverEnv().ADMIN_EMAILS);
      target = session ? "/admin" : "/admin/login?viga=link";
    } catch (e) {
      logFailure("[auth] verify failed", e); // never the message: it holds the token hash and the e-mail
      target = "/admin/login?viga=server";
    }
  }
  const res = NextResponse.redirect(new URL(target, url.origin), 303);
  if (session) res.cookies.set(SESSION_COOKIE, session, { ...sessionCookieOptions, maxAge: SESSION_TTL_MS / 1000 });
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "no-referrer"); // the token is in this URL
  return res;
}

/** Mail scanners and link previews often send HEAD first; Next would run GET for it and use up the token. */
export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { allow: "GET", "cache-control": "no-store" } });
}
