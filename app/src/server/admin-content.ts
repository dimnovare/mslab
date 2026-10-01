import { z } from "zod";
import type { Db } from "@/db/client";
import { courses } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { courseUsage, deleteUnusedSession, getCourseForEdit, getSession, isSlugTaken, moveCourse, saveCourseWithImages, upsertSession, type CourseFields } from "@/db/queries/admin";
import { tallinnInstant } from "@/domain/calendar";
import { BADGE_MAX, badgeOf, COURSE_LANGUAGES, LIMITS, swatchOf, type CourseDraft } from "@/domain/course-editor";
import { parseEuroCents } from "@/domain/money";
import type { I18n } from "@/i18n/field";
import { isSlug, SLUG_MAX, slugify } from "@/lib/slug";
import { isMediaKey } from "./media";

// The content editors' form handling (courses, calendar sessions). Callers have already checked the admin session
// (server/actions/admin-content.ts wraps each in adminAction); these take a Db and run without Next.js
// (tests/db/admin-content.test.ts). Nothing the browser sends is trusted: the draft is parsed and every field checked
// again here.

/** Why one field was refused (the editor shows the matching text under it). */
export type FieldError =
  | "required"
  | "tooLong"
  | "slugFormat"
  | "slugTaken"
  | "amount"
  | "whole"
  | "priceRequired"
  | "listEt"
  | "tooMany"
  | "image"
  | "badge"
  | "typeLocked"
  | "course"
  | "date"
  | "time"
  | "capacity";

/**
 * What a content form gets back. `fields`: the refused fields (with error "invalid"). stale: the course was saved
 * elsewhere since the editor loaded it (nothing saved). inUse: a session with registrations cannot be deleted.
 */
export type EditResult =
  | { ok: true; id: number; created?: boolean; deleted?: boolean }
  | { ok: false; error: "invalid" | "notFound" | "stale" | "inUse" | "server"; fields?: Record<string, FieldError> };

const ID_MAX = 2_147_483_647;
const id = z.coerce.number().int().positive().max(ID_MAX);
/** The JSON draft is at most this long (a course with 40-row lists in two languages is far below it). */
const DRAFT_MAX = 400_000;

const i18n = z.object({ et: z.string().max(20_000), ru: z.string().max(20_000).optional() });
const draftSchema = z.object({
  id: z.number().int().positive().max(ID_MAX).nullable(),
  version: z.string().max(40).nullable(),
  type: z.enum(["e_learning", "contact"]),
  level: z.enum(["basic", "advanced"]),
  slug: z.string().max(200),
  language: z.enum(COURSE_LANGUAGES),
  title: i18n,
  summary: i18n,
  body: i18n,
  outcomes: z.array(i18n).max(200),
  modules: z.array(i18n).max(200),
  includes: z.array(i18n).max(200),
  price: z.string().max(40),
  priceGroup: z.string().max(40),
  priceIndividual: z.string().max(40),
  accessMonths: z.string().max(40),
  videoCount: z.string().max(40),
  durationLabel: i18n,
  nextDiscount: i18n,
  badge: z.object({ label: z.string().max(200), bg: z.string().max(20), fg: z.string().max(20) }).nullable(),
  images: z.array(z.object({ key: z.string().max(300), alt: i18n })).max(200),
  recommendationIds: z.array(z.number().int().positive().max(ID_MAX)).max(200),
  published: z.boolean(),
  isSample: z.boolean(),
}) satisfies z.ZodType<CourseDraft>;

/** Static images shipped with the site (the seed's photos); the only image keys besides uploads. */
const SEED_IMAGE = /^\/seed\/[a-z0-9][a-z0-9._-]*\.(jpe?g|png|webp)$/i;
export const isStorableImageKey = (key: string) => isMediaKey(key) || SEED_IMAGE.test(key);

const field = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v : null;
};

/** Collects field errors while values are normalised. */
class Check {
  readonly errors: Record<string, FieldError> = {};
  fail(name: string, error: FieldError): null {
    this.errors[name] ??= error;
    return null;
  }
  get ok() {
    return Object.keys(this.errors).length === 0;
  }

  /** A text in both languages: trimmed, the Russian one left out when blank. Null when `optional` and empty. */
  text(name: string, f: I18n, max: number, opts: { required?: boolean } = {}): I18n | null {
    const et = f.et.trim();
    const ru = (f.ru ?? "").trim();
    if (et.length > max || ru.length > max) return this.fail(name, "tooLong");
    if (!et) return ru ? this.fail(name, "required") : opts.required ? this.fail(name, "required") : null;
    return ru ? { et, ru } : { et };
  }

  /** A list of texts: blank rows dropped; a row needs its Estonian text. */
  list(name: string, items: I18n[], max = LIMITS.item): I18n[] {
    const out: I18n[] = [];
    for (const item of items) {
      const et = item.et.trim();
      const ru = (item.ru ?? "").trim();
      if (!et && !ru) continue;
      if (!et) return this.fail(name, "listEt") ?? [];
      if (et.length > max || ru.length > max) return this.fail(name, "tooLong") ?? [];
      out.push(ru ? { et, ru } : { et });
    }
    if (out.length > LIMITS.items) return this.fail(name, "tooMany") ?? [];
    return out;
  }

