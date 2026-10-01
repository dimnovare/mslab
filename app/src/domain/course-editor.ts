// The course editor's model, shared by the browser (components/admin/CourseEditor.tsx) and the server
// (server/admin-content.ts): the draft the editor holds and sends, the badge choices of prototype D, and the limits.
// Pure: no database, no React.

import type { Badge } from "@/db/schema";
import type { I18n } from "@/i18n/field";
import { centsToInput } from "./money";

export type CourseType = "e_learning" | "contact";
export type CourseLevel = "basic" | "advanced";
export const COURSE_LANGUAGES = ["ET", "RU", "ET / RU"] as const;
export type CourseLanguage = (typeof COURSE_LANGUAGES)[number];

/** Prototype D adminBadges: the quick labels. */
export const BADGE_PRESETS = ["Uus", "Populaarne", "Bestseller", "Enim müüdud", "Viimased kohad", "Soodus"] as const;
/** D's "Oma tekst (kuni 18 märki)". */
export const BADGE_MAX = 18;

/**
 * D's colour swatches, each a background from the palette with its readable text colour. Only these can be stored
 * (D's free colour picker is left out: every badge stays in the site palette).
 */
export const BADGE_SWATCHES = [
  { id: "tint", bg: "#222222", fg: "#ffffff" },
  { id: "orchid", bg: "#DDD4DC", fg: "#222222" },
  { id: "rose", bg: "#9E8993", fg: "#ffffff" },
  { id: "plum", bg: "#6B4F5C", fg: "#ffffff" },
  { id: "light", bg: "#FFFFFF", fg: "#222222" },
] as const;
export type SwatchId = (typeof BADGE_SWATCHES)[number]["id"];

/** The swatch a stored badge uses (by background, any case), or null for a colour that is not one of them. */
export function swatchOf(badge: Badge): SwatchId | null {
  if (!badge) return null;
  return BADGE_SWATCHES.find((s) => s.bg.toLowerCase() === badge.bg.toLowerCase())?.id ?? null;
}

/** The stored badge for a label and a swatch: null without a label. */
export function badgeOf(label: string, swatch: SwatchId): Badge {
  const text = label.trim();
  if (!text) return null;
  const s = BADGE_SWATCHES.find((x) => x.id === swatch)!;
  return { label: text, bg: s.bg, fg: s.fg };
}

export const LIMITS = {
  title: 120,
  summary: 300,
  body: 10_000,
  item: 300,
  items: 40,
  duration: 60,
  discount: 120,
  alt: 200,
  images: 20,
  recommendations: 3,
  accessMonths: 120,
  videoCount: 999,
};

export type DraftImage = { key: string; alt: I18n };

/** What the editor holds and sends (JSON). Amounts and counts are the text as typed; the server parses them. */
export type CourseDraft = {
  id: number | null;
  /** The course's updatedAt when the editor loaded it (ISO); the save is refused when it has changed since. */
  version: string | null;
  type: CourseType;
  level: CourseLevel;
  slug: string;
  language: CourseLanguage;
  title: I18n;
  summary: I18n;
  body: I18n;
  outcomes: I18n[];
  modules: I18n[];
  includes: I18n[];
  price: string;
  priceGroup: string;
  priceIndividual: string;
  accessMonths: string;
  videoCount: string;
  durationLabel: I18n;
  nextDiscount: I18n;
  badge: Badge;
  images: DraftImage[];
  recommendationIds: number[];
  published: boolean;
  isSample: boolean;
};

const empty = (): I18n => ({ et: "" });
const copy = (f: I18n | null | undefined): I18n => (f ? { et: f.et ?? "", ...(f.ru !== undefined ? { ru: f.ru } : {}) } : empty());
const amount = (cents: number | null) => (cents == null ? "" : centsToInput(cents));
const whole = (n: number | null) => (n == null ? "" : String(n));

/** A new course: contact, basic, ET, not published. */
export function newCourseDraft(): CourseDraft {
  return {
    id: null,
    version: null,
    type: "contact",
    level: "basic",
    slug: "",
    language: "ET",
    title: empty(),
    summary: empty(),
    body: empty(),
    outcomes: [],
    modules: [],
    includes: [],
    price: "",
    priceGroup: "",
    priceIndividual: "",
    accessMonths: "",
    videoCount: "",
    durationLabel: empty(),
    nextDiscount: empty(),
    badge: null,
    images: [],
    recommendationIds: [],
    published: false,
    isSample: false,
  };
}

type StoredCourse = {
  id: number;
  updatedAt: Date;
  type: CourseType;
  level: CourseLevel;
  slug: string;
  language: string;
  title: I18n;
  summary: I18n;
  body: I18n;
  outcomes: I18n[];
  modules: I18n[];
  includes: I18n[];
  price: number | null;
  priceGroup: number | null;
  priceIndividual: number | null;
  accessMonths: number | null;
  videoCount: number | null;
  durationLabel: I18n | null;
  nextDiscount: I18n | null;
  badge: Badge;
  recommendationIds: number[];
  published: boolean;
  isSample: boolean;
  images: { key: string; alt: I18n | null }[];
};

/** The editor's draft of a stored course. */
export function draftFromCourse(c: StoredCourse): CourseDraft {
  return {
    id: c.id,
    version: c.updatedAt.toISOString(),
    type: c.type,
    level: c.level,
    slug: c.slug,
    language: (COURSE_LANGUAGES as readonly string[]).includes(c.language) ? (c.language as CourseLanguage) : "ET",
    title: copy(c.title),
    summary: copy(c.summary),
    body: copy(c.body),
    outcomes: c.outcomes.map(copy),
    modules: c.modules.map(copy),
    includes: c.includes.map(copy),
    price: amount(c.price),
    priceGroup: amount(c.priceGroup),
    priceIndividual: amount(c.priceIndividual),
    accessMonths: whole(c.accessMonths),
    videoCount: whole(c.videoCount),
    durationLabel: copy(c.durationLabel),
    nextDiscount: copy(c.nextDiscount),
    badge: c.badge ? { ...c.badge } : null,
    images: c.images.map((img) => ({ key: img.key, alt: copy(img.alt) })),
    recommendationIds: [...c.recommendationIds],
    published: c.published,
    isSample: c.isSample,
  };
}

/** Moves item `from` to position `to` (both clamped); a new array. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length) return out;
  const target = Math.max(0, Math.min(out.length - 1, to));
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item);
  return out;
}
