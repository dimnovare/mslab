// Favourite courses kept in this browser (P6). Phase 2 moves them into the student dashboard folder (S3).

export const FAVOURITES_KEY = "mslab-fav";
/** Fired on window after a change in this tab (the "storage" event only reaches other tabs). */
export const FAVOURITES_EVENT = "mslab-fav-change";

/** Course slugs from the stored JSON; anything malformed counts as an empty list. */
export function parseFavourites(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];
  } catch {
    return [];
  }
}

/** The list with `slug` added (at the end) or removed. */
export function toggleFavourite(list: string[], slug: string): string[] {
  return list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
}
