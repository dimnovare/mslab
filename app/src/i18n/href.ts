import type { Locale } from "./locales";

/** Estonian lives at "/", Russian at "/ru" + the same path. */
export function href(l: Locale, path: string): string {
  const p = path.startsWith("/") ? path : "/" + path;
  if (l === "et") return p;
  return p === "/" ? "/ru" : "/ru" + p;
}

/**
 * The URL path the visitor sees. Estonian pages are rendered internally under "/et" (middleware rewrite),
 * so a pathname read during rendering may carry that prefix: "/et/konto" -> "/konto", "/et" -> "/".
 */
export function publicPath(pathname: string): string {
  if (pathname === "/et") return "/";
  return pathname.startsWith("/et/") ? pathname.slice(3) : pathname;
}

/** The same page in another locale: "/ru/praktika" -> "/praktika" (et) or "/praktika" -> "/ru/praktika" (ru). */
export function switchLocaleHref(pathname: string, to: Locale): string {
  const bare = pathname === "/ru" ? "/" : pathname.startsWith("/ru/") ? pathname.slice(3) : pathname;
  return href(to, bare);
}
