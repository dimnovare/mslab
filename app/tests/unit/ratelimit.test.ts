import { describe, expect, test } from "vitest";
import { clientIp, rateKey, rateLimit, RATE_LIMIT, RATE_WINDOW_SEC } from "@/server/ratelimit";
import { fakeKv } from "../fakes";

describe("rateLimit", () => {
  test("5 allowed, 6th blocked", async () => {
    const kv = fakeKv();
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await rateLimit(kv, "rl:contact:1.2.3.4", 5, 600));
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  test("counts per key, with the window as TTL", async () => {
    const kv = fakeKv();
    for (let i = 0; i < 5; i++) await rateLimit(kv, rateKey("contact", "1.2.3.4"), RATE_LIMIT, RATE_WINDOW_SEC);
    expect(await rateLimit(kv, rateKey("contact", "1.2.3.4"), RATE_LIMIT, RATE_WINDOW_SEC)).toBe(false);
    expect(await rateLimit(kv, rateKey("practice", "1.2.3.4"), RATE_LIMIT, RATE_WINDOW_SEC)).toBe(true);
    expect(await rateLimit(kv, rateKey("contact", "5.6.7.8"), RATE_LIMIT, RATE_WINDOW_SEC)).toBe(true);
    expect(kv.store.get("rl:contact:1.2.3.4")).toBe("5");
    expect(kv.ttl.get("rl:contact:1.2.3.4")).toBe(600);
    expect(RATE_LIMIT).toBe(5);
    expect(RATE_WINDOW_SEC).toBe(600);
  });
});

describe("clientIp", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  test("Cloudflare's cf-connecting-ip wins over x-forwarded-for", () => {
    expect(clientIp(h({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.7");
  });
  test("x-forwarded-for (first hop) is the fallback, then 'local'", () => {
    expect(clientIp(h({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIp(h({}))).toBe("local");
  });
});
