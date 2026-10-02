import type { APIRequestContext } from "@playwright/test";
import { LOCAL_ENV } from "../local-secrets";
import { PROD_ENV } from "./prod-build";
import { PROD_BUILD } from "./target";
import { test, expect } from "./test";

// Read-only checks of the answers themselves, like `curl -I`: they run against the local dev server, the local
// production build (E2E_PROD_BUILD) and a deployment (E2E_BASE_URL). Task 16 items 14 (link preview) and 16 (noindex on
// every kind of answer). The headers every answer carries come from next.config.ts headers().

const NOINDEX = "noindex, nofollow";
const REFERRER = "strict-origin-when-cross-origin";

/**
 * The site's address (SITE_URL): link previews name it, whichever host served the page (Task 17). The public value of
 * .env.example, or the local production build's own address (prod-build.ts).
 */
const SITE_URL = PROD_BUILD ? PROD_ENV.SITE_URL : LOCAL_ENV.SITE_URL;

/** HEAD (as curl -I), without following redirects; GET where the answer to HEAD would not say anything. */
async function head(request: APIRequestContext, path: string) {
  const res = await request.fetch(path, { method: "HEAD", maxRedirects: 0, failOnStatusCode: false });
  return res.status() === 405 ? request.fetch(path, { method: "GET", maxRedirects: 0, failOnStatusCode: false }) : res;
}

