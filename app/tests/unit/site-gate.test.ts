import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { signPreview } from "@/lib/preview-cookie";
import { alwaysThrough, GATE_PAGES, gateDecision, gateOn, type GateEnv } from "@/lib/site-gate";
import { routeSitePath } from "@/lib/site-routing";

// The coming-soon gate (hotfix 08.10): with SITE_GATE on, a visitor without the admins' preview cookie is answered with the
// coming-soon page, whatever the address; the admin area, the sign-in, the crons and webhooks, the newsletter's confirm link and
// the static files always go through. A pure function of the request's path, method and cookie and of the two settings.

const SECRET = "preview-secret-for-tests-0123456789abcdef";
const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);
const ON: GateEnv = { SITE_GATE: "1", PREVIEW_SECRET: SECRET };
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

const decide = (path: string, env: GateEnv = ON, cookie?: string, method = "GET") => gateDecision({ path, method, cookie }, env, NOW);
const kind = async (path: string, env: GateEnv = ON, cookie?: string, method = "GET") => (await decide(path, env, cookie, method)).kind;

/** Addresses that must always be answered by the app itself, gate or not. */
const THROUGH = [
  "/admin",
  "/admin/",
  "/admin/login",
  "/admin/koolitused/3",
  "/admin/uudiskiri",
  "/api/auth/request",
  "/api/auth/verify",
  "/api/auth/logout",
  "/api/admin/preview",
  "/api/admin/upload",
  "/api/admin/subscribers.csv",
  "/api/admin/lesson-file",
  "/api/cron/sweep",
  "/api/bunny/webhook",
  "/api/newsletter/confirm",
  "/_next/static/chunks/main.js",
  "/_next/image",
  "/_next/webpack-hmr",
  "/media/img/a.jpg",
  "/media/x",
  "/favicon.ico",
  "/icon.svg",
  "/robots.txt",
  "/og.jpg",
  "/brand/logo.png",
  "/seed/kulmud-1.jpg",
  "/feedback.js",
];

/** Addresses that are gated: every page of the site, the account and its API, the review tools, anything unknown. */
const GATED = [
  "/",
  "/koolitused",
  "/koolitused/kulmude-lami",
  "/koolituskalender",
  "/ostukorv",
  "/kontakt",
  "/uudised/x",
  "/konto",
  "/konto/sisene",
  "/konto/kursus/x/12",
  "/ru",
  "/ru/",
  "/ru/koolitused",
  "/ru/konto/sisene",
  "/et",
  "/et/koolitused",
  "/tulekul",
  "/tulekul/et",
  "/tulekul/ru",
  "/et/tulekul",
  "/ru/tulekul",
  "/leidmata",
  "/api",
  "/api/",
  "/api/konto",
  "/api/konto/verify",
  "/api/konto/kursus/x/1/fail/2",
  "/api/feedback",
  "/api/feedback/1",
  "/guide",
  "/guide/",
  "/guide/index.html",
  "/p/d/",
  "/p/d/index.html",
  // look-alikes of the addresses that go through: a path boundary or an exact file name, never a prefix
  "/administrator",
  "/admin.php",
  "/admins",
  "/media.php",
  "/api/authx",
  "/api/auth.php",
  "/api/admins",
  "/api/cronx/sweep",
  "/api/bunny",
  "/api/bunny/webhookx",
  "/api/bunny/other",
  "/api/newsletterx",
  "/_nextx/a",
  "/_next",
  "/favicon.ico.bak",
  "/favicon.icox",
  "/robots.txt/x",
  "/og.jpg.bak",
  "/brand",
  "/branding/x.png",
  "/seed",
  "/feedback.json",
  "/x/admin",
  "/ru/admin",
  "/et/admin",
  // encoded or dotted forms are never taken for the admin or the API (WHATWG URL parsing removes real dot segments first)
  "/%61dmin",
  "/admin/..%2fkonto",
  "/admin/%2e%2e/konto",
  "/admin/%2E%2E/konto",
  "/admin/../konto",
  "/admin/./x",
  "/admin\\..\\konto",
  "/admin%5c..%5ckonto",
  "/api/admin/..%2F..%2Fkonto",
  "//admin",
  "/media//x",
  "/wp-login.php",
  "/.env",
];

