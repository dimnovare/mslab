import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { campaign, courseImages, courseSessions, courses, faq, galleryItems, heroSlides, pages, posts, practicePackages, registrations, requests, settings, subscribers } from "../schema";
import type { Campaign, Course, CourseImage, CourseSession, FaqItem, GalleryItem, HeroSlide, Page, Post, PracticePackage, Registration, Request as RequestRow, Subscriber } from "../schema";
import type { RegStatus } from "@/domain/registration";
import type { I18n } from "@/i18n/field";

// Admin (write) queries. Callers must already have checked the admin session; nothing here does authorization.

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];
/** Insert shape with an optional id: with an id the row is updated, without one it is created. */
type WithOptionalId<T> = Omit<T, "id"> & { id?: number };

export type CourseInput = WithOptionalId<Omit<Insert<typeof courses>, "updatedAt">>;
export type SessionInput = WithOptionalId<Insert<typeof courseSessions>>;
export type PracticePackageInput = Insert<typeof practicePackages>;
export type HeroSlideInput = WithOptionalId<Insert<typeof heroSlides>>;
export type FaqInput = WithOptionalId<Insert<typeof faq>>;
export type PostInput = WithOptionalId<Insert<typeof posts>>;
export type PageInput = Insert<typeof pages>;
export type CampaignInput = Omit<Insert<typeof campaign>, "id">;
export type ImageInput = { key: string; alt?: I18n | null };
export type RegistrationRow = Registration & { course: Course; courseSession: CourseSession | null };
export type RegistrationFilter = { type?: "e_learning" | "contact"; status?: RegStatus };

function required<T>(row: T | undefined, what: string, id: number): T {
  if (row === undefined) throw new Error(`${what} ${id} not found`);
  return row;
}

// ---------- courses ----------

/** Creates or updates a course (by `id` when given, otherwise by unique `slug`). Always refreshes `updatedAt`. */
export async function upsertCourse(db: Db, input: CourseInput): Promise<Course> {
  const { id, ...fields } = input;
  const values = { ...fields, updatedAt: new Date() };
  if (id != null) {
    const [row] = await db.update(courses).set(values).where(eq(courses.id, id)).returning();
    return required(row, "Course", id);
  }
  const [row] = await db.insert(courses).values(values).onConflictDoUpdate({ target: courses.slug, set: values }).returning();
  return row;
}

/** Replaces the whole image list of a course; order of `images` becomes the display order. */
export async function replaceCourseImages(db: Db, courseId: number, images: ImageInput[]): Promise<CourseImage[]> {
  return db.transaction(async (tx) => {
    await tx.delete(courseImages).where(eq(courseImages.courseId, courseId));
    if (images.length === 0) return [];
    return tx
      .insert(courseImages)
      .values(images.map((img, i) => ({ courseId, key: img.key, alt: img.alt ?? null, sort: i })))
      .returning();
  });
}

export async function upsertSession(db: Db, input: SessionInput): Promise<CourseSession> {
  const { id, ...fields } = input;
  if (id != null) {
    const [row] = await db.update(courseSessions).set(fields).where(eq(courseSessions.id, id)).returning();
    return required(row, "Session", id);
  }
  const [row] = await db.insert(courseSessions).values(fields).returning();
  return row;
}

// ---------- registrations and requests ----------

/** Manual status change by Maria (e.g. confirm after the prepayment arrived). Returns null when the id does not exist. */
export async function setRegistrationStatus(db: Db, id: number, status: RegStatus, note?: string): Promise<Registration | null> {
  const [row] = await db
    .update(registrations)
    .set(note === undefined ? { status } : { status, note })
    .where(eq(registrations.id, id))
    .returning();
  return row ?? null;
}

