import { describe, expect, test, vi } from "vitest";

// The database client is one per Worker request (worker.ts runs each request in its own scope), not one per "React
// request": after a CPU-limit kill React's cache() can no longer tell requests apart (../lost-react-request.ts).

vi.mock("react", async (original) => (await import("../lost-react-request")).lostReactRequest(original));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({
  // never connected to: postgres.js connects on the first query, and these tests make none
  getCloudflareContext: () => ({ env: { HYPERDRIVE: { connectionString: "postgres://test:test@127.0.0.1:9/none" } } }),
}));

import { getDb } from "@/db/client";
import { runAsRequest } from "@/worker/request-context";

describe("getDb (production)", () => {
  test("one client per Worker request, shared by everything in the request", async () => {
    const [first, again] = await runAsRequest(1, async () => {
      const first = getDb();
      await Promise.resolve();
      return [first, getDb()];
    });
    expect(again).toBe(first);
  });

  test("the next request gets a client of its own, even when React's cache() has lost track of the request", async () => {
    const one = await runAsRequest(1, async () => getDb());
    const two = await runAsRequest(2, async () => getDb());
    const parallel = await Promise.all([runAsRequest(3, async () => getDb()), runAsRequest(4, async () => getDb())]);
    expect(two).not.toBe(one);
    expect(new Set([one, two, ...parallel]).size).toBe(4);
  });
});

describe("perRequest", () => {
  test("memoised per Worker request and per arguments; a value made in one request is never seen by another", async () => {
    const { perRequest } = await import("@/server/per-request");
    let made = 0;
    const load = perRequest((slug: string) => ({ slug, n: ++made }));
    const [a, b, again] = await runAsRequest(1, async () => [load("a"), load("b"), load("a")]);
    expect(again).toBe(a);
    expect([a.n, b.n]).toEqual([1, 2]);
    const next = await runAsRequest(2, async () => load("a"));
    expect(next).not.toBe(a);
    expect(next.n).toBe(3);
  });

  test("outside a Worker request (next dev, tests) it is React's cache(), as before", async () => {
    const { perRequest } = await import("@/server/per-request");
    const load = perRequest(() => ({}));
    expect(load()).toBe(load()); // the fake cache() of this file memoises for every caller
  });
});

describe("no React cache() in the server code", () => {
  test("only server/per-request.ts imports it (as its fallback outside a Worker request)", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join, relative } = await import("node:path");
    const src = join(process.cwd(), "src");
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const using = walk(src)
      .filter((p) => /\.tsx?$/.test(p))
      .filter((p) => {
        const source = readFileSync(p, "utf8");
        return /import\s*\{[^}]*\bcache\b[^}]*\}\s*from\s*["']react["']/.test(source) || /\bReact\.cache\(/.test(source);
      })
      .map((p) => relative(src, p).split("\\").join("/"));
    expect(using).toEqual(["server/per-request.ts"]);
  });
});
