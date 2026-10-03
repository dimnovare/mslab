import type { I18n } from "@/i18n/field";

// The e-course terms the student accepts before the first opening of a course (phase 2a). The text is the `pages` row
// `course_terms` (ET/RU, edited in the admin under Seaded); its version is the settings key `courseTermsVersion`: the
// time the admin last saved a changed text, as an ISO string ("1" until the first save). Pure: no database, no Next.js.

/** The settings key that holds the terms version. */
export const TERMS_VERSION_KEY = "courseTermsVersion";
/** The terms version while the admin has not saved the terms text yet. */
export const DEFAULT_TERMS_VERSION = "1";
/** The page that holds the e-course terms text (ET/RU, edited in the admin). */
export const TERMS_PAGE_KEY = "course_terms";
/** Its title (the admin edits only the text; no screen shows the title, the notice has its own): the seed's and a first save's. */
export const TERMS_PAGE_TITLE: I18n = { et: "E-koolituse tingimused", ru: "Условия онлайн-обучения" };

/**
 * The version a save at `now` gives the terms: its time as an ISO string. It is never the version already stored (two saves in
 * the same millisecond: then the next millisecond), so a save always asks the students who accepted the old text again.
 */
export function nextTermsVersion(now: Date, current: unknown): string {
  const iso = now.toISOString();
  if (typeof current !== "string" || iso !== current) return iso;
  return new Date(now.getTime() + 1).toISOString();
}
