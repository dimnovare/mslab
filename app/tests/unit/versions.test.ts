import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Tripwire (Task 17, fix round 1). The page cache depends on internals of exactly these versions:
// - Next.js's page cache key "/route-cache/APP_PAGE/<hash>/$<path>" (src/server/page-store.ts);
// - OpenNext's D1 tag cache table, row format and freshness rules (src/server/tag-cache.ts), which the cached-page
//   front, the admin saves and the session cron read and write directly.
// package.json pins them exactly. Before changing a version here, after the upgrade:
//   1. npx vitest run tests/unit/tag-cache.test.ts tests/unit/page-store.test.ts tests/unit/page-front.test.ts
//   2. npx opennextjs-cloudflare build && npx wrangler dev --port 8787 --local-upstream localhost:8787
//   3. E2E_PROD_BUILD=1 E2E_BASE_URL=http://localhost:8787 npx playwright test tests/e2e/cache.spec.ts
//      tests/e2e/admin-edit.spec.ts tests/e2e/admin-site.spec.ts   (the production-build cache, admin-edit, admin-site specs)
// and only then update the versions below.

const PINNED = {
  next: "16.3.8",
  "@opennextjs/cloudflare": "1.20.7",
  "@opennextjs/aws": "4.1.6",
} as const;

const installed = (pkg: string): string => (JSON.parse(readFileSync(join(process.cwd(), "node_modules", pkg, "package.json"), "utf8")) as { version: string }).version;
const declared = (JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { dependencies: Record<string, string> }).dependencies;

const RERUN =
  "the page cache reads internals of this exact version: rerun the production-build cache, admin-edit and admin-site " +
  "specs (E2E_PROD_BUILD=1, see this file) before updating the pinned version in tests/unit/versions.test.ts";

describe("the versions the page cache was verified with", () => {
  for (const [pkg, version] of Object.entries(PINNED)) {
    test(`${pkg} ${version}`, () => {
      expect(installed(pkg), `${pkg}: ${RERUN}`).toBe(version);
    });
  }

  test("package.json pins Next.js and OpenNext exactly (no ^ or ~)", () => {
    expect(declared.next, RERUN).toBe(PINNED.next);
    expect(declared["@opennextjs/cloudflare"], RERUN).toBe(PINNED["@opennextjs/cloudflare"]);
  });
});
