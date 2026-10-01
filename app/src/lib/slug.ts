/** Lowercase ASCII slug for URLs ("Kuidas valida ...?" -> "kuidas-valida-..."; "Kulmude LAMI" -> "kulmude-lami"). */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[õöô]/g, "o")
    .replace(/ä/g, "a")
    .replace(/ü/g, "u")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A slug as the admin may store it: a–z, 0–9 and single dashes between them, at most 80 characters. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 80;

export function isSlug(value: string): boolean {
  return value.length <= SLUG_MAX && SLUG_PATTERN.test(value);
}
