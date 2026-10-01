import type { Course } from "@/db/schema";

export function recommend(current: Course, all: Course[], n = 3): Course[] {
  const pool = all.filter((c) => c.published && c.id !== current.id);
  const manual = current.recommendationIds.map((id) => pool.find((c) => c.id === id)).filter(Boolean) as Course[];
  const score = (c: Course) => (c.type === current.type ? 2 : 0) + (c.level === current.level ? 1 : 0);
  const rest = pool.filter((c) => !manual.includes(c)).sort((a, b) => score(b) - score(a) || a.sort - b.sort);
  return [...manual, ...rest].slice(0, n);
}
