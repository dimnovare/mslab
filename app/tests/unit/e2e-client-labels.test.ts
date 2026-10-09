import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

// Every account test signs in as `e2e-client-<label>-<project>@example.test` with an e-course `e2e-konto-<label>-<project>` of its own
// (tests/e2e/account.ts clientEmail, fixtures.ts accountCourseSlug), and removes those rows by address before and after it runs
// (removeClientRows). The workers share one database, so two spec files that use the same label would delete each other's client and
// course in the middle of a test: a foreign key error, or a student sent to the login page. A label belongs to one spec file.

const E2E_DIR = fileURLToPath(new URL("../e2e", import.meta.url));

type Labels = { file: string; own: string[]; prefix: string; templates: string[] };

/**
 * The labels one spec file gives its client helpers (`student(page, "fail", info.project.name)`), as the address carries them: a helper
 * may put a word in front (account-details: `details-${label}`), which `prefix` is. `templates` are labels with a part that varies
 * (`seekbox-${mode}`), up to the variable part.
 */
function labelsOf(file: string, source: string): Labels {
  const prefix = source.match(/clientEmail\(\s*`([^`$]+)\$\{/)?.[1] ?? "";
  const own = new Set<string>();
  const templates = new Set<string>();
  for (const m of source.matchAll(/(`[^`]*`|"[^"]*")\s*,\s*info\.project\.name\b/g)) {
    const label = m[1].slice(1, -1);
    const at = label.indexOf("${");
    if (at < 0) own.add(prefix + label);
    else templates.add(prefix + label.slice(0, at));
  }
  return { file, own: [...own], prefix, templates: [...templates] };
}

// the specs that make clients: the ones that remove their rows
const specs = readdirSync(E2E_DIR)
  .filter((f) => f.endsWith(".spec.ts"))
  .map((f) => ({ f, source: readFileSync(`${E2E_DIR}/${f}`, "utf8") }))
  .filter(({ source }) => source.includes("removeClientRows"))
  .map(({ f, source }) => labelsOf(f, source));

describe("e2e client labels", () => {
  test("the specs that make clients are found, with their labels", () => {
    expect(specs.length).toBeGreaterThan(8);
    expect(specs.find((s) => s.file === "lesson-player.spec.ts")!.own).toContain("seek");
    expect(specs.find((s) => s.file === "account-details.spec.ts")!.prefix).toBe("details-");
  });

  test("a label is used by one spec file only: the workers share the database, and a test removes its client's rows by address", () => {
    const owners = new Map<string, Set<string>>();
    for (const s of specs) for (const label of s.own) owners.set(label, (owners.get(label) ?? new Set()).add(s.file));
    const shared = [...owners].filter(([, files]) => files.size > 1).map(([label, files]) => `"${label}": ${[...files].join(", ")}`);
    expect(shared).toEqual([]);
  });

  test("no label starts with the word another spec file puts in front of its own (`adm-`, `details-`, `fav-`) or builds a label from", () => {
    const clashes: string[] = [];
    for (const a of specs)
      for (const start of [a.prefix, ...a.templates].filter(Boolean))
        for (const b of specs.filter((s) => s.file !== a.file))
          for (const label of b.own) if (label.startsWith(start)) clashes.push(`"${label}" (${b.file}) starts with "${start}" (${a.file})`);
    expect(clashes).toEqual([]);
  });

  test("a label is lowercase letters, digits and hyphens: removeClientRows matches with LIKE, where `_` and `%` stand for other characters", () => {
    const odd = specs.flatMap((s) => [...s.own, ...s.templates].filter((l) => !/^[a-z0-9-]+$/.test(l)).map((l) => `"${l}" (${s.file})`));
    expect(odd).toEqual([]);
  });
});
