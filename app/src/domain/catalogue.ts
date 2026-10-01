// Pure rules for the catalogue (/koolitused) and the course pages (no database, no React).

export type FormatFilter = "all" | "e" | "k";
export type LevelFilter = "all" | "baas" | "taiend";
type CourseType = "e_learning" | "contact";
type CourseLevel = "basic" | "advanced";

/** Catalogue state in the URL: ?vorm=e|k&tase=baas|taiend. Hybrid is never a filter (K1); ?vorm=h opens its explanation. */
export type CatalogueQuery = { vorm: FormatFilter; tase: LevelFilter; hybrid: boolean };

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

export function parseCatalogueQuery(params: Params): CatalogueQuery {
  const vorm = first(params.vorm);
  const tase = first(params.tase);
  return {
    vorm: vorm === "e" || vorm === "k" ? vorm : "all",
    tase: tase === "baas" || tase === "taiend" ? tase : "all",
    hybrid: vorm === "h",
  };
}

/** The query string for a catalogue state ("" when nothing is filtered). */
export function catalogueSearch(q: { vorm: FormatFilter; tase: LevelFilter }): string {
  const p = new URLSearchParams();
  if (q.vorm !== "all") p.set("vorm", q.vorm);
  if (q.tase !== "all") p.set("tase", q.tase);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Lowercase without diacritics, so "summeetria" finds "sümmeetria" and "LAMI" finds "lami". */
export function normalizeSearch(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export type CatalogueItem = { type: CourseType; level: CourseLevel; /** normalized title + summary */ text: string };

export function matchesCatalogue(c: CatalogueItem, f: { vorm: FormatFilter; tase: LevelFilter; search: string }): boolean {
  if (f.vorm === "e" && c.type !== "e_learning") return false;
  if (f.vorm === "k" && c.type !== "contact") return false;
  if (f.tase === "baas" && c.level !== "basic") return false;
  if (f.tase === "taiend" && c.level !== "advanced") return false;
  const q = normalizeSearch(f.search);
  return !q || c.text.includes(q);
}

/** D's format card text: the first sentence of the definition. */
export function firstSentence(text: string): string {
  const t = text.trim();
  const i = t.indexOf(". ");
  return i < 0 ? t : t.slice(0, i + 1);
}

/**
 * Courses that may be recommended on a course page: the same type (a contact page stays about contact courses,
 * an e-learning page about e-learning, K2) plus whatever Maria picked by hand, which may be of either type.
 */
export function recommendationPool<T extends { id: number; type: CourseType }>(
  current: { type: CourseType; recommendationIds: number[] },
  all: T[],
): T[] {
  return all.filter((c) => c.type === current.type || current.recommendationIds.includes(c.id));
}

/** Cities of the sessions that can still be booked, in date order, each once. */
export function bookableCities(sessions: { city: string; status: "scheduled" | "cancelled" }[]): string[] {
  return [...new Set(sessions.filter((s) => s.status !== "cancelled").map((s) => s.city.trim()).filter(Boolean))];
}

/** "?sessioon=12" preselects session 12 when it belongs to the course and can be picked; otherwise nothing is preselected. */
export function initialSession(sessions: { id: number; disabled: boolean }[], requested: string | string[] | undefined): number | null {
  const id = Number(first(requested));
  if (!Number.isInteger(id)) return null;
  return sessions.some((s) => s.id === id && !s.disabled) ? id : null;
}

/** Paragraphs of a content text (separated by a blank line). */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
