import { NextResponse } from "next/server";
import { withAdmin } from "@/server/auth";
import { setPreviewCookie } from "@/server/preview";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/preview — "Vaata kodulehte" in the admin's top line: gives a signed-in admin the preview cookie of the
 * coming-soon gate (lib/site-gate.ts) and sends them to the home page (303), which then shows the whole site. For admins
 * who signed in before the gate existed; a new sign-in sets the cookie itself (api/auth/verify). Signed-in admins only
 * (401 JSON otherwise). A GET, so the link works as a link; from another site it only gives the admin their own pass.
 */
export const GET = withAdmin(async (request) => {
  const res = NextResponse.redirect(new URL("/", new URL(request.url).origin), 303);
  res.headers.set("cache-control", "no-store");
  await setPreviewCookie(res);
  return res;
});
