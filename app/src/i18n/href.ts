import type { Locale } from "./locales";

/** Estonian lives at "/", Russian at "/ru" + the same path. */
export function href(l: Locale, path: string): string {
  const p = path.startsWith("/") ? path : "/" + path;
  if (l === "et") return p;
  return p === "/" ? "/ru" : "/ru" + p;
}

/** The same page in another locale: "/ru/praktika" -> "/praktika" (et) or "/praktika" -> "/ru/praktika" (ru). */
export function switchLocaleHref(pathname: string, to: Locale): string {
  const bare = pathname === "/ru" ? "/" : pathname.startsWith("/ru/") ? pathname.slice(3) : pathname;
  return href(to, bare);
}
