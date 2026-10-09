import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { logFailure } from "@/server/log";
import { unsubscribeByToken } from "@/server/newsletter";
import { isPrefetch } from "@/server/prefetch";

/**
 * The unsubscribe link of the welcome mail (`?t=<the subscriber's token>`, one-step newsletter, 09.10): deletes the subscriber's row and
 * sends the visitor to the home page in the row's language with the notice ?uudiskiri=loobutud. Unsubscribing is idempotent and reveals
 * nothing: an unknown or malformed token, or a link used before, gets the very same answer in Estonian. Only when the database could not
 * be reached is the visitor told so (?uudiskiri=viga), never that she is unsubscribed when she is not.
 * What only looks at the link must not unsubscribe anyone: a prefetch or prerender (Sec-Purpose / Purpose) goes home without deleting
 * anything or a notice (a notice would say what did not happen), and HEAD (below) does nothing. A mail scanner's GET cannot be told from a
 * click; the link is the one the owner asked for, and signing up again is a form away.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (isPrefetch(request.headers)) return redirectTo(new URL("/", url.origin));
  let page = "/";
  let outcome = "loobutud";
  try {
    const gone = await unsubscribeByToken(getDb(), url.searchParams.get("t") ?? "");
    if (gone?.locale === "ru") page = "/ru";
  } catch (e) {
    logFailure("[newsletter] unsubscribe failed", e); // never the message: it would contain the token
    outcome = "viga";
  }
  const target = new URL(page, url.origin);
  target.searchParams.set("uudiskiri", outcome);
  return redirectTo(target);
}

/** The redirect, never cached (it answers one link with one outcome). */
function redirectTo(target: URL): Response {
  const res = NextResponse.redirect(target, 303);
  res.headers.set("cache-control", "no-store");
  return res;
}

/** Mail scanners and link previews often send HEAD first; Next would run GET for it and delete the row. Nothing happens here. */
export function HEAD(): Response {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
