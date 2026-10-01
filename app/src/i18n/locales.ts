import { et } from "./dict/et";
import { ru } from "./dict/ru";

export type Locale = "et" | "ru";
export const LOCALES: Locale[] = ["et", "ru"];
export type { Dict } from "./dict/et";

export function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value);
}

export function getDict(l: Locale) {
  return l === "ru" ? ru : et;
}
