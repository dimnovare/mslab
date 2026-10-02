import type { CourseWithImages } from "@/db/queries/public";
import { shownBadge } from "@/domain/badge";
import { fromPrice, priceOptions } from "@/domain/course";
import { formatEUR } from "@/domain/money";
import { pick } from "@/i18n/field";
import { formatDayMonth } from "@/i18n/format";
import type { Dict, Locale } from "@/i18n/locales";
import { mediaUrl } from "@/lib/media";
import type { CourseCardData } from "./CourseCard";

/**
 * Card data for a course (home, catalogue, recommendations): B card with the type's chip and level,
 * D meta line (next date + city for contact, "Veebis · alusta kohe" for e-learning), price "alates" when there are two.
 */
export function courseCardData(
  c: CourseWithImages,
  next: { startsAt: Date; city: string } | undefined,
  l: Locale,
  d: Dict,
  to: (path: string) => string,
): CourseCardData {
  const title = pick(c.title, l);
  const image = c.images[0];
  const from = fromPrice(c);
  const online = c.type === "e_learning";
  return {
    id: c.id,
    type: c.type,
    href: to(`/koolitused/${c.slug}`),
    title,
    summary: pick(c.summary, l),
    image: image ? mediaUrl(image.key) : "",
    imageAlt: pick(image?.alt, l) || title,
    badge: shownBadge(c.badge, l),
    tags: [online ? d.formats.elearning.name : d.formats.contact.name, c.level === "basic" ? d.course.levelBasic : d.course.levelAdvanced],
    meta: online ? { text: d.catalogue.onlineStart } : next ? { lead: formatDayMonth(next.startsAt, l), text: next.city } : { text: d.formats.contact.short },
    price: from == null ? "" : priceOptions(c).length > 1 ? `${d.catalogue.from} ${formatEUR(from, l)}` : formatEUR(from, l),
  };
}