describe("gateOn: the SITE_GATE setting", () => {
  test("unset, blank or an explicit off: the site behaves as today", () => {
    for (const value of [undefined, "", "   ", "0", "false", "FALSE", "off", "Off", "no", " 0 "]) expect(gateOn(value), String(value)).toBe(false);
  });

  test("1 turns it on; so does any other value (a typo must not open the site)", () => {
    for (const value of ["1", " 1 ", "true", "TRUE", "on", "yes", "2", "gate"]) expect(gateOn(value), value).toBe(true);
  });
});

describe("gateDecision", () => {
  test("gate off: everything passes, whatever the cookie and the method", async () => {
    for (const env of [{}, { SITE_GATE: "" }, { SITE_GATE: "0" }, { SITE_GATE: undefined, PREVIEW_SECRET: SECRET }, { SITE_GATE: "off", PREVIEW_SECRET: "" }] as GateEnv[])
      for (const path of [...GATED, ...THROUGH]) expect(await kind(path, env), `${JSON.stringify(env)} ${path}`).toBe("pass");
  });

  test("gate on, no cookie: the always-through addresses pass", async () => {
    for (const path of THROUGH) expect(await kind(path), path).toBe("pass");
    for (const path of THROUGH) expect(alwaysThrough(path), path).toBe(true);
  });

  test("gate on, no cookie: everything else is gated, look-alikes and encoded forms included", async () => {
    for (const path of GATED) expect(await kind(path), path).toBe("gate");
    for (const path of GATED) expect(alwaysThrough(path), path).toBe(false);
  });

  test("the coming-soon page of the address's language: /ru… the Russian one, everything else the Estonian one", async () => {
    expect(GATE_PAGES).toEqual({ et: "/tulekul/et", ru: "/tulekul/ru" });
    for (const path of ["/ru", "/ru/", "/ru/koolitused", "/ru/konto/sisene", "/ru/tulekul", "/ru/x/y"]) expect(await decide(path), path).toMatchObject({ kind: "gate", page: "/tulekul/ru" });
    for (const path of ["/", "/koolitused", "/konto", "/et", "/et/koolitused", "/rus", "/ru-x", "/rux/y", "/x/ru", "/api/konto", "/guide/", "/RU"])
      expect(await decide(path), path).toMatchObject({ kind: "gate", page: "/tulekul/et" });
  });

  test("a gated API address says so (answered without the page), a gated page does not", async () => {
    for (const path of ["/api", "/api/", "/api/konto", "/api/konto/verify", "/api/feedback", "/api/feedback/1", "/api/admins", "/api/bunny/other"])
      expect(await decide(path), path).toMatchObject({ kind: "gate", api: true });
    for (const path of ["/", "/konto", "/api-docs", "/apix", "/guide/", "/ru/api/x"]) expect(await decide(path), path).toMatchObject({ kind: "gate", api: false });
  });

  test("the method never opens the gate (a server action is a POST to the page's own address) and never closes it", async () => {
    for (const method of METHODS) {
      for (const path of ["/", "/konto/sisene", "/ru/kontakt", "/api/konto/request", "/api/feedback"]) expect(await kind(path, ON, undefined, method), `${method} ${path}`).toBe("gate");
      for (const path of ["/admin/login", "/api/auth/logout", "/api/admin/upload", "/api/bunny/webhook", "/api/newsletter/confirm"])
        expect(await kind(path, ON, undefined, method), `${method} ${path}`).toBe("pass");
    }
  });

  test("a valid preview cookie lets every address through, every method", async () => {
    const cookie = await signPreview(SECRET, NOW);
    for (const method of METHODS) for (const path of GATED) expect(await kind(path, ON, cookie, method), `${method} ${path}`).toBe("pass");
  });

  test("an expired, tampered, foreign or malformed cookie is no pass", async () => {
    const good = await signPreview(SECRET, NOW);
    const [exp, sig] = good.split(".");
    const expired = await signPreview(SECRET, NOW - 31 * 86_400_000);
    const foreign = await signPreview("another-secret-0123456789abcdef", NOW);
    for (const cookie of [expired, foreign, `${Number(exp) + 1}.${sig}`, `${exp}.${sig.slice(1)}A`, "", "1", "x.y", "true", "admin"])
      for (const path of ["/", "/konto", "/ru", "/api/konto"]) expect(await kind(path, ON, cookie), `${cookie} ${path}`).toBe("gate");
  });

  test("no PREVIEW_SECRET (unset, empty or blank) with the gate on: nobody passes, except the always-through addresses", async () => {
    const cookie = await signPreview(SECRET, NOW);
    for (const env of [{ SITE_GATE: "1" }, { SITE_GATE: "1", PREVIEW_SECRET: "" }, { SITE_GATE: "1", PREVIEW_SECRET: "   " }] as GateEnv[]) {
      for (const path of ["/", "/konto", "/ru/koolitused", "/api/konto"]) expect(await kind(path, env, cookie), `${JSON.stringify(env)} ${path}`).toBe("gate");
      for (const path of THROUGH) expect(await kind(path, env, cookie), `${JSON.stringify(env)} ${path}`).toBe("pass");
    }
  });

  test("the secret is read trimmed, as every other setting (a pasted value with a newline still works)", async () => {
    const cookie = await signPreview(SECRET, NOW);
    expect(await kind("/", { SITE_GATE: "1", PREVIEW_SECRET: ` ${SECRET}\n` }, cookie)).toBe("pass");
  });
});

