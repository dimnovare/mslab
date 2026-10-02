import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Global constraint: only the colour tokens of src/styles/tokens.css. The course components (catalogue, cards, course
// page, buying, galleries) had prototype B's greys as literals (Task 8 / 14 review, Task 16 item 9); they now use the
// tokens, and a literal colour in them fails here.

const COURSE_CSS = [
  "src/components/site/CourseActions.module.css",
  "src/components/site/CourseBuy.module.css",
  "src/components/site/CourseCard.module.css",
  "src/components/site/CourseLists.module.css",
  "src/components/site/CourseSummary.module.css",
  "src/components/site/CatalogueFilters.module.css",
  "src/components/site/FormatExplainer.module.css",
  "src/components/site/Recommendations.module.css",
  "src/components/site/Gallery.module.css",
  "src/components/site/PurchaseInterest.module.css",
  "src/app/[locale]/(site)/koolitused/catalogue.module.css",
  "src/app/[locale]/(site)/koolitused/[slug]/course.module.css",
];

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""); // comments aside
const LITERAL = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi;

describe("colour tokens only (item 9)", () => {
  test.each(COURSE_CSS)("%s has no colour literals", (file) => {
    expect(read(file).match(LITERAL) ?? []).toEqual([]);
  });

  test("the course components mix colours from tokens only", () => {
    for (const file of COURSE_CSS)
      for (const [mix] of read(file).matchAll(/color-mix\([^;]*\)/g))
        expect(mix.replace(/var\(--[a-z0-9-]+\)|in srgb|transparent|\d+%|[\s,()]|color-mix/g, ""), `${file}: ${mix}`).toBe("");
  });

  test("the text shades in tokens.css are mixed from palette tokens", () => {
    const tokens = read("src/styles/tokens.css");
    for (const name of ["ink-soft", "muted", "muted-2"]) {
      const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens)?.[1] ?? "";
      expect(value, name).toMatch(/^color-mix\(in srgb, var\(--(ink|rose|fog)\) \d+%, var\(--(ink|rose|fog)\)\)$/);
    }
  });
});
