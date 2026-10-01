// Pure rules for the calendar (/koolituskalender) (no database, no React).

import { normalizeSearch } from "./catalogue";

/** The calendar's city chips after "Kõik", in Maria's order (prototype A). */
export const CALENDAR_CITIES = ["Pärnu", "Tallinn", "Tartu", "Viljandi"];

/** A city in the URL: lowercase, no diacritics, spaces as dashes ("Pärnu" → "parnu"). */
export function citySlug(city: string): string {
  return normalizeSearch(city).replace(/ /g, "-");
}

/** The chip cities: Maria's four, then any other city that has an upcoming session (each once, in date order). */
export function calendarCities(sessionCities: string[], base: string[] = CALENDAR_CITIES): string[] {
  const out = [...base];
  const seen = new Set(base.map(citySlug));
  for (const raw of sessionCities) {
    const city = raw.trim();
    const key = citySlug(city);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(city);
  }
  return out;
}

/**
 * The city filter in the URL, the single source of truth: ?linn=parnu|tallinn|…
 * Returns the slug of a known chip city; a missing or unknown value means all cities (null).
 */
export function parseCity(value: string | string[] | null | undefined, cities: string[]): string | null {
  const v = citySlug(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
  return v && cities.some((c) => citySlug(c) === v) ? v : null;
}

/** Only contact courses have dates; e-learning starts any time, so it never appears in the calendar. */
export function contactSessions<S extends { course: { type: "e_learning" | "contact" } }>(sessions: S[]): S[] {
  return sessions.filter((s) => s.course.type === "contact");
}

/** Built once: an Intl formatter per call is slow. */
const TALLINN_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Tallinn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Midnight at the start of `now`'s day in Estonian time, so the calendar still lists a session later today.
 * (On the two DST change days the boundary can be an hour off; sessions never start around midnight.)
 */
export function startOfDayTallinn(now: Date): Date {
  const parts = TALLINN_PARTS.formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const [y, m, d] = [get("year"), get("month"), get("day")];
  const offset = Date.UTC(y, m - 1, d, get("hour"), get("minute"), get("second")) - (now.getTime() - now.getUTCMilliseconds());
  return new Date(Date.UTC(y, m - 1, d) - offset);
}