test.describe("noindex on every kind of answer (item 16)", () => {
  test.skip(({ isMobile }) => isMobile, "the same answers for every browser: desktop project only");

  test("pages, 404, API, /media, static files, the hub and redirects all say X-Robots-Tag: noindex, nofollow; none says X-Powered-By", async ({ request }) => {
    // a built script of the page itself (a hashed /_next/static file)
    const html = await (await request.get("/")).text();
    const chunk = /\/_next\/static\/[^"'\s]+\.js/.exec(html)?.[0];
    expect(chunk, "a /_next/static script in the home page").toBeTruthy();

    const answers: [path: string, status: number | RegExp][] = [
      ["/", 200],
      ["/ru", 200],
      ["/koolitused", 200],
      ["/koolitused/kulmumeistri-baaskoolitus", 200],
      ["/uudised", 200],
      ["/olematu-leht", 404],
      ["/ru/net-takoj", 404],
      ["/admin/login", 200],
      ["/api/feedback", 401],
      ["/api/feedback/zzzzzzzzzzzzzz", 404],
      ["/media/img/olematu.jpg", 404],
      ["/robots.txt", 200],
      ["/favicon.ico", 200],
      ["/og.jpg", 200],
      ["/feedback.js?v=5", 200],
      ["/seed/flower-hero.png", 200],
      ["/brand/logo.png", 200],
      [chunk!, 200],
      ["/guide/", 200],
      ["/p/d/styles.css", 200],
      // redirects
      ["/koolitused/", 308],
      ["/et/koolitused", 308],
      ["/guide", /^30[78]$/],
      ["/p/d", /^30[78]$/],
    ];
    const report: string[] = [];
    for (const [path, status] of answers) {
      const res = await head(request, path);
      const ok = typeof status === "number" ? res.status() === status : status.test(String(res.status()));
      const robots = res.headers()["x-robots-tag"];
      report.push(`${path} → ${res.status()} x-robots-tag: ${robots ?? "(none)"}`);
      expect(ok, `${path}: status ${res.status()}`).toBe(true);
      expect(robots, `${path} (${res.status()}): once, exactly`).toBe(NOINDEX);
      expect(res.headers()["referrer-policy"], `${path} (${res.status()}): Referrer-Policy once, exactly`).toBe(REFERRER);
      expect(res.headers()["x-powered-by"], `${path}: no X-Powered-By (N12)`).toBeUndefined();
    }
    test.info().annotations.push({ type: "answers", description: report.join("\n") });
  });

  test("robots.txt keeps search engines out and lets only link-preview bots in", async ({ request }) => {
    const text = await (await request.get("/robots.txt")).text();
    const groups = text.split(/\n\s*\n/).map((g) => g.replace(/^#.*$/gm, "").trim()).filter(Boolean);
    const all = groups.find((g) => /^User-agent:\s*\*$/im.test(g));
    expect(all, "a group for every other robot").toMatch(/^Disallow:\s*\/\s*$/im);
    const PREVIEW = /^(facebookexternalhit|Facebot|Twitterbot|LinkedInBot|TelegramBot|WhatsApp|Slackbot-LinkExpanding|Slackbot|Discordbot|SkypeUriPreview|vkShare|Pinterestbot|redditbot)$/i;
    for (const g of groups.filter((x) => x !== all)) {
      const agents = [...g.matchAll(/^User-agent:\s*(.+)$/gim)].map((m) => m[1].trim());
      for (const a of agents) expect(a, "only link-preview bots are allowed in").toMatch(PREVIEW);
    }
    expect(text).not.toMatch(/Googlebot|bingbot|Yandex|Applebot/i); // search crawlers (Applebot feeds Siri / Spotlight search)
  });
});

test.describe("link preview of the home page (item 14)", () => {
  test.skip(({ isMobile }) => isMobile, "the same markup for every browser: desktop project only");

  test("/ and /ru carry Open Graph and Twitter card tags with the 1200×630 home picture", async ({ page }) => {
    for (const [path, locale, title] of [
      ["/", "et_EE", "MS LAB Koolituskeskus — Brow & Lash Academy"],
      ["/ru", "ru_RU", "MS LAB Учебный центр — Brow & Lash Academy"],
    ] as const) {
      await page.goto(path);
      const meta = (key: string) => page.locator(`meta[property="${key}"], meta[name="${key}"]`).first().getAttribute("content");
      expect(await meta("og:title"), path).toBe(title);
      expect(await meta("og:description"), path).toBeTruthy();
      expect(await meta("og:type"), path).toBe("website");
      expect(await meta("og:locale"), path).toBe(locale);
      expect(new URL((await meta("og:url"))!).pathname, path).toBe(path);
      const image = new URL((await meta("og:image"))!);
      // a cached page is the same for every host that serves it (custom domain, Vercel addresses): absolute links use SITE_URL
      expect(image.origin, "the picture is on the site's address").toBe(new URL(SITE_URL).origin);
      expect(image.pathname).toBe("/og.jpg");
      expect(await meta("og:image:width")).toBe("1200");
      expect(await meta("og:image:height")).toBe("630");
      expect(await meta("og:image:alt"), path).toBeTruthy();
      expect(await meta("twitter:card")).toBe("summary_large_image");
      expect(new URL((await meta("twitter:image"))!).pathname).toBe("/og.jpg");
    }
  });

  test("a course and a post preview themselves; other pages name the site only, never the home page's title (fix round 1)", async ({ page }) => {
    const meta = (key: string) => page.locator(`meta[property="${key}"], meta[name="${key}"]`).first().getAttribute("content");
    const count = (key: string) => page.locator(`meta[property="${key}"], meta[name="${key}"]`).count();
    const home = "MS LAB Koolituskeskus — Brow & Lash Academy";
    for (const [path, title, description, image] of [
      ["/koolitused/kulmumeistri-baaskoolitus", "Kulmumeistri baaskoolitus", "Tugev vundament sinu teekonnale kulmumeistrina.", "/seed/brow-editorial.jpg"],
      ["/uudised/kuidas-valida-endale-sobiv-kulmukoolitus", "Kuidas valida endale sobiv kulmukoolitus?", "Baas- või täiendkoolitus, e-õpe või kontaktpäev — lühike juhend, kust alustada.", "/seed/brow-editorial.jpg"],
    ] as const) {
      await page.goto(path);
      expect(await meta("og:title"), path).toBe(title);
      expect(await meta("og:description"), path).toBe(description);
      expect(await meta("twitter:title"), path).toBe(title);
      expect(await meta("twitter:description"), path).toBe(description);
      expect(new URL((await meta("og:url"))!).pathname, path).toBe(path);
      expect(new URL((await meta("og:image"))!).pathname, path).toBe(image);
      expect(new URL((await meta("twitter:image"))!).pathname, path).toBe(image);
      expect(await meta("og:site_name"), path).toBe("MS LAB Koolituskeskus");
    }
    // other pages: the layout adds the site's name, language and picture; Next.js fills in each page's own title and
    // description (never the home page's)
    for (const path of ["/praktika", "/koolitused", "/kontakt", "/ru/koolituskalender"]) {
      await page.goto(path);
      const own = await page.title();
      expect(own, path).not.toBe(home);
      expect(await meta("og:title"), path).toBe(own);
      expect(await meta("twitter:title"), path).toBe(own);
      expect(await meta("og:description"), path).toBe(await meta("description"));
      expect(await count("og:url"), path).toBe(0);
      expect(new URL((await meta("og:image"))!).pathname, path).toBe("/og.jpg");
      expect(await meta("og:site_name"), path).toMatch(/^MS LAB/);
    }
  });

  test("the picture is a 1200×630 JPEG without provenance or tool names in it", async ({ request }) => {
    const res = await request.get("/og.jpg?v=1");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/image\/jpeg/);
    const bytes = await res.body();
    // the frame size from the JPEG's start-of-frame marker (SOF0…SOF3)
    let size: [number, number] | null = null;
    for (let i = 2; i < bytes.length - 9 && !size; ) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1];
      const len = bytes.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) size = [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
      i += 2 + len;
    }
    expect(size).toEqual([1200, 630]);
    expect(bytes.toString("latin1")).not.toMatch(/claude|anthropic|lovable|openai|gemini|midjourney|dall-e|c2pa|jumbf/i);
  });
});

