import { describe, expect, test } from "vitest";
import { LINK_ORIGINS, linkBase, requestOrigin } from "@/server/site";

describe("links in e-mails and Telegram", () => {
  const SITE = "https://mslab.diipsolutions.eu/";

  test("an allow-listed request origin is used", () => {
    expect(LINK_ORIGINS).toEqual([
      "https://mslab.diipsolutions.eu",
      "https://mslab-web.dim-novare.workers.dev",
      "http://localhost:3000",
      "https://mslab.ee",
      "https://www.mslab.ee",
    ]);
    for (const o of LINK_ORIGINS) expect(linkBase(o, SITE)).toBe(o);
    expect(linkBase("https://mslab-web.dim-novare.workers.dev/kontakt", SITE)).toBe("https://mslab-web.dim-novare.workers.dev");
  });

  test("anything else falls back to SITE_URL (no trailing slash)", () => {
    for (const o of [null, undefined, "", "null", "https://evil.example", "http://mslab.ee", "https://mslab.ee.evil.example", "http://localhost:3001", "javascript:alert(1)"])
      expect(linkBase(o, SITE), String(o)).toBe("https://mslab.diipsolutions.eu");
  });

  test("requestOrigin: the Origin header, else scheme + Host", () => {
    const h = (init: Record<string, string>) => new Headers(init);
    expect(requestOrigin(h({ origin: "https://mslab-web.dim-novare.workers.dev", host: "x" }))).toBe("https://mslab-web.dim-novare.workers.dev");
    expect(requestOrigin(h({ host: "mslab.ee" }))).toBe("https://mslab.ee");
    expect(requestOrigin(h({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(requestOrigin(h({ host: "mslab.ee", "x-forwarded-proto": "http" }))).toBe("http://mslab.ee");
    expect(requestOrigin(h({}))).toBeNull();
  });
});
