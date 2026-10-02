// ET lives at "/", RU at "/ru"; internally both render app/[locale]/… The decisions are in lib/site-routing.ts, which
// the Worker's cached-page front uses too (src/worker/page-front.ts), so both always mean the same page.
import { NextResponse, type NextRequest } from "next/server";
import { routeSitePath } from "@/lib/site-routing";

export { canonicalPath, cartPage } from "@/lib/site-routing";

export const ROBOTS = "noindex, nofollow";

/** `req`'s URL with another path (and the same query). A plain URL: a NextURL keeps the original trailing slash. */
function withPath(req: NextRequest, pathname: string): URL {
  const url = new URL(req.url);
  url.pathname = pathname;
  return url;
}

/**
 * The design-review hub (public/guide, public/p/<dir>) must be opened with the trailing slash ("/guide/"): its pages
 * use relative asset URLs. In production the static assets answer these paths before the app; `next dev` serves public
 * files only by their file name, so the same is done here. next.config.ts turns off Next's own trailing-slash redirect
 * (it would send "/guide/" to "/guide"); this middleware makes that redirect for every other path instead.
 */
function hub(req: NextRequest, pathname: string): NextResponse {
  if (pathname.endsWith("/")) return NextResponse.rewrite(withPath(req, `${pathname}index.html`));
  // a folder without its slash: redirected as the static assets do (307)
  if (!pathname.slice(pathname.lastIndexOf("/") + 1).includes(".")) return NextResponse.redirect(withPath(req, `${pathname}/`), 307);
  return NextResponse.next(); // a file of the hub (image, script, style)
}

export function middleware(req: NextRequest) {
  return noindex(route(req));
}

/**
 * The whole host stays out of search engines until launch. Pages, API and /media get X-Robots-Tag from next.config
 * headers(), static files from public/_headers (they are answered before the Worker runs). A redirect made here gets
 * it here: in production next.config headers() does not reach it. Only redirects: on the other answers OpenNext adds
 * next.config's header to one set here, and the value would be sent twice.
 */
function noindex(res: NextResponse): NextResponse {
  if (res.status >= 300 && res.status < 400) res.headers.set("X-Robots-Tag", ROBOTS);
  return res;
}

function route(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const to = routeSitePath(pathname, req.nextUrl.searchParams);
  switch (to.kind) {
    case "hub":
      return hub(req, pathname);
    case "redirect":
      return NextResponse.redirect(withPath(req, to.path), 308);
    case "page": {
      if (!to.rewritten) return NextResponse.next(); // /ru/* renders app/[locale]=ru directly
      const url = req.nextUrl.clone();
      url.pathname = to.page;
      return NextResponse.rewrite(url);
    }
    default:
      return NextResponse.next(); // API, admin, media and static files untouched
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
