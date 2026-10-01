import type { Course } from "@/db/schema";

type P = Pick<Course, "type" | "price" | "priceGroup" | "priceIndividual">;

export type PriceOption = { kind: "full" | "group" | "individual"; cents: number };

export function priceOptions(c: P): PriceOption[] {
  if (c.type === "e_learning") return c.price != null ? [{ kind: "full", cents: c.price }] : [];
  const out: PriceOption[] = [];
  if (c.priceGroup != null) out.push({ kind: "group", cents: c.priceGroup });
  if (c.priceIndividual != null) out.push({ kind: "individual", cents: c.priceIndividual });
  return out;
}

export function fromPrice(c: P): number | null {
  const o = priceOptions(c);
  return o.length ? Math.min(...o.map((x) => x.cents)) : null;
}

export function participationKinds(c: P): ("group" | "individual")[] {
  return priceOptions(c).filter((o) => o.kind !== "full").map((o) => o.kind as "group" | "individual");
}
