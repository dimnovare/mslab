// ET lives at "/", RU at "/ru"; internally both render app/[locale]/…
import { NextResponse, type NextRequest } from "next/server";

export const ROBOTS = "noindex, nofollow";

// Paths the app serves as they are (no "/et" rewrite). The hub (guide, p/…) and /api are handled before this list.
const PASS = /^\/(ru(\/|$)|admin|media|_next|feedback\.js$|robots\.txt$|favicon|icon\.svg|brand\/|seed\/|og\.(jpg|png)$)/;

/** API routes answer at their own path: no trailing-slash or locale redirect (a POST must not be redirected). */
const API = /^\/api(\/|$)/;

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

/**
 * The canonical form of a site path: no trailing slash ("/koolitused/" → "/koolitused", Next's own redirect, which is off),
 * no "/et" prefix ("/et/x" → "/x"), and never two leading slashes or a slash and a backslash: Next.js sends a same-origin
 * redirect as a relative Location, and "//evil.example" or "/\evil.example" there would leave the site.
 */
export function canonicalPath(pathname: string): string {
  let path = pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname;
  if (path.startsWith("/et/") || path === "/et") path = path.slice(3) || "/";
  return path.replace(/^[/\\]{2,}/, "/");
}

export function middleware(req: NextRequest) {
  return noindex(route(req));
}

/**
 * The whole host stays out of search engines until launch: every answer that passes through here carries the header —
 * pages, API, /media, the redirects made here (next.config headers() does not reach a middleware redirect in
 * production) and rewrites. Static files are answered before the Worker runs: public/_headers.
 */
function noindex(res: NextResponse): NextResponse {
  res.headers.set("X-Robots-Tag", ROBOTS);
  return res;
}

function route(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (HUB.test(pathname)) return hub(req, pathname);
  if (API.test(pathname)) return NextResponse.next();

  // The trailing-slash and "/et" redirects, in one permanent redirect.
  const path = canonicalPath(pathname);
  if (path !== pathname) return NextResponse.redirect(withPath(req, path), 308);

  if (PASS.test(pathname)) return NextResponse.next(); // /ru/* renders app/[locale]=ru directly; admin, media and static files untouched
  const url = req.nextUrl.clone();
  url.pathname = "/et" + (pathname === "/" ? "" : pathname);
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
