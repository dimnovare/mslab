// Where a request path goes: the decisions of src/middleware.ts as plain functions, without Next.js, so that the
// Worker's cached-page front (src/worker/page-front.ts) reads exactly the page the middleware would render.
// ET lives at "/", RU at "/ru"; internally both render app/[locale]/…

// Paths the app serves as they are (no "/et" rewrite). The hub (guide, p/…) and /api are handled before this list.
const PASS = /^\/(ru(\/|$)|admin|media|_next|feedback\.js$|robots\.txt$|favicon|icon\.svg|brand\/|seed\/|og\.(jpg|png)$)/;

/** API routes answer at their own path: no trailing-slash or locale redirect (a POST must not be redirected). */
const API = /^\/api(\/|$)/;

/**
 * The design-review hub (public/guide, public/p/<dir>): static folders whose index.html pages use relative asset URLs,
 * so they must be opened with the trailing slash ("/guide/", "/p/d/"). In production the Worker's static assets answer
 * these paths before the app (html_handling auto-trailing-slash: "/guide" redirects to "/guide/", which serves
 * guide/index.html). `next dev` serves public files only by their file name, so the middleware does the same.
 */
const HUB = /^\/(guide(\/|$)|p\/)/;

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

/**
 * The cart of one course ("/ostukorv?kursus=x", "/ru/ostukorv?kursus=x") is served from a page of its own,
 * "/<locale>/ostukorv/x": the public pages are cached by their path alone (open-next.config.ts), so a page whose content
 * depends on the query could not be. The address bar keeps the visitor's URL. null: not a cart with a course.
 */
export function cartPage(pathname: string, search: URLSearchParams): string | null {
  const m = /^(\/ru)?\/ostukorv$/.exec(pathname);
  const course = search.get("kursus")?.trim();
  if (!m || !course) return null;
  return `/${m[1] ? "ru" : "et"}/ostukorv/${encodeURIComponent(course)}`;
}

export type SiteRoute =
  /** the design-review hub (static files; the middleware serves its index pages under `next dev`) */
  | { kind: "hub" }
  /** /api/…: answered at its own path */
  | { kind: "api" }
  /** a permanent redirect to the canonical path (same query) */
  | { kind: "redirect"; path: string }
  /** a public page of app/[locale]: `page` is the path it renders ("/et/koolitused"); `rewritten` when it is not the
   *  visitor's own path (the ET rewrite, the cart) */
  | { kind: "page"; page: string; rewritten: boolean }
  /** admin, /media, Next.js files and static files: served as they are */
  | { kind: "other" };

/** What the middleware does with `pathname` (and its query, for the cart). */
export function routeSitePath(pathname: string, search: URLSearchParams): SiteRoute {
  if (HUB.test(pathname)) return { kind: "hub" };
  if (API.test(pathname)) return { kind: "api" };
  // The trailing-slash and "/et" redirects, in one permanent redirect.
  const path = canonicalPath(pathname);
  if (path !== pathname) return { kind: "redirect", path };
  const cart = cartPage(pathname, search);
  if (cart) return { kind: "page", page: cart, rewritten: true };
  if (/^\/ru(\/|$)/.test(pathname)) return { kind: "page", page: pathname, rewritten: false }; // app/[locale]=ru directly
  if (PASS.test(pathname)) return { kind: "other" };
  return { kind: "page", page: "/et" + (pathname === "/" ? "" : pathname), rewritten: true };
}
