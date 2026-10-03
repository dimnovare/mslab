// ET lives at "/", RU at "/ru"; internally both render app/[locale]/… The decisions are in lib/site-routing.ts (plain
// functions, tested without Next.js).
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

export function middleware(req: NextRequest): NextResponse | Promise<NextResponse> {
  const answer = route(req);
  return answer instanceof Promise ? answer.then(noindex) : noindex(answer);
}

/**
 * The whole host stays out of search engines until launch. Every answer gets X-Robots-Tag from next.config headers();
 * a redirect made here also sets it here, so it carries the header wherever it is answered. Only redirects: setting it
 * on the other answers too could send the value twice.
 */
function noindex(res: NextResponse): NextResponse {
  if (res.status >= 300 && res.status < 400) res.headers.set("X-Robots-Tag", ROBOTS);
  return res;
}

/** Set on the request the relay makes, so that a relay never relays again. */
export const RELAY_HEADER = "x-account-relay";

/** What the relay passes on of the visitor's request: what makes it a page, a navigation or a prefetch request. No cookies. */
const RELAYED_REQUEST_HEADERS = ["accept", "accept-language", "user-agent", "rsc", "next-router-prefetch", "next-router-segment-prefetch", "next-router-state-tree", "next-url"];
/**
 * What it does not pass back: the body is decoded by fetch; the other layers add their own X-Robots-Tag; and the headers of the
 * middleware itself (x-middleware-rewrite and the like, which the answer to the relayed request carries) are for the request they
 * answered: here they would be taken for this middleware's own and break it.
 */
const DROPPED_RESPONSE_HEADERS = ["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "set-cookie", "x-robots-tag"];
const MIDDLEWARE_HEADER = /^x-middleware-/i;

/** The page `page` ("/et/konto/sisene") as the browser's own request would get it. */
function rewriteToPage(req: NextRequest, page: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = page;
  return NextResponse.rewrite(url);
}

/**
 * An account shell asked for with a query of its own (?viga=link, ?korda=1, an e-mail address): the answer is the shell as the
 * address without the query gives it, which is the page the cache holds. Next.js keeps the address of the request that renders a
 * page (path and query) in the page it stores and hands that copy to every later visitor, and a rewrite cannot change it; so a
 * request with a query must never be the one that renders a shell. This asks for the address without the query (the cache
 * answers, or renders it, once, with no query in it) and passes the answer on. The browser keeps its own address and reads the
 * query from it (LoginForm). Only the visitor's page headers go along, no cookies; the answer is not kept by anyone on the way.
 */
async function relayWithoutQuery(req: NextRequest, page: string): Promise<NextResponse> {
  const rsc = req.nextUrl.searchParams.get("_rsc");
  const clean = new URL(req.url);
  clean.pathname = req.nextUrl.pathname;
  clean.search = rsc === null ? "" : `?_rsc=${encodeURIComponent(rsc)}`;
  const headers = new Headers({ [RELAY_HEADER]: "1" });
  for (const name of RELAYED_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  let res: Response;
  try {
    res = await fetch(clean, { method: "GET", headers, redirect: "manual", cache: "no-store" });
  } catch {
    // the shell could not be fetched: the page is rendered as for any other request
    return rewriteToPage(req, page);
  }
  // A shell answers 200 (or a redirect of Next.js's own, which goes on as it is). Anything else is no shell (a platform's page
  // that wants a sign-in, an error): the page is rendered as for any other request, never that answer shown in its place.
  if (res.status >= 400) {
    await res.body?.cancel();
    return rewriteToPage(req, page);
  }
  const out = new Headers(res.headers);
  for (const name of [...out.keys()]) if (DROPPED_RESPONSE_HEADERS.includes(name) || MIDDLEWARE_HEADER.test(name)) out.delete(name);
  out.set("cache-control", "private, no-store");
  return new NextResponse(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

function route(req: NextRequest): NextResponse | Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const to = routeSitePath(pathname, req.nextUrl.searchParams);
  switch (to.kind) {
    case "hub":
      return hub(req, pathname);
    case "redirect":
      return NextResponse.redirect(withPath(req, to.path), 308);
    case "page": {
      // an account shell asked for with a query of its own: answered from the address without it (relayWithoutQuery)
      const ownQuery = to.queryFree === true && [...req.nextUrl.searchParams.keys()].some((name) => name !== "_rsc");
      if (ownQuery && req.method === "GET" && !req.headers.has(RELAY_HEADER)) return relayWithoutQuery(req, to.page);
      if (!to.rewritten) return NextResponse.next(); // /ru/* renders app/[locale]=ru directly
      return rewriteToPage(req, to.page);
    }
    default:
      return NextResponse.next(); // API, admin, media and static files untouched
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
