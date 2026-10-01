// Pure rules for the practice page (/praktika) (no database, no React).

/** ?pakett=MINI preselects a practice package; the code is matched without regard to case. Unknown → null. */
export function parsePackage(value: string | string[] | null | undefined, codes: string[]): string | null {
  const v = (Array.isArray(value) ? (value[0] ?? "") : (value ?? "")).trim().toUpperCase();
  return v ? (codes.find((c) => c.toUpperCase() === v) ?? null) : null;
}
