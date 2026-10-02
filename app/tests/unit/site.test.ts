import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LINK_ORIGINS, hostOrigin, isLocalHost, linkBase, linkOrigins, requestOrigin } from "@/server/site";

// The Vercel variables name this deployment's own hosts; these tests run on a developer machine or in CI, so start from none.
const VERCEL_HOSTS = ["VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_BRANCH_URL", "VERCEL_URL"];
beforeEach(() => {
  for (const name of VERCEL_HOSTS) vi.stubEnv(name, undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("links in e-mails and Telegram", () => {
  const SITE = "https://mslab.diipsolutions.eu/";

  test("an allow-listed request origin is used", () => {
    expect(LINK_ORIGINS).toEqual(["https://mslab.diipsolutions.eu", "http://localhost:3000", "https://mslab.ee", "https://www.mslab.ee"]);
    expect(linkOrigins()).toEqual(LINK_ORIGINS); // no Vercel variable set: the fixed list, nothing more
    for (const o of LINK_ORIGINS) expect(linkBase(o, SITE)).toBe(o);
    expect(linkBase("https://mslab.ee/kontakt", SITE)).toBe("https://mslab.ee");
  });

  test("anything else falls back to SITE_URL (no trailing slash)", () => {
    for (const o of [null, undefined, "", "null", "https://evil.example", "https://mslab-x.vercel.app", "https://mslab-web.dim-novare.workers.dev", "http://mslab.ee", "https://mslab.ee.evil.example", "http://localhost:3001", "javascript:alert(1)"])
      expect(linkBase(o, SITE), String(o)).toBe("https://mslab.diipsolutions.eu");
  });

  test("requestOrigin: the Origin header, else scheme + Host", () => {
    const h = (init: Record<string, string>) => new Headers(init);
    expect(requestOrigin(h({ origin: "https://mslab-x.vercel.app", host: "x" }))).toBe("https://mslab-x.vercel.app");
    expect(requestOrigin(h({ host: "mslab.ee" }))).toBe("https://mslab.ee");
    expect(requestOrigin(h({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(requestOrigin(h({ host: "mslab.ee", "x-forwarded-proto": "http" }))).toBe("http://mslab.ee");
    expect(requestOrigin(h({}))).toBeNull();
  });
});

describe("the Vercel hosts of this deployment", () => {
  const SITE = "https://mslab.diipsolutions.eu";

  test("the production URL: a request from it gets its own origin, a forged *.vercel.app gets SITE_URL", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "mslab-x.vercel.app");
    expect(linkOrigins()).toEqual([...LINK_ORIGINS, "https://mslab-x.vercel.app"]);
    expect(linkBase("https://mslab-x.vercel.app", SITE)).toBe("https://mslab-x.vercel.app");
    expect(linkBase("https://mslab-x.vercel.app/admin", SITE)).toBe("https://mslab-x.vercel.app");
    expect(linkBase(hostOrigin(new Headers({ host: "mslab-x.vercel.app" })), SITE)).toBe("https://mslab-x.vercel.app");
    for (const o of ["https://evil.vercel.app", "http://mslab-x.vercel.app", "https://mslab-x.vercel.app.evil.example", "https://mslab-y.vercel.app"])
      expect(linkBase(o, SITE), o).toBe(SITE);
    expect(linkBase(hostOrigin(new Headers({ host: "evil.vercel.app" })), SITE)).toBe(SITE);
    // the fixed list still works next to it
    expect(linkBase("https://mslab.ee", SITE)).toBe("https://mslab.ee");
  });

  test("the branch URL and the deployment URL are allowed too, each only when set and not empty", () => {
    vi.stubEnv("VERCEL_BRANCH_URL", "mslab-git-feat-x.vercel.app");
    vi.stubEnv("VERCEL_URL", "mslab-abc123.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(linkOrigins()).toEqual([...LINK_ORIGINS, "https://mslab-git-feat-x.vercel.app", "https://mslab-abc123.vercel.app"]);
    expect(linkBase("https://mslab-git-feat-x.vercel.app", SITE)).toBe("https://mslab-git-feat-x.vercel.app");
    expect(linkBase("https://mslab-abc123.vercel.app", SITE)).toBe("https://mslab-abc123.vercel.app");
    vi.stubEnv("VERCEL_URL", "   ");
    expect(linkOrigins()).toEqual([...LINK_ORIGINS, "https://mslab-git-feat-x.vercel.app"]);
    expect(linkBase("https://mslab-abc123.vercel.app", SITE)).toBe(SITE);
  });

  test("with none set nothing changes: no *.vercel.app host is accepted, and a variable never leaks into the next test", () => {
    expect(linkOrigins()).toEqual(LINK_ORIGINS);
    expect(linkBase("https://mslab-x.vercel.app", SITE)).toBe(SITE);
    expect(process.env.VERCEL_PROJECT_PRODUCTION_URL).toBeUndefined();
  });

  test("the old Cloudflare test host is not accepted (as origin or Host), set variables or not", () => {
    const OLD = "https://mslab-web.dim-novare.workers.dev";
    expect(linkBase(OLD, SITE)).toBe(SITE);
    expect(linkBase(hostOrigin(new Headers({ host: "mslab-web.dim-novare.workers.dev" })), SITE)).toBe(SITE);
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "mslab-x.vercel.app");
    expect(linkBase(OLD, SITE)).toBe(SITE);
    expect(linkOrigins()).not.toContain(OLD);
  });

  test("a value that is not a host is left out instead of breaking the list", () => {
    vi.stubEnv("VERCEL_URL", "bad host with spaces");
    vi.stubEnv("VERCEL_BRANCH_URL", "mslab-b.vercel.app");
    expect(linkOrigins()).toEqual([...LINK_ORIGINS, "https://mslab-b.vercel.app"]);
  });

  test("an explicit source replaces process.env (never the request): headers cannot add to it", () => {
    expect(linkOrigins({ VERCEL_URL: "mslab-s.vercel.app" })).toEqual([...LINK_ORIGINS, "https://mslab-s.vercel.app"]);
    expect(linkOrigins({})).toEqual(LINK_ORIGINS);
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
    expect(base({ host: "mslab.ee" })).toBe("https://mslab.ee");
    expect(base({ host: "localhost:3000" })).toBe("http://localhost:3000");
    for (const host of ["evil.example", "mslab-web.dim-novare.workers.dev", "mslab.ee.evil.example", "localhost:3001", "mslab.diipsolutions.eu:8443"]) expect(base({ host }), host).toBe(SITE);
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
