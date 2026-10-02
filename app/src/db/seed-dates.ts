// Dates of the sample sessions, relative to the day the seed (or the e2e run) is made, so the sample calendar is always
// in the future. Prototype D's eight rows were fixed dates (14.11.2026 … 23.01.2027); a test suite pinned to those
// would stop working once the first of them had passed. Pure: no database, no Cloudflare bindings.
//
// A seeded database keeps the dates it got: the seed only inserts what is missing, and the live database is never
// re-seeded. The e2e run moves the LOCAL database's sample sessions onto this schedule before it starts
// (tests/e2e/fixtures.ts), and its expectations come from the same functions.

import { tallinnFormParts, tallinnInstant } from "../domain/calendar";

/** Days from today to the first sample session: about six weeks, as prototype D's calendar had on 1.10.2026. */
export const SEED_LEAD_DAYS = 42;

/** "2026-11-14" + 7 → "2026-11-21" (calendar days, no time zone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The Estonian date of the first sample session: the first Saturday at least SEED_LEAD_DAYS after today (Estonian
 * date). Made on 1 or 2 October 2026 this is 14.11.2026, prototype D's first date.
 */
export function seedBaseDate(now: Date): string {
  const start = addDays(tallinnFormParts(now).date, SEED_LEAD_DAYS);
  const [y, m, d] = start.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday … 6 = Saturday
  return addDays(start, (6 - weekday + 7) % 7);
}

/** A sample session's start: `offset` days after the base date, at `time` Estonian time (10:00 as in prototype D). */
export function seedSessionStart(now: Date, offset: number, time = "10:00"): Date {
  return tallinnInstant(addDays(seedBaseDate(now), offset), time)!;
}