describe("the coming-soon page itself", () => {
  test("is no page of the site: with the gate off (or for an admin) its addresses are the 404 page", () => {
    for (const path of ["/tulekul", "/tulekul/et", "/tulekul/ru", "/ru/tulekul"])
      expect(routeSitePath(path, new URLSearchParams()), path).toEqual({ kind: "page", page: path.startsWith("/ru") ? "/ru/leidmata" : "/et/leidmata", rewritten: true });
  });

  test("lives at app/tulekul/[locale] with a root layout of its own: no site shell, and nothing read from the settings or the database", () => {
    const dir = join(process.cwd(), "src/app/tulekul/[locale]");
    expect(readdirSync(dir)).toEqual(expect.arrayContaining(["page.tsx", "layout.tsx"]));
    expect(readdirSync(join(process.cwd(), "src/app/tulekul"))).toEqual(["[locale]"]); // no layout above it: its own is the root layout
    const layout = readFileSync(join(dir, "layout.tsx"), "utf8");
    expect(layout).toMatch(/<html lang=\{locale\}/);
    // `next build` prerenders both languages, and the build must succeed with an empty environment (docs/deploy.md section 2):
    // the [locale] layout's link-preview tags read SITE_URL, so the page is not under it, and reads none of these itself
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
      const source = readFileSync(join(dir, file), "utf8");
      expect(source, file).not.toMatch(/@\/server\/|@\/db\/|share-meta|next\/headers|process\.env|connection\(/);
    }
  });
});

describe("every static file of public/ goes through (the design-review hub excepted)", () => {
  test("each top-level file and folder of public/", () => {
    const hub = new Set(["guide", "p"]);
    const entries = readdirSync(join(process.cwd(), "public"), { withFileTypes: true }).filter((e) => !hub.has(e.name));
    expect(entries.length).toBeGreaterThan(3);
    for (const e of entries) {
      if (e.isDirectory()) {
        for (const file of readdirSync(join(process.cwd(), "public", e.name)).slice(0, 5)) expect(alwaysThrough(`/${e.name}/${file}`), `/${e.name}/${file}`).toBe(true);
      } else expect(alwaysThrough(`/${e.name}`), `/${e.name}`).toBe(true);
    }
    for (const name of hub) expect(alwaysThrough(`/${name}/`), name).toBe(false);
  });
});
