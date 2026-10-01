import type { Locale } from "./locales";

/** A content field stored in the database: Estonian is required, Russian optional. */
export type I18n = { et: string; ru?: string };

/** Picks the text for a locale; a missing or blank Russian value falls back to Estonian. */
export function pick(f: I18n | null | undefined, l: Locale): string {
  if (!f) return "";
  const v = l === "ru" ? f.ru : f.et;
  return v && v.trim() ? v : f.et ?? "";
}

export function pickList(f: I18n[] | null | undefined, l: Locale): string[] {
  return (f ?? []).map((x) => pick(x, l));
}
