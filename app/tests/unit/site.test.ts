import { describe, expect, test } from "vitest";
import { LINK_ORIGINS, hostOrigin, isLocalHost, linkBase, requestOrigin } from "@/server/site";

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

describe("the login link base", () => {
  const SITE = "https://mslab.diipsolutions.eu";
  const base = (init: Record<string, string>) => linkBase(hostOrigin(new Headers(init)), SITE);

  test("scheme + Host header, nothing else", () => {
    expect(hostOrigin(new Headers({ host: "mslab.ee" }))).toBe("https://mslab.ee");
    expect(hostOrigin(new Headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(hostOrigin(new Headers({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
    expect(hostOrigin(new Headers({}))).toBeNull();
  });

  test("an allow-listed Host is used, anything else gives SITE_URL", () => {
    expect(base({ host: "mslab-web.dim-novare.workers.dev" })).toBe("https://mslab-web.dim-novare.workers.dev");
    expect(base({ host: "mslab.ee" })).toBe("https://mslab.ee");
    expect(base({ host: "localhost:3000" })).toBe("http://localhost:3000");
    for (const host of ["evil.example", "mslab.ee.evil.example", "localhost:3001", "mslab.diipsolutions.eu:8443"]) expect(base({ host }), host).toBe(SITE);
    expect(linkBase(hostOrigin(new Headers({})), SITE)).toBe(SITE);
  });

  test("Origin, x-forwarded-host and x-forwarded-proto are ignored (a client can send them)", () => {
    expect(base({ host: "evil.example", origin: "https://mslab.ee", "x-forwarded-host": "mslab.ee" })).toBe(SITE);
    expect(base({ host: "mslab.ee", origin: "https://evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" })).toBe("https://mslab.ee");
    expect(base({ origin: "https://mslab.ee" })).toBe(SITE);
  });

  test("isLocalHost", () => {
    for (const h of ["localhost", "localhost:3000", "LOCALHOST:8787", "127.0.0.1", "127.0.0.1:3001", "[::1]:3000"]) expect(isLocalHost(h), h).toBe(true);
    for (const h of ["", null, undefined, "localhost.evil.example", "evil.example:3000", "127.0.0.1.evil.example", "mslab.ee", "xlocalhost", "localhost:abc"]) expect(isLocalHost(h), String(h)).toBe(false);
  });
});
