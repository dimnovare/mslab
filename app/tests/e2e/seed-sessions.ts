import { courseSeeds } from "../../src/db/seed-data";
import { addDays, seedBaseDate } from "../../src/db/seed-dates";
import { tallinnInstant } from "../../src/domain/calendar";
import { formatDate, formatDayMonth, formatWeekday } from "../../src/i18n/format";
import type { Locale } from "../../src/i18n/locales";
import { LOCAL_FIXTURES } from "./fixtures";

// Expected session dates. Against the local dev server they are exact: global-setup has put the local database's sample
// sessions on today's schedule (src/db/seed-dates.ts, fixtures.ts scheduleSampleSessions), and these come from the same
// schedule. A deployment's database keeps the dates it was seeded with (it is never re-seeded), so against one any
// date of the right shape is accepted.

/** The start of a course's `nth` sample session in a city, on today's schedule. */
export function sampleSession(slug: string, city: string, nth = 0): Date {
  const course = courseSeeds.find((c) => c.slug === slug);
  const starts = (course?.sessions ?? [])
    .filter((s) => s.city === city)
    .map((s) => s.startsAt)
    .sort((a, b) => a.getTime() - b.getTime());
  if (!starts[nth]) throw new Error(`e2e: no sample session ${nth} of ${slug} in ${city}`);
  return starts[nth];
}

/** "14.11" of that session (any "dd.mm" against a deployment). */
export function sampleDayMonth(slug: string, city: string, nth = 0, locale: Locale = "et"): string | RegExp {
  return LOCAL_FIXTURES ? formatDayMonth(sampleSession(slug, city, nth), locale) : /\d{2}\.\d{2}/;
}

/** "laupäev" of that session (any weekday against a deployment). */
export function sampleWeekday(slug: string, city: string, nth = 0, locale: Locale = "et"): string | RegExp {
  return LOCAL_FIXTURES ? formatWeekday(sampleSession(slug, city, nth), locale) : locale === "et" ? /päev/ : /./;
}

/**
 * A date for a session a test adds itself: about 22 weeks ahead (after every sample session), a Saturday, as the admin
 * types it ("2027-03-13") and as the site shows it ("13.03.2027"), with the instant of `time` Estonian time on that day.
 */
export function laterSaturday(time: string): { input: string; shown: string; dayMonth: string; at: Date } {
  const input = addDays(seedBaseDate(new Date()), 119);
  const at = tallinnInstant(input, time)!;
  return { input, shown: formatDate(at, "et"), dayMonth: formatDayMonth(at, "et"), at };
}
