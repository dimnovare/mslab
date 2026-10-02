import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

// The app runs on Next.js itself (Vercel), not on Cloudflare Workers: no app code may depend on the Cloudflare runtime
// again (the OpenNext adapter, the Worker's `cloudflare:*` modules, its bindings). Images stay on R2, reached through
// its S3 API (server/r2.ts), which needs none of these.

const ROOT = process.cwd();
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

/** Every code file under `dir`, relative to the app folder with forward slashes. */
function codeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return codeFiles(path);
    return CODE.test(e.name) ? [relative(ROOT, path).split("\\").join("/")] : [];
  });
}

const RULES: [what: string, pattern: RegExp][] = [
  ["imports @opennextjs/cloudflare", /["'`]@opennextjs\/cloudflare(\/[^"'`]*)?["'`]/],
  ["imports a cloudflare:* module", /["'`]cloudflare:[^"'`]*["'`]/],
  ["uses getCloudflareContext", /\bgetCloudflareContext\b/],
  ["uses R2Bucket", /\bR2Bucket\b/],
  ["uses KVNamespace", /\bKVNamespace\b/],
  ["uses D1Database", /\bD1Database\b/],
];

/** "<file>: <what>" for every rule a file breaks. */
function offences(files: string[]): string[] {
  return files.flatMap((file) => {
    const text = readFileSync(join(ROOT, file), "utf8");
    return RULES.filter(([, pattern]) => pattern.test(text)).map(([what]) => `${file}: ${what}`);
  });
}

describe("no Cloudflare runtime in the app", () => {
  test("no file under src imports @opennextjs/cloudflare or cloudflare:*, or uses getCloudflareContext, R2Bucket, KVNamespace, D1Database", () => {
    const files = codeFiles(join(ROOT, "src"));
    expect(files.length).toBeGreaterThan(100); // the walk found the app (a wrong folder would pass with nothing)
    expect(offences(files)).toEqual([]);
  });

  test("next.config.ts does not load the OpenNext adapter either", () => {
    expect(offences(["next.config.ts"])).toEqual([]);
    expect(readFileSync(join(ROOT, "next.config.ts"), "utf8")).not.toMatch(/initOpenNextCloudflareForDev/);
  });

  test("the rules catch what they are meant to (each one on a sample line)", () => {
    const samples = [
      'import { getCloudflareContext } from "@opennextjs/cloudflare";',
      "import x from '@opennextjs/cloudflare/overrides/queue/memory-queue';",
      'import { env } from "cloudflare:workers";',
      "const db = ctx.env.DB as D1Database;",
      "type Env = { MEDIA: R2Bucket; KV: KVNamespace };",
    ];
    const caught = new Set(samples.flatMap((s) => RULES.filter(([, p]) => p.test(s)).map(([what]) => what)));
    expect([...caught].sort()).toEqual(RULES.map(([what]) => what).sort());
    // and leave ordinary code alone
    for (const fine of ['import { r2Store } from "./r2";', "const url = `https://${id}.r2.cloudflarestorage.com/`;", "// Cloudflare R2, through its S3 API"])
      expect(RULES.filter(([, p]) => p.test(fine)).map(([what]) => what), fine).toEqual([]);
  });
});
