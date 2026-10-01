import { eq, getTableName, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "./client";
import { campaign, courseImages, courseSessions, courses, faq, galleryItems, heroSlides, pages, posts, practicePackages, registrations, settings } from "./schema";
import { campaignSeed, courseSeeds, faqSeeds, heroSeeds, pageSeeds, postSeeds, practiceSeeds, settingSeeds, trainerWorks } from "./seed-data";

// Applies the prototype content. Plain drizzle: no Cloudflare bindings, so it runs from the CLI (seed.ts) and from tests.
//
// Default mode only INSERTS WHAT IS MISSING (by slug / code / key; keyless lists such as hero slides, FAQ and the
// gallery only when empty). Rows that already exist, including everything Maria has edited in admin, are never
// overwritten, so running the seed twice (or against a live database) is safe.
// `reset` truncates the content tables first and restores the prototype content.

export type SeedOptions = {
  /** Truncate the content tables before seeding. */
  reset?: boolean;
  /** Allow `reset` even when registrations exist (they are deleted together with the courses they belong to). */
  force?: boolean;
};

const CONTENT_TABLES = ["courses", "course_images", "course_sessions", "registrations", "practice_packages", "hero_slides", "faq", "posts", "pages", "gallery_items", "campaign", "settings"];
const TRAINER_WORKS = "trainer_works";

async function total(db: Db, table: PgTable): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(table);
  return row.n;
}

export async function applySeed(db: Db, opts: SeedOptions = {}): Promise<Record<string, number>> {
  if (opts.reset) {
    const existing = await total(db, registrations);
    if (existing > 0 && !opts.force) {
      throw new Error(`Refusing to reset: ${existing} registration(s) would be deleted with their courses. Pass --force to do it anyway.`);
    }
    await db.execute(sql.raw(`TRUNCATE TABLE ${CONTENT_TABLES.join(", ")} RESTART IDENTITY CASCADE`));
  }

  // Courses with their images and sessions: a course is seeded as a unit, only when its slug is new.
  for (const [index, { images, sessions = [], ...course }] of courseSeeds.entries()) {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(courses)
        .values({ ...course, published: true, isSample: true, sort: index + 1 })
        .onConflictDoNothing({ target: courses.slug })
        .returning();
      if (!created) return;
      await tx.insert(courseImages).values(images.map((image, i) => ({ courseId: created.id, key: image.key, alt: image.alt, sort: i })));
      if (sessions.length) await tx.insert(courseSessions).values(sessions.map((session) => ({ ...session, courseId: created.id })));
    });
  }

  await db.insert(practicePackages).values(practiceSeeds).onConflictDoNothing({ target: practicePackages.code });
  if ((await total(db, heroSlides)) === 0) await db.insert(heroSlides).values(heroSeeds);
  if ((await total(db, faq)) === 0) await db.insert(faq).values(faqSeeds.map((item, i) => ({ ...item, sort: i + 1 })));
  await db.insert(posts).values(postSeeds).onConflictDoNothing({ target: posts.slug });
  await db.insert(pages).values(pageSeeds).onConflictDoNothing({ target: pages.key });
  const [{ n: galleryCount }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(galleryItems).where(eq(galleryItems.group, TRAINER_WORKS));
  if (galleryCount === 0) await db.insert(galleryItems).values(trainerWorks.map((item, i) => ({ group: TRAINER_WORKS, key: item.key, alt: item.alt, sort: i })));
  await db.insert(campaign).values({ ...campaignSeed, id: 1 }).onConflictDoNothing({ target: campaign.id });
  await db.insert(settings).values(Object.entries(settingSeeds).map(([key, value]) => ({ key, value }))).onConflictDoNothing({ target: settings.key });

  const counts: Record<string, number> = {};
  for (const table of [courses, courseImages, courseSessions, practicePackages, heroSlides, faq, posts, pages, galleryItems, campaign, settings]) {
    counts[getTableName(table)] = await total(db, table);
  }
  return counts;
}