  /** Euros as typed → cents; null when blank. */
  amount(name: string, value: string): number | null {
    if (!value.trim()) return null;
    return parseEuroCents(value) ?? this.fail(name, "amount");
  }

  /** A whole number in min…max; null when blank. */
  whole(name: string, value: string, min: number, max: number): number | null {
    const v = value.trim();
    if (!v) return null;
    if (!/^\d{1,4}$/.test(v) || Number(v) < min || Number(v) > max) return this.fail(name, "whole");
    return Number(v);
  }
}

const invalid = (errors: Record<string, FieldError>): EditResult => ({ ok: false, error: "invalid", fields: errors });

/**
 * The course editor's save. Field `data`: the editor's draft as JSON (CourseDraft). Only the chosen type's own fields
 * are stored; the other type's are emptied (a course is e-learning or contact, never both). A new course (id null)
 * is created after the others; an existing one is refused as `stale` when it was saved elsewhere since `version`.
 */
export async function saveCourseForm(db: Db, formData: FormData): Promise<EditResult> {
  const raw = field(formData, "data");
  if (!raw || raw.length > DRAFT_MAX) return { ok: false, error: "invalid" };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid" };
  }
  const parsed = draftSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  const expected = d.version ? new Date(d.version) : null;
  if (d.id != null && (!expected || Number.isNaN(expected.getTime()))) return { ok: false, error: "invalid" };

  const c = new Check();
  // A course with sessions or registrations keeps its type: an e-learning course with dated sessions would put them in
  // the public calendar (K1/K2), and the sessions could no longer be edited under a contact course.
  if (d.id != null) {
    const usage = await courseUsage(db, d.id);
    if (usage && usage.type !== d.type && (usage.sessions > 0 || usage.registrations > 0)) c.fail("type", "typeLocked");
  }
  const title = c.text("title", d.title, LIMITS.title, { required: true });
  const summary = c.text("summary", d.summary, LIMITS.summary) ?? { et: "" };
  const body = c.text("body", d.body, LIMITS.body) ?? { et: "" };
  const outcomes = c.list("outcomes", d.outcomes);
  const modules = c.list("modules", d.modules);
  const online = d.type === "e_learning";

  // the slug: typed, or made from the Estonian title
  const typed = d.slug.trim().toLowerCase();
  const slug = typed || slugify(d.title.et.trim()).slice(0, SLUG_MAX).replace(/-+$/, "");
  if (!isSlug(slug)) c.fail("slug", typed || d.title.et.trim() ? "slugFormat" : "required");
  else if (await isSlugTaken(db, slug, d.id ?? undefined)) c.fail("slug", "slugTaken");

  // the type's own fields
  const price = online ? c.amount("price", d.price) : null;
  const accessMonths = online ? c.whole("accessMonths", d.accessMonths, 1, LIMITS.accessMonths) : null;
  const videoCount = online ? c.whole("videoCount", d.videoCount, 0, LIMITS.videoCount) : null;
  const nextDiscount = online ? c.text("nextDiscount", d.nextDiscount, LIMITS.discount) : null;
  const priceGroup = online ? null : c.amount("priceGroup", d.priceGroup);
  const priceIndividual = online ? null : c.amount("priceIndividual", d.priceIndividual);
  const durationLabel = online ? null : c.text("durationLabel", d.durationLabel, LIMITS.duration);
  const includes = online ? [] : c.list("includes", d.includes);
  // a published course must be buyable / bookable
  if (d.published && online && price == null && !c.errors.price) c.fail("price", "priceRequired");
  if (d.published && !online && priceGroup == null && priceIndividual == null && !c.errors.priceGroup && !c.errors.priceIndividual) c.fail("priceGroup", "priceRequired");

  // badge: one of D's swatches and at most 18 characters, or none
  let badge: CourseFields["badge"] = null;
  if (d.badge && d.badge.label.trim()) {
    const swatch = swatchOf(d.badge);
    if (!swatch) c.fail("badge", "badge");
    else if (d.badge.label.trim().length > BADGE_MAX) c.fail("badge", "tooLong");
    else badge = badgeOf(d.badge.label, swatch);
  }

  // gallery: uploads (img/<uuid>.<ext>) and the seed's static photos only, never an outside address
  const images: { key: string; alt: I18n | null }[] = [];
  if (d.images.length > LIMITS.images) c.fail("images", "tooMany");
  for (const img of d.images.slice(0, LIMITS.images)) {
    if (!isStorableImageKey(img.key)) {
      c.fail("images", "image");
      break;
    }
    images.push({ key: img.key, alt: c.text("images", img.alt, LIMITS.alt) });
  }

  // recommendations: other existing courses, each once, at most 3, in the chosen order
  const wanted = [...new Set(d.recommendationIds)].filter((x) => x !== d.id);
  if (wanted.length > LIMITS.recommendations) c.fail("recommendationIds", "tooMany");
  const existing = wanted.length ? new Set((await db.select({ id: courses.id }).from(courses).where(inArray(courses.id, wanted))).map((r) => r.id)) : new Set<number>();
  const recommendationIds = wanted.filter((x) => existing.has(x)).slice(0, LIMITS.recommendations);

  if (!c.ok || !title) return invalid(c.errors);

  const fields: CourseFields = {
    slug,
    type: d.type,
    level: d.level,
    language: d.language,
    title,
    summary,
    body,
    outcomes,
    modules,
    includes,
    price,
    priceGroup,
    priceIndividual,
    accessMonths,
    videoCount,
    durationLabel,
    nextDiscount,
    badge,
    recommendationIds,
    published: d.published,
    isSample: d.isSample,
  };
  const saved = await saveCourseWithImages(db, { id: d.id, expected: expected ?? undefined }, fields, images);
  if (saved === "notFound" || saved === "stale") return { ok: false, error: saved };
  return { ok: true, id: saved.id, created: d.id == null };
}

