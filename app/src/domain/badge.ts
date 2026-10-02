import type { Badge, BadgeLabel, StoredBadge } from "@/db/schema";
import type { Locale } from "@/i18n/locales";

// Course badges in two languages (round 2 item 1c). A stored badge may still have a plain string label (written before
// labels had a Russian text): it is read as the Estonian label, and the next save writes the new shape.

/** A badge as a card shows it: one text in the page's language. */
export type ShownBadge = { label: string; bg: string; fg: string } | null;

/** The stored label as { et, ru? }: a plain string is the Estonian text. */
export function badgeLabel(label: string | BadgeLabel | null | undefined): BadgeLabel {
  if (typeof label === "string") return { et: label };
  if (!label || typeof label !== "object") return { et: "" };
  const et = typeof label.et === "string" ? label.et : "";
  return typeof label.ru === "string" && label.ru.trim() ? { et, ru: label.ru } : { et };
}

/** A stored badge in the current shape (null for none, or one without an Estonian label). */
export function readBadge(b: StoredBadge | null | undefined): Badge {
  if (!b || typeof b !== "object") return null;
  const label = badgeLabel(b.label);
  return label.et.trim() ? { label, bg: b.bg, fg: b.fg } : null;
}

/** The badge in `locale`: the Russian text on RU pages when there is one, else the Estonian. */
export function shownBadge(b: StoredBadge | null | undefined, locale: Locale): ShownBadge {
  const badge = readBadge(b);
  if (!badge) return null;
  const text = (locale === "ru" && badge.label.ru?.trim()) || badge.label.et;
  return { label: text.trim(), bg: badge.bg, fg: badge.fg };
}
