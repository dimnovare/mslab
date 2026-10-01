import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "../client";
import { campaign, faq, galleryItems, heroSlides, pages, posts, practicePackages, settings } from "../schema";
import type { Campaign, FaqItem, GalleryItem, HeroSlide, Page, Post, PracticePackage } from "../schema";
import type { I18n } from "@/i18n/field";

// The site content editors' reads and writes (Task 13B): hero slides, FAQ, text pages, settings, practice packages, the
// trainer works gallery, the campaign and posts. Callers must already have checked the admin session. The readers take
// the database or an open transaction, so a save reads what it compares (the stale guard) inside its own transaction.

/** An open transaction of the Db. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** The database or a transaction. */
export type Q = Db | Tx;

/** The tables a site editor writes; a save locks the ones it touches (see lockTables). */
export const SITE_TABLES = ["campaign", "faq", "gallery_items", "hero_slides", "pages", "posts", "practice_packages", "settings"] as const;
export type SiteTable = (typeof SITE_TABLES)[number];

/**
 * Locks the tables for the rest of the transaction against other writers (EXCLUSIVE: plain reads, the public pages, go
 * on). Two admins saving the same content are so put one after the other: the second one then sees the first one's
 * change and is refused as stale. Always in the same (alphabetical) order, so two saves cannot wait on each other.
 * A table-level lock also covers rows that do not exist yet (a new FAQ item, a missing settings key).
 */
export async function lockTables(tx: Tx, tables: Iterable<SiteTable>): Promise<void> {
  const list = SITE_TABLES.filter((t) => new Set(tables).has(t));
  if (list.length) await tx.execute(sql.raw(`LOCK TABLE ${list.join(", ")} IN EXCLUSIVE MODE`));
}

// ---------- reads ----------

export const readSlides = (q: Q): Promise<HeroSlide[]> => q.select().from(heroSlides).orderBy(asc(heroSlides.sort), asc(heroSlides.id));

export const readFaq = (q: Q): Promise<FaqItem[]> => q.select().from(faq).orderBy(asc(faq.sort), asc(faq.id));

export async function readPage(q: Q, key: string): Promise<Page | null> {
  const [row] = await q.select().from(pages).where(eq(pages.key, key)).limit(1);
  return row ?? null;
}

/** A settings value, or null when the key is not stored. */
export async function readSetting(q: Q, key: string): Promise<unknown> {
  const [row] = await q.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row ? row.value : null;
}

export async function readPackage(q: Q, code: string): Promise<PracticePackage | null> {
  const [row] = await q.select().from(practicePackages).where(eq(practicePackages.code, code)).limit(1);
  return row ?? null;
}

export const readPackages = (q: Q): Promise<PracticePackage[]> => q.select().from(practicePackages).orderBy(asc(practicePackages.sort), asc(practicePackages.code));

export const readGallery = (q: Q, group: string): Promise<GalleryItem[]> =>
  q.select().from(galleryItems).where(eq(galleryItems.group, group)).orderBy(asc(galleryItems.sort), asc(galleryItems.id));

export async function readCampaign(q: Q): Promise<Campaign | null> {
  const [row] = await q.select().from(campaign).where(eq(campaign.id, 1)).limit(1);
  return row ?? null;
}

export async function readPost(q: Q, id: number): Promise<Post | null> {
  const [row] = await q.select().from(posts).where(eq(posts.id, id)).limit(1);
  return row ?? null;
}

/** Every post, drafts included, newest first. */
export const readAllPosts = (q: Q): Promise<Post[]> => q.select().from(posts).orderBy(desc(posts.publishedAt), desc(posts.id));

/** Is `slug` used by a post other than `exceptId`? */
export async function isPostSlugTaken(q: Q, slug: string, exceptId?: number | null): Promise<boolean> {
  const [row] = await q
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.slug, slug), exceptId != null ? ne(posts.id, exceptId) : undefined))
    .limit(1);
  return row !== undefined;
}

// ---------- writes (inside the save's transaction) ----------

export type SlideRow = Omit<HeroSlide, "id" | "sort">;
export type FaqRow = { q: I18n; a: I18n };
export type PackageFields = Omit<PracticePackage, "code" | "sort">;
export type PostFields = Omit<Post, "id">;

/**
 * The hero slides in this order (sort 1…n): a row with the id of a stored slide updates it (it keeps its id), one
 * without (or with an id that is not stored) is added, and stored slides that are not in `rows` are deleted.
 */
export async function saveSlides(tx: Tx, rows: (SlideRow & { id: number | null })[]): Promise<void> {
  const stored = new Set((await tx.select({ id: heroSlides.id }).from(heroSlides)).map((r) => r.id));
  const keep = rows.map((r) => r.id).filter((id): id is number => id != null && stored.has(id));
  const gone = [...stored].filter((id) => !keep.includes(id));
  if (gone.length) await tx.delete(heroSlides).where(inArray(heroSlides.id, gone));
  for (const [i, { id, ...fields }] of rows.entries()) {
    if (id != null && keep.includes(id)) await tx.update(heroSlides).set({ ...fields, sort: i + 1 }).where(eq(heroSlides.id, id));
    else await tx.insert(heroSlides).values({ ...fields, sort: i + 1 });
  }
}

/** The FAQ in this order (sort 1…n); the old rows are replaced. */
export async function replaceFaq(tx: Tx, rows: FaqRow[]): Promise<void> {
  await tx.delete(faq);
  if (rows.length) await tx.insert(faq).values(rows.map((r, i) => ({ ...r, sort: i + 1 })));
}

/** One gallery group in this order; its old rows are replaced. */
export async function replaceGalleryGroup(tx: Tx, group: string, items: { key: string; alt: I18n | null }[]): Promise<void> {
  await tx.delete(galleryItems).where(eq(galleryItems.group, group));
  if (items.length) await tx.insert(galleryItems).values(items.map((x, i) => ({ group, key: x.key, alt: x.alt, sort: i })));
}

export async function putPage(tx: Tx, key: string, page: { title: I18n; body: I18n }): Promise<void> {
  await tx.insert(pages).values({ key, ...page }).onConflictDoUpdate({ target: pages.key, set: page });
}

export async function putSetting(tx: Tx, key: string, value: unknown): Promise<void> {
  await tx.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function updatePackage(tx: Tx, code: string, fields: PackageFields): Promise<void> {
  await tx.update(practicePackages).set(fields).where(eq(practicePackages.code, code));
}

export async function putCampaign(tx: Tx, fields: Omit<Campaign, "id">): Promise<void> {
  await tx.insert(campaign).values({ ...fields, id: 1 }).onConflictDoUpdate({ target: campaign.id, set: fields });
}

export async function insertPost(tx: Tx, fields: PostFields): Promise<Post> {
  const [row] = await tx.insert(posts).values(fields).returning();
  return row;
}

export async function updatePost(tx: Tx, id: number, fields: PostFields): Promise<void> {
  await tx.update(posts).set(fields).where(eq(posts.id, id));
}

/** Deletes a post; false when it did not exist. */
export async function deletePostRow(q: Q, id: number): Promise<boolean> {
  const rows = await q.delete(posts).where(eq(posts.id, id)).returning();
  return rows.length > 0;
}
