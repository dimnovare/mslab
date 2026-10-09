import { describe, expect, test } from "vitest";
import { belowLimit, clientIp, countFailure, normalizeIp, rateKey, rateLimit, RATE_LIMIT, RATE_WINDOW_SEC, releaseSlot, reserveSlot } from "@/server/ratelimit";
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
  test("the first address of x-forwarded-for (Vercel's edge sets it to the visitor's own); no header gives null (the caller decides)", () => {
    expect(clientIp(h({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIp(h({ "x-forwarded-for": " 198.51.100.1 " }))).toBe("198.51.100.1");
    expect(clientIp(h({}))).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": " " }))).toBeNull();
  });
  test("cf-connecting-ip is never read: a client could send any value and get a fresh bucket each time", () => {
    expect(clientIp(h({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("198.51.100.1");
    expect(clientIp(h({ "cf-connecting-ip": "203.0.113.7" }))).toBeNull();
  });
});

describe("IPv6 buckets: one per /64", () => {
  test("every address of a /64 maps to the same bucket, however it is written", () => {
    const same = [
      "2001:db8:1:2::1",
      "2001:db8:1:2:aaaa:bbbb:cccc:dddd",
      "2001:0DB8:0001:0002:0000:0000:0000:0001",
      "2001:db8:1:2:ffff:ffff:ffff:ffff",
      "[2001:db8:1:2::7]",
      "2001:db8:1:2::7%eth0",
      " 2001:DB8:1:2::7 ",
    ];
    for (const a of same) expect(normalizeIp(a), a).toBe("2001:db8:1:2::/64");
  });

  test("another /64 is another bucket; the 64-bit boundary is exact", () => {
    expect(normalizeIp("2001:db8:1:3::1")).toBe("2001:db8:1:3::/64");
    expect(normalizeIp("2001:db8:2:2::1")).toBe("2001:db8:2:2::/64");
    expect(normalizeIp("2001:db8:1:2:0:0:0:0")).toBe(normalizeIp("2001:db8:1:2:ffff::"));
    expect(normalizeIp("2001:db8:1::5")).toBe("2001:db8:1:0::/64"); // "::" spans the 4th group
    expect(normalizeIp("2001:db8:1::5")).not.toBe(normalizeIp("2001:db8:1:2::5"));
  });

  test("compressed forms, loopback and the unspecified address", () => {
    expect(normalizeIp("::1")).toBe("0:0:0:0::/64");
    expect(normalizeIp("::")).toBe("0:0:0:0::/64");
    expect(normalizeIp("fe80::1%25eth0")).toBe("fe80:0:0:0::/64");
    expect(normalizeIp("2a00:1450:4001:81b::200e")).toBe("2a00:1450:4001:81b::/64");
  });

  test("IPv4-mapped IPv6 is the IPv4 address; IPv4 and non-addresses stay as they are", () => {
    expect(normalizeIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIp("::ffff:cb00:7107")).toBe("203.0.113.7");
    expect(normalizeIp("::ffff:203.0.113.7")).toBe(normalizeIp("203.0.113.7"));
    expect(normalizeIp("203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIp("local")).toBe("local");
    expect(normalizeIp("e2e-chromium-abc-0-xyz")).toBe("e2e-chromium-abc-0-xyz");
    for (const bad of ["1:2:3", "1:2:3:4:5:6:7:8:9", "::g", "1::2::3", "12345::1", "::ffff:999.1.1.1", "not:an:ip"]) expect(normalizeIp(bad), bad).toBe(bad);
  });

  test("clientIp applies it; a visitor cannot get a fresh bucket by changing the lower 64 bits", async () => {
    const h = (init: Record<string, string>) => new Headers(init);
    expect(clientIp(h({ "x-forwarded-for": "2001:db8:1:2:1234:5678:9abc:def0" }))).toBe("2001:db8:1:2::/64");
    expect(clientIp(h({ "x-forwarded-for": "2001:db8:1:2::9, 10.0.0.1" }))).toBe("2001:db8:1:2::/64");
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
    const kv = fakeKv();
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await rateLimit(kv, rateKey("contact", clientIp(h({ "x-forwarded-for": `2001:db8:1:2::${i + 1}` }))!), 5, 600));
    expect(results).toEqual([true, true, true, true, true, false, false]);
    expect(await rateLimit(kv, rateKey("contact", clientIp(h({ "x-forwarded-for": "2001:db8:1:3::1" }))!), 5, 600)).toBe(true);
    expect([...kv.store.keys()]).toEqual(["rl:contact:2001:db8:1:2::/64", "rl:contact:2001:db8:1:3::/64"]);
  });
});

test("the password lock's counters (phase 2c): belowLimit counts nothing; countFailure adds one and starts the window again", async () => {
  const kv = fakeKv();
  expect(await belowLimit(kv, "k", 2)).toBe(true);
  await countFailure(kv, "k", 900);
  await countFailure(kv, "k", 900);
  expect([kv.store.get("k"), kv.ttl.get("k")]).toEqual(["2", 900]);
  expect(await belowLimit(kv, "k", 2)).toBe(false);
  expect(await belowLimit(kv, "k", 3)).toBe(true);
});

test("reserveSlot / releaseSlot (phase 2c fix): a store with atomic counters is asked for them; one without falls back to read-then-write", async () => {
  // the atomic form: the tests' in-memory KV mirrors PgKv.reserve / release
  const kv = fakeKv();
  expect([await reserveSlot(kv, "k", 2, 900), await reserveSlot(kv, "k", 2, 900), await reserveSlot(kv, "k", 2, 900)]).toEqual([true, true, false]);
  expect([kv.store.get("k"), kv.ttl.get("k")]).toEqual(["2", 900]);
  await releaseSlot(kv, "k", 900);
  expect(kv.store.get("k")).toBe("1");
  await releaseSlot(kv, "k", 900);
  await releaseSlot(kv, "k", 900);
  expect(kv.store.get("k")).toBe("0"); // never below 0
  // a store with get and put only (the fallback): the same answers, one request at a time
  const plain = fakeKv();
  const bare = { get: plain.get, put: plain.put };
  expect([await reserveSlot(bare, "k", 2, 900), await reserveSlot(bare, "k", 2, 900), await reserveSlot(bare, "k", 2, 900)]).toEqual([true, true, false]);
  await releaseSlot(bare, "k", 900);
  await releaseSlot(bare, "k", 900);
  await releaseSlot(bare, "k", 900);
  expect(plain.store.get("k")).toBe("0");
});
