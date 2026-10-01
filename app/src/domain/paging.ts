// Page-by-page lists in the admin (registrations, requests, newsletter subscribers): ?leht=<n>, 50 rows a page.

export const PAGE_SIZE = 50;
/** Upper bound for ?leht= (keeps the OFFSET sane whatever is typed into the address bar). */
export const MAX_PAGE = 100_000;

export type PageInfo = { page: number; pages: number; size: number; offset: number; total: number };

/** ?leht= → a page number ≥ 1; anything that is not a plain positive number is page 1. */
export function parsePage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^\d{1,6}$/.test(value)) return 1;
  return Math.min(Math.max(Number(value), 1), MAX_PAGE);
}

/** The page actually shown for `requested` out of `total` rows: at least 1, at most the last page (1 when empty). */
export function pageInfo(requested: number, total: number, size: number = PAGE_SIZE): PageInfo {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Math.floor(requested) || 1), pages);
  return { page, pages, size, offset: (page - 1) * size, total };
}
