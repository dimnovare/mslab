import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { SESSION_COOKIE, deleteSession, sessionCookieOptions } from "@/server/auth";
import { logFailure } from "@/server/log";

/**
 * Logout (POST from the button in the admin area): deletes the session row, clears the `mslab_admin` cookie and sends
 * the browser to /admin/login. POST only, so that a link or an image on another site cannot sign anybody out. A
 * request without the cookie (a cross-site POST does not carry it, SameSite=Lax) just gets the redirect.
 */
export async function POST(request: Request): Promise<Response> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = NextResponse.redirect(new URL("/admin/login", new URL(request.url).origin), 303);
  res.headers.set("cache-control", "no-store");
  if (!raw) return res;
  try {
    await deleteSession(getDb(), raw);
  } catch (e) {
    logFailure("[auth] logout failed to delete the session", e); // the cookie is cleared all the same
  }
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return res;
}
