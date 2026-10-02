import { relations } from "drizzle-orm";
import { pgTable, serial, text, integer, boolean, jsonb, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import type { I18n } from "@/i18n/field";

export const courseType = pgEnum("course_type", ["e_learning", "contact"]);
export const courseLevel = pgEnum("course_level", ["basic", "advanced"]);
export const regStatus = pgEnum("registration_status", ["awaiting_prepayment", "confirmed", "cancelled"]);
export const regKind = pgEnum("registration_kind", ["group", "individual"]);
export const payChoice = pgEnum("payment_choice", ["full", "half"]);
export const sessionStatus = pgEnum("session_status", ["scheduled", "cancelled"]);
export const requestKind = pgEnum("request_kind", ["contact", "individual", "practice", "waitlist"]);

/** A badge's text: Estonian, and Russian when Maria gave one (the RU pages fall back to the Estonian text). */
export type BadgeLabel = { et: string; ru?: string };
/** A course badge as written now. */
export type Badge = { label: BadgeLabel; bg: string; fg: string } | null;
/** A course badge as it may be stored: rows written before round 2 have a plain Estonian label (domain/badge.ts reads both). */
export type StoredBadge = Badge | { label: string; bg: string; fg: string };

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  type: courseType("type").notNull(),
  level: courseLevel("level").notNull(),
  title: jsonb("title").$type<I18n>().notNull(),
  summary: jsonb("summary").$type<I18n>().notNull(),
  body: jsonb("body").$type<I18n>().notNull(),
  outcomes: jsonb("outcomes").$type<I18n[]>().notNull().default([]),
  includes: jsonb("includes").$type<I18n[]>().notNull().default([]),
  modules: jsonb("modules").$type<I18n[]>().notNull().default([]),
  language: text("language").notNull().default("ET"),        // "ET" | "RU" | "ET / RU"
  price: integer("price"),                                     // e-learning, cents
  priceGroup: integer("price_group"),                          // contact, cents
  priceIndividual: integer("price_individual"),                // contact, cents
  accessMonths: integer("access_months"),
  videoCount: integer("video_count"),
  durationLabel: jsonb("duration_label").$type<I18n>(),        // e.g. {et:"8 ak"}
  nextDiscount: jsonb("next_discount").$type<I18n>(),
  badge: jsonb("badge").$type<StoredBadge>(),
  recommendationIds: jsonb("recommendation_ids").$type<number[]>().notNull().default([]),
  published: boolean("published").notNull().default(false),
  sort: integer("sort").notNull().default(0),
  isSample: boolean("is_sample").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("courses_slug").on(t.slug)]);

export const courseImages = pgTable("course_images", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  key: text("key").notNull(),                                  // R2 key or "/seed/…" static path
  alt: jsonb("alt").$type<I18n>(),
  sort: integer("sort").notNull().default(0),
}, (t) => [index("course_images_course").on(t.courseId)]);

export const courseSessions = pgTable("course_sessions", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  city: text("city").notNull(),
  venue: text("venue").notNull().default(""),
  language: text("language").notNull().default("ET"),
  capacity: integer("capacity").notNull().default(4),
  status: sessionStatus("status").notNull().default("scheduled"),
});

export const registrations = pgTable("registrations", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => courses.id),
  courseSessionId: integer("course_session_id").references(() => courseSessions.id),
  kind: regKind("kind").notNull(),
  name: text("name").notNull(), email: text("email").notNull(), phone: text("phone").notNull().default(""),
  paymentChoice: payChoice("payment_choice").notNull(),
  wantsModelHelp: boolean("wants_model_help").notNull().default(false),
  wantsAccount: boolean("wants_account").notNull().default(false),
  preferredPeriod: text("preferred_period").notNull().default(""),
  message: text("message").notNull().default(""),
  locale: text("locale").notNull().default("et"),
  status: regStatus("status").notNull().default("awaiting_prepayment"),
  paidCents: integer("paid_cents").notNull().default(0),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const requests = pgTable("requests", {
  id: serial("id").primaryKey(),
  kind: requestKind("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, string | boolean | number>>().notNull(),
  handled: boolean("handled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const practicePackages = pgTable("practice_packages", {
  code: text("code").primaryKey(),                             // "MINI" | "MAXI"
  name: jsonb("name").$type<I18n>().notNull(),
  tagline: jsonb("tagline").$type<I18n>().notNull(),
  models: integer("models").notNull(),
  durationLabel: jsonb("duration_label").$type<I18n>().notNull(),
  price: integer("price").notNull(),
  items: jsonb("items").$type<I18n[]>().notNull().default([]),
  sort: integer("sort").notNull().default(0),
});

export const heroSlides = pgTable("hero_slides", {
  id: serial("id").primaryKey(),
  imageKey: text("image_key").notNull(), imagePos: text("image_pos").notNull().default("50% 50%"),
  imagePosMobile: text("image_pos_mobile").notNull().default("50% 50%"),
  tone: text("tone").$type<"light" | "dark">().notNull().default("light"),
  kicker: jsonb("kicker").$type<I18n>().notNull(), title: jsonb("title").$type<I18n>().notNull(),
  text: jsonb("text").$type<I18n>().notNull(),
  ctaLabel: jsonb("cta_label").$type<I18n>().notNull(), ctaHref: text("cta_href").notNull(),
  active: boolean("active").notNull().default(true), sort: integer("sort").notNull().default(0),
});

export const faq = pgTable("faq", { id: serial("id").primaryKey(), q: jsonb("q").$type<I18n>().notNull(), a: jsonb("a").$type<I18n>().notNull(), sort: integer("sort").notNull().default(0) });

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(), slug: text("slug").notNull(),
  title: jsonb("title").$type<I18n>().notNull(), excerpt: jsonb("excerpt").$type<I18n>().notNull(),
  body: jsonb("body").$type<I18n>().notNull(), category: jsonb("category").$type<I18n>().notNull(),
  coverKey: text("cover_key").notNull(), publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  published: boolean("published").notNull().default(false),
}, (t) => [uniqueIndex("posts_slug").on(t.slug)]);

