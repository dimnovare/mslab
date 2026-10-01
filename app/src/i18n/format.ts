import type { Locale } from "./locales";

/** Fills `{name}` placeholders in a dictionary string; unknown placeholders are left as they are. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Course dates are Estonian local times, wherever the server runs. */
const TIME_ZONE = "Europe/Tallinn";
const INTL_LOCALE: Record<Locale, string> = { et: "et-EE", ru: "ru-RU" };

const fmt = (l: Locale, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(INTL_LOCALE[l], { timeZone: TIME_ZONE, ...opts });

/** "14.11" */
export function formatDayMonth(d: Date, l: Locale): string {
  const parts = fmt(l, { day: "2-digit", month: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}`;
}

/** "22.09.2026" */
export function formatDate(d: Date, l: Locale): string {
  const parts = fmt(l, { day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")}`;
}

/** "laupäev" / "суббота" */
export function formatWeekday(d: Date, l: Locale): string {
  return fmt(l, { weekday: "long" }).format(d);
}