test.describe("uploaded images: the /media route's own answers (final review I1)", () => {
  test.skip(({ isMobile }) => isMobile, "the same answers for every browser: desktop project only");

  test("/media: the route's 404s with noindex and nosniff, never kept by a CDN", async ({ request }) => {
    // a key putImage could have made, of an image that does not exist; and keys it never makes
    for (const path of ["/media/img/00000000-0000-4000-8000-000000000000.jpg", "/media/img/olematu.jpg", "/media/img/x.svg"]) {
      for (const method of ["GET", "HEAD"]) {
        const res = await request.fetch(path, { method, maxRedirects: 0, failOnStatusCode: false });
        expect(res.status(), `${method} ${path}`).toBe(404);
        expect(res.headers()["x-robots-tag"], `${method} ${path}`).toBe(NOINDEX);
        expect(res.headers()["x-content-type-options"], `${method} ${path}`).toBe("nosniff");
        expect(res.headers()["cache-control"], `${method} ${path}`).toMatch(/no-store/);
        expect(res.headers()["content-security-policy"], `${method} ${path}`).toBe("default-src 'none'; sandbox");
        // an image asked for too early is not remembered as missing (server/media.ts)
        expect(res.headers()["vercel-cdn-cache-control"], `${method} ${path}`).toBeUndefined();
      }
    }
    // addresses that only look like /media are not images: the site's 404 page
    for (const path of ["/media.php", "/mediakit"]) {
      const res = await request.get(path, { failOnStatusCode: false });
      expect(res.status(), path).toBe(404);
      expect(await res.text(), path).toContain("Lehte ei leitud");
    }
  });
});

test.describe("framing: only by this site's own pages (final review M10)", () => {
  const FRAMING = "frame-ancestors 'self'";

  test("pages, the 404 page, the admin, the hub and the prototypes say frame-ancestors 'self', once", async ({ request, isMobile }) => {
    test.skip(isMobile, "the same answers for every browser: desktop project only");
    for (const path of ["/", "/ru", "/koolitused/kulmumeistri-baaskoolitus", "/olematu-leht", "/admin/login", "/guide/", "/p/d/", "/p/a/"]) {
      const res = await request.get(path, { maxRedirects: 0, failOnStatusCode: false });
      expect(res.status(), path).toBeLessThan(500);
      expect(res.headers()["content-security-policy"], path).toBe(FRAMING);
    }
  });

  test("the hub still shows the prototypes in its frame, at desktop and phone size", async ({ page }) => {
    const refused: string[] = [];
    page.on("console", (m) => {
      if (/frame-ancestors|refused to (display|frame)/i.test(m.text())) refused.push(m.text());
    });
    for (const [dir, device] of [["d", "desk"], ["a", "mob"], ["b", "mob"]] as const) {
      await page.goto("about:blank"); // (a new hash alone would not load the hub again)
      await page.goto(`/guide/#vaade=${dir}&seade=${device}`);
      await expect(page.locator("#viewer")).toBeVisible();
      // the framed document is the prototype itself (same origin, so the hub can reach into it), with its content
      await expect
        .poll(
          () =>
            page.locator("#ifr").evaluate((f: HTMLIFrameElement) => {
              try {
                const doc = f.contentDocument;
                return doc && doc.body && doc.body.children.length > 0 ? f.contentWindow!.location.pathname : "";
              } catch {
                return "blocked";
              }
            }),
          { message: `${dir} at ${device}` },
        )
        .toBe(`/p/${dir}/`);
      await expect(page.locator("#ifr")).toBeVisible();
    }
    expect(refused).toEqual([]);
  });
});

