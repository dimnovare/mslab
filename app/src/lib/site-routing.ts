// Where a request path goes: the decisions of src/middleware.ts as plain functions, without Next.js (tested on their own).
// ET lives at "/", RU at "/ru"; internally both render app/[locale]/…

// Paths the app serves as they are (no "/et" rewrite). The hub (guide, p/…) and /api are handled before this list.
// Every entry ends at a path boundary or is one exact file: "/admin.php", "/administrator" or "/media.php" are unknown
// addresses (the cached 404 page), not the admin or /media.
const PASS = /^\/(ru(\/|$)|admin(\/|$)|media(\/|$)|_next(\/|$)|feedback\.js$|robots\.txt$|favicon\.ico$|icon\.svg$|brand\/|seed\/|og\.(jpg|png)$)/;

/** API routes answer at their own path: no trailing-slash or locale redirect (a POST must not be redirected). */
const API = /^\/api(\/|$)/;

/**
 * The design-review hub (public/guide, public/p/<dir>): static folders whose index.html pages use relative asset URLs,
 * so they must be opened with the trailing slash ("/guide/", "/p/d/"). Next.js serves public files only by their file
 * name, so the middleware redirects "/guide" to "/guide/" and serves guide/index.html there.
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
 * "/<locale>/ostukorv/x": the public pages are cached by their path alone (incremental static regeneration), so a
 * page whose content depends on the query could not be. The address bar keeps the visitor's URL. null: not a cart
 * with a course.
 */
export function cartPage(pathname: string, search: URLSearchParams): string | null {
  const m = /^(\/ru)?\/ostukorv$/.exec(pathname);
  const course = search.get("kursus")?.trim();
  if (!m || !course) return null;
  return `/${m[1] ? "ru" : "et"}/ostukorv/${encodeURIComponent(course)}`;
}

/** The pages of app/[locale]/(site) without their locale (tests/unit/site-routing.test.ts checks them against the app). */
const STATIC_PAGES = new Set(["", "/kontakt", "/konto", "/koolitaja", "/koolitused", "/koolituskalender", "/ostukorv", "/praktika", "/privaatsus", "/tingimused", "/uudised"]);
/** Pages with a slug of ours (lowercase letters, digits, dashes); the cart takes whatever ?kursus= says (its own 404). */
const SLUG_PAGE = /^\/(koolitused|uudised)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CART_PAGE = /^\/ostukorv\/[^/]+$/;

/**
 * Every address without a page of its own is served from this one page per locale (app/[locale]/(site)/[...rest] →
 * not-found.tsx, status 404): rendered once and cached like any page, instead of a render per unknown address (a scan
 * of /wp-admin, /.env and the like would otherwise cost a render each, and could not fill the cache either).
 */
export const NOT_FOUND_SEGMENT = "leidmata";

/** Does `page` ("/et/koolitused/x") name a page of the site? false: it is served from the locale's 404 page. */
export function isKnownPage(page: string): boolean {
  const rest = page.replace(/^\/(et|ru)(?=\/|$)/, "");
  return STATIC_PAGES.has(rest) || SLUG_PAGE.test(rest) || CART_PAGE.test(rest);
}

/** The 404 page of a locale ("/et/leidmata"). */
export const notFoundPage = (page: string): string => `/${page.startsWith("/ru") ? "ru" : "et"}/${NOT_FOUND_SEGMENT}`;

export const isNotFoundPage = (page: string): boolean => page === `/et/${NOT_FOUND_SEGMENT}` || page === `/ru/${NOT_FOUND_SEGMENT}`;

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
  if (/^\/ru(\/|$)/.test(pathname)) return known(pathname, false); // app/[locale]=ru directly
  if (PASS.test(pathname)) return { kind: "other" };
  return known("/et" + (pathname === "/" ? "" : pathname), true);
}

/** A page of the site as it is, or else its locale's 404 page (the address bar keeps the visitor's URL). */
function known(page: string, rewritten: boolean): SiteRoute {
  return isKnownPage(page) ? { kind: "page", page, rewritten } : { kind: "page", page: notFoundPage(page), rewritten: true };
}
