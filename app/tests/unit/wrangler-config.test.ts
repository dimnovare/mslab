import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// app/wrangler.jsonc: the custom domain and workers.dev stay; no per-version preview hosts (round 2 item 20).
const config = JSON.parse(
  readFileSync("wrangler.jsonc", "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n"),
) as { routes?: { pattern: string; custom_domain?: boolean }[]; workers_dev?: boolean; preview_urls?: boolean };

describe("wrangler.jsonc", () => {
  test("the custom domain and the workers.dev address are kept; preview URLs are off", () => {
    expect(config.routes).toEqual([{ pattern: "mslab.diipsolutions.eu", custom_domain: true }]);
    expect(config.workers_dev).toBe(true);
    expect(config.preview_urls).toBe(false);
  });
});
