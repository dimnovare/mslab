// ET lives at "/", RU at "/ru"; internally both render app/[locale]/…
import { NextResponse, type NextRequest } from "next/server";

const PASS = /^\/(ru(\/|$)|admin|api|media|guide(\/|$)|p\/|_next|feedback\.js$|robots\.txt$|favicon|icon\.svg|brand\/|seed\/|og\.(jpg|png)$)/;

/**
 * The design-review hub (public/guide, public/p/<dir>): static folders whose index.html pages use relative asset URLs,
 * so they must be opened with the trailing slash ("/guide/", "/p/d/"). In production the Worker's static assets answer
 * these paths before the app (html_handling auto-trailing-slash: "/guide" redirects to "/guide/", which serves
 * guide/index.html). `next dev` serves public files only by their file name, so the same is done here.
 * next.config.ts turns off Next's own trailing-slash redirect (it would send "/guide/" to "/guide"); this middleware
 * makes that redirect for every other path instead.
 */
const HUB = /^\/(guide(\/|$)|p\/)/;

/** `req`'s URL with another path (and the same query). A plain URL: a NextURL keeps the original trailing slash. */
function withPath(req: NextRequest, pathname: string): URL {
  const url = new URL(req.url);
  url.pathname = pathname;
  return url;
}

function hub(req: NextRequest, pathname: string): NextResponse {
  if (pathname.endsWith("/")) return NextResponse.rewrite(withPath(req, `${pathname}index.html`));
  // a folder without its slash: redirected as the static assets do (307)
  if (!pathname.slice(pathname.lastIndexOf("/") + 1).includes(".")) return NextResponse.redirect(withPath(req, `${pathname}/`), 307);
  return NextResponse.next(); // a file of the hub (image, script, style)
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (HUB.test(pathname)) return hub(req, pathname);

  // Next's trailing-slash redirect ("/koolitused/" → "/koolitused") and the unprefixed Estonian URL ("/et/x" → "/x"),
  // in one permanent redirect.
  let path = pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname;
  if (path.startsWith("/et/") || path === "/et") path = path.slice(3) || "/";
  if (path !== pathname) return NextResponse.redirect(withPath(req, path), 308);

  if (PASS.test(pathname)) return NextResponse.next(); // /ru/* renders app/[locale]=ru directly; admin/api/static untouched
  const url = req.nextUrl.clone();
  url.pathname = "/et" + (pathname === "/" ? "" : pathname);
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