/** Registrations with their course and session, newest first. `type` filters by the course type. */
export async function listRegistrations(db: Db, filter: RegistrationFilter = {}): Promise<RegistrationRow[]> {
  const rows = await db
    .select({ registration: registrations, course: courses, courseSession: courseSessions })
    .from(registrations)
    .innerJoin(courses, eq(registrations.courseId, courses.id))
    .leftJoin(courseSessions, eq(registrations.courseSessionId, courseSessions.id))
    .where(and(filter.type ? eq(courses.type, filter.type) : undefined, filter.status ? eq(registrations.status, filter.status) : undefined))
    .orderBy(desc(registrations.createdAt), desc(registrations.id));
  return rows.map((r) => ({ ...r.registration, course: r.course, courseSession: r.courseSession }));
}

export async function listRequests(db: Db, kind?: RequestRow["kind"]): Promise<RequestRow[]> {
  return db
    .select()
    .from(requests)
    .where(kind ? eq(requests.kind, kind) : undefined)
    .orderBy(desc(requests.createdAt), desc(requests.id));
}

export async function markRequestHandled(db: Db, id: number): Promise<RequestRow | null> {
  const [row] = await db.update(requests).set({ handled: true }).where(eq(requests.id, id)).returning();
  return row ?? null;
}

// ---------- practice, home, content ----------

export async function upsertPracticePackage(db: Db, input: PracticePackageInput): Promise<PracticePackage> {
  const [row] = await db.insert(practicePackages).values(input).onConflictDoUpdate({ target: practicePackages.code, set: input }).returning();
  return row;
}

export async function upsertHeroSlide(db: Db, input: HeroSlideInput): Promise<HeroSlide> {
  const { id, ...fields } = input;
  if (id != null) {
    const [row] = await db.update(heroSlides).set(fields).where(eq(heroSlides.id, id)).returning();
    return required(row, "Hero slide", id);
  }
  const [row] = await db.insert(heroSlides).values(fields).returning();
  return row;
}

export async function deleteHeroSlide(db: Db, id: number): Promise<void> {
  await db.delete(heroSlides).where(eq(heroSlides.id, id));
}

export async function upsertFaq(db: Db, input: FaqInput): Promise<FaqItem> {
  const { id, ...fields } = input;
  if (id != null) {
    const [row] = await db.update(faq).set(fields).where(eq(faq.id, id)).returning();
    return required(row, "FAQ item", id);
  }
  const [row] = await db.insert(faq).values(fields).returning();
  return row;
}

export async function deleteFaq(db: Db, id: number): Promise<void> {
  await db.delete(faq).where(eq(faq.id, id));
}

/** Creates or updates a post (by `id` when given, otherwise by unique `slug`). */
export async function upsertPost(db: Db, input: PostInput): Promise<Post> {
  const { id, ...fields } = input;
  if (id != null) {
    const [row] = await db.update(posts).set(fields).where(eq(posts.id, id)).returning();
    return required(row, "Post", id);
  }
  const [row] = await db.insert(posts).values(fields).onConflictDoUpdate({ target: posts.slug, set: fields }).returning();
  return row;
}

export async function upsertPage(db: Db, input: PageInput): Promise<Page> {
  const [row] = await db.insert(pages).values(input).onConflictDoUpdate({ target: pages.key, set: input }).returning();
  return row;
}

/** Replaces the images of one gallery group; order of `items` becomes the display order. */
export async function replaceGallery(db: Db, group: string, items: ImageInput[]): Promise<GalleryItem[]> {
  return db.transaction(async (tx) => {
    await tx.delete(galleryItems).where(eq(galleryItems.group, group));
    if (items.length === 0) return [];
    return tx
      .insert(galleryItems)
      .values(items.map((item, i) => ({ group, key: item.key, alt: item.alt ?? null, sort: i })))
      .returning();
  });
}

/** The campaign popup is a single row (id 1). */
export async function upsertCampaign(db: Db, input: CampaignInput): Promise<Campaign> {
  const [row] = await db.insert(campaign).values({ ...input, id: 1 }).onConflictDoUpdate({ target: campaign.id, set: input }).returning();
  return row;
}

export async function setSetting(db: Db, key: string, value: unknown): Promise<void> {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function listSubscribers(db: Db): Promise<Subscriber[]> {
  return db.select().from(subscribers).orderBy(desc(subscribers.consentAt), desc(subscribers.id));
}
