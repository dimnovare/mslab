import type { NextResponse } from "next/server";
import { PREVIEW_COOKIE, PREVIEW_TTL_S, previewCookieOptions, signPreview } from "@/lib/preview-cookie";
import { gateOn } from "@/lib/site-gate";
import { serverEnv } from "./env";
import { logFailure, logNote } from "./log";

// The admins' preview cookie of the coming-soon gate (lib/preview-cookie.ts, lib/site-gate.ts) on an answer: set at sign-in
// (api/auth/verify) and by "Vaata kodulehte" (api/admin/preview), cleared at logout (api/auth/logout).

/**
 * Adds a fresh preview cookie (30 days, as the session) to `res`. Without PREVIEW_SECRET there is none to give: noted when the
 * gate is on (then nobody gets past it), and the answer goes on as it is. Never throws: signing in must not fail over it.
 */
export async function setPreviewCookie(res: NextResponse): Promise<void> {
  const env = serverEnv();
  if (!env.PREVIEW_SECRET) {
    if (gateOn(env.SITE_GATE)) logNote("[gate] PREVIEW_SECRET is not set: no preview cookie, the admin sees the coming-soon page");
    return;
  }
  try {
    res.cookies.set(PREVIEW_COOKIE, await signPreview(env.PREVIEW_SECRET), { ...previewCookieOptions, maxAge: PREVIEW_TTL_S });
  } catch (e) {
    logFailure("[gate] signing the preview cookie failed", e);
  }
}

/** Clears the preview cookie on `res` (logout). */
export function clearPreviewCookie(res: NextResponse): void {
  res.cookies.set(PREVIEW_COOKIE, "", { ...previewCookieOptions, maxAge: 0 });
}