export const pages = pgTable("pages", { key: text("key").primaryKey(), title: jsonb("title").$type<I18n>().notNull(), body: jsonb("body").$type<I18n>().notNull() });
// keys: "trainer_bio", "center_story", "trainer_journey", "privacy", "terms", "statement"

export const galleryItems = pgTable("gallery_items", { id: serial("id").primaryKey(), group: text("group").notNull(), key: text("key").notNull(), alt: jsonb("alt").$type<I18n>(), sort: integer("sort").notNull().default(0) });
// group: "trainer_works"

export const campaign = pgTable("campaign", {
  id: integer("id").primaryKey().default(1), active: boolean("active").notNull().default(true),
  kicker: jsonb("kicker").$type<I18n>().notNull(), title: jsonb("title").$type<I18n>().notNull(), text: jsonb("text").$type<I18n>().notNull(),
  code: text("code").notNull().default(""), ctaLabel: jsonb("cta_label").$type<I18n>().notNull(), ctaHref: text("cta_href").notNull(),
  imageKey: text("image_key").notNull(),
});

export const subscribers = pgTable("subscribers", {
  id: serial("id").primaryKey(), email: text("email").notNull(), locale: text("locale").notNull().default("et"),
  token: text("token").notNull(), consentAt: timestamp("consent_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, (t) => [uniqueIndex("subscribers_email").on(t.email)]);

export const settings = pgTable("settings", { key: text("key").primaryKey(), value: jsonb("value").notNull() });
// keys: "contact" {email, phone, address, instagram, facebook}, "newsletter" {discountLabel}, "trainer" {portraitKey, name, role: I18n, stats: [{value,label:I18n}]}

export const authTokens = pgTable("auth_tokens", { hash: text("hash").primaryKey(), email: text("email").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), usedAt: timestamp("used_at", { withTimezone: true }) });
export const adminSessions = pgTable("admin_sessions", { idHash: text("id_hash").primaryKey(), email: text("email").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull() });

// Relations (used by db.query.*.findMany({ with }))
export const coursesRelations = relations(courses, ({ many }) => ({
  images: many(courseImages),
  sessions: many(courseSessions),
}));
export const courseImagesRelations = relations(courseImages, ({ one }) => ({
  course: one(courses, { fields: [courseImages.courseId], references: [courses.id] }),
}));
export const courseSessionsRelations = relations(courseSessions, ({ one }) => ({
  course: one(courses, { fields: [courseSessions.courseId], references: [courses.id] }),
}));
export const registrationsRelations = relations(registrations, ({ one }) => ({
  course: one(courses, { fields: [registrations.courseId], references: [courses.id] }),
  courseSession: one(courseSessions, { fields: [registrations.courseSessionId], references: [courseSessions.id] }),
}));

export type Course = typeof courses.$inferSelect;
export type CourseImage = typeof courseImages.$inferSelect;
export type CourseSession = typeof courseSessions.$inferSelect;
export type Registration = typeof registrations.$inferSelect;
export type Request = typeof requests.$inferSelect;
export type PracticePackage = typeof practicePackages.$inferSelect;
export type HeroSlide = typeof heroSlides.$inferSelect;
export type FaqItem = typeof faq.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type GalleryItem = typeof galleryItems.$inferSelect;
export type Campaign = typeof campaign.$inferSelect;
export type Subscriber = typeof subscribers.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type AuthToken = typeof authTokens.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