/** Course list ↑ / ↓: fields id, dir ("up" | "down"). */
export async function moveCourseForm(db: Db, formData: FormData): Promise<EditResult> {
  const course = id.safeParse(field(formData, "id"));
  const dir = field(formData, "dir");
  if (!course.success || (dir !== "up" && dir !== "down")) return { ok: false, error: "invalid" };
  if (await moveCourse(db, course.data, dir === "up" ? -1 : 1)) return { ok: true, id: course.data };
  return (await getCourseForEdit(db, course.data)) ? { ok: true, id: course.data } : { ok: false, error: "notFound" };
}

// ---------- calendar ----------

const SESSION_STATUS = z.enum(["scheduled", "cancelled"]);

/**
 * The session form: id (empty for a new one), courseId (a contact course), date (YYYY-MM-DD) and time (HH:MM) in
 * Estonian time, city, venue, language (ET | RU | ET / RU), capacity (1–99), status (scheduled | cancelled).
 */
export async function saveSessionForm(db: Db, formData: FormData): Promise<EditResult> {
  const rawId = field(formData, "id") ?? "";
  const sessionId = rawId === "" ? null : id.safeParse(rawId);
  if (sessionId && !sessionId.success) return { ok: false, error: "invalid" };
  const c = new Check();

  const courseId = id.safeParse(field(formData, "courseId"));
  const course = courseId.success ? await getCourseForEdit(db, courseId.data) : null;
  if (!course || course.type !== "contact") c.fail("courseId", "course");

  const date = (field(formData, "date") ?? "").trim();
  const time = (field(formData, "time") ?? "").trim();
  if (!date) c.fail("date", "required");
  else if (!tallinnInstant(date, "12:00")) c.fail("date", "date");
  if (!time) c.fail("time", "required");
  else if (!tallinnInstant("2026-01-01", time)) c.fail("time", "time");
  const startsAt = tallinnInstant(date, time);

  const city = (field(formData, "city") ?? "").trim();
  if (!city) c.fail("city", "required");
  else if (city.length > 60) c.fail("city", "tooLong");
  const venue = (field(formData, "venue") ?? "").trim();
  if (venue.length > 120) c.fail("venue", "tooLong");
  const language = z.enum(COURSE_LANGUAGES).safeParse(field(formData, "language"));
  if (!language.success) c.fail("language", "required");
  const capacityText = (field(formData, "capacity") ?? "").trim();
  const capacity = /^\d{1,2}$/.test(capacityText) ? Number(capacityText) : NaN;
  if (!(capacity >= 1 && capacity <= 99)) c.fail("capacity", "capacity");
  const status = SESSION_STATUS.safeParse(field(formData, "status"));
  if (!status.success) return { ok: false, error: "invalid" };

  if (!c.ok || !course || !startsAt || !language.success) return invalid(c.errors);
  if (sessionId && !(await getSession(db, sessionId.data))) return { ok: false, error: "notFound" };
  const saved = await upsertSession(db, {
    ...(sessionId ? { id: sessionId.data } : {}),
    courseId: course.id,
    startsAt,
    city,
    venue,
    language: language.data,
    capacity,
    status: status.data,
  });
  return { ok: true, id: saved.id, created: !sessionId };
}

/** "Kustuta toimumine": field id. Refused (inUse) when registrations point to the session. */
export async function deleteSessionForm(db: Db, formData: FormData): Promise<EditResult> {
  const session = id.safeParse(field(formData, "id"));
  if (!session.success) return { ok: false, error: "invalid" };
  const result = await deleteUnusedSession(db, session.data);
  if (result === "deleted") return { ok: true, id: session.data, deleted: true };
  return { ok: false, error: result };
}
