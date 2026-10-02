// Which public pages show what (pure: no Next.js, so the Worker's cron can use it too; server/public-cache.ts does the
// revalidating). Pages are named by their route (app/[locale]/(site)/…), which covers both languages: a "page" target is
// that page, a "layout" target every page at or below it. A path without brackets is one address (as the middleware
// rewrote it, so with its locale: "/et/koolitused/x").

/** What changed. `parts`: the editor parts that were saved (an editor page sends only the changed ones). */
export type PublicChange =
  /** a course saved, created or moved in the list */
  | { kind: "courses" }
  /** a calendar session saved or deleted, or one has begun */
  | { kind: "sessions" }
  /** seat counts: a registration or waitlist entry for `course` (its slug), or an admin's status / payment change */
  | { kind: "seats"; course?: string }
  /** Avaleht: hero slides, statement, FAQ */
  | { kind: "home" }
  /** Praktika: the packages */
  | { kind: "practice" }
  /** Koolitaja: trainer (name in the footer, portrait, stats), bio, works, center_story, trainer_journey */
  | { kind: "trainer"; parts: string[] }
  /** a post saved or deleted */
  | { kind: "posts" }
  /** Kampaania (the home page popup) */
  | { kind: "campaign" }
  /** Seaded: contact and newsletter (footer, every page), privacy, terms */
  | { kind: "settings"; parts: string[] };

export type CacheTarget = { path: string; type?: "page" | "layout" };

const SITE = "/[locale]/(site)";
const page = (route: string): CacheTarget => ({ path: SITE + route, type: "page" });
const below = (route: string): CacheTarget => ({ path: SITE + route, type: "layout" });

const HOME = page("");
const EVERY_PAGE = below("");
const CALENDAR = page("/koolituskalender");
/** the catalogue and every course page */
const COURSES = below("/koolitused");
const COURSE_PAGES = page("/koolitused/[slug]");
/** the empty cart and every course's cart */
const CARTS = below("/ostukorv");

/** A course's own page in both languages (its slug as stored: lowercase letters, digits and dashes). */
const coursePages = (slug: string): CacheTarget[] => ["et", "ru"].map((l) => ({ path: `/${l}/koolitused/${slug}` }));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The pages that show what `change` changed. */
export function revalidationTargets(change: PublicChange): CacheTarget[] {
  switch (change.kind) {
    case "courses":
      // cards (home, catalogue, recommendations on every course page), the course page, calendar rows, the cart
      return [COURSES, HOME, CALENDAR, CARTS];
    case "sessions":
      // calendar rows, the course page's dates, the next date on cards, the home page's upcoming strip
      return [COURSES, HOME, CALENDAR];
    case "seats":
      // seat states are shown in the calendar and on the course page
      return [...(change.course && SLUG.test(change.course) ? coursePages(change.course) : [COURSE_PAGES]), CALENDAR];
    case "home":
    case "campaign":
      return [HOME];
    case "practice":
      return [HOME, page("/praktika")];
    case "posts":
      return [below("/uudised"), HOME];
    case "trainer": {
      const parts = new Set(change.parts);
      // the trainer's name is in the footer; portrait, role and stats also on the home page, /kontakt, course pages
      if (parts.has("trainer")) return [EVERY_PAGE];
      const out: CacheTarget[] = [];
      if (parts.size > 0) out.push(page("/koolitaja"));
      if (parts.has("bio")) out.push(HOME, COURSE_PAGES); // the teaser and the course page's trainer card
      return out;
    }
    case "settings": {
      const parts = new Set(change.parts);
      // contact details and the newsletter discount are in the footer
      if (parts.has("contact") || parts.has("newsletter")) return [EVERY_PAGE];
      return [...(parts.has("privacy") ? [page("/privaatsus")] : []), ...(parts.has("terms") ? [page("/tingimused")] : [])];
    }
  }
}

/**
 * The cache tag Next.js's revalidatePath(target.path, target.type) writes ("_N_T_/[locale]/(site)/koolituskalender/page"):
 * every page carries such tags for its route, its layouts and its address (server/lib/implicit-tags in Next.js).
 */
export function targetTag(t: CacheTarget): string {
  const path = `_N_T_${t.path.length > 1 ? t.path.replace(/\/+$/, "") : t.path}`;
  return t.type ? `${path}${path.endsWith("/") ? "" : "/"}${t.type}` : path;
}
