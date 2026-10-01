import type { Db } from "@/db/client";
import { listAllCourses } from "@/db/queries/admin";

/** The site's main pages, suggested for button links in the admin (hero slides, campaign). */
export const SITE_PAGES = ["/koolitused", "/koolitused?vorm=e", "/koolitused?vorm=k", "/koolituskalender", "/praktika", "/koolitaja", "/uudised", "/kontakt"];

/** Link suggestions: the main pages, then every course page (drafts too: a link can be prepared before publishing). */
export async function linkSuggestions(db: Db): Promise<string[]> {
  const courses = await listAllCourses(db);
  return [...SITE_PAGES, ...courses.map((c) => `/koolitused/${c.slug}`)];
}
