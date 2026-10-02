import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./test";

// Read-only checks of the answers themselves, like `curl -I`: they run against the local dev server and against a
// deployment (E2E_BASE_URL). Task 16 items 14 (link preview) and 16 (noindex on every kind of answer).

const NOINDEX = "noindex, nofollow";

/** HEAD (as curl -I), without following redirects; GET where the answer to HEAD would not say anything. */
async function head(request: APIRequestContext, path: string) {
  const res = await request.fetch(path, { method: "HEAD", maxRedirects: 0, failOnStatusCode: false });
  return res.status() === 405 ? request.fetch(path, { method: "GET", maxRedirects: 0, failOnStatusCode: false }) : res;
}

test.describe("noindex on every kind of answer (item 16)", () => {
  test.skip(({ isMobile }) => isMobile, "the same answers for every browser: desktop project only");

  test("pages, 404, API, /media, static files, the hub and redirects all say X-Robots-Tag: noindex, nofollow", async ({ request }) => {
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
      ["/og.jpg", 200],
      ["/feedback.js?v=4", 200],
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
    }
    test.info().annotations.push({ type: "answers", description: report.join("\n") });
  });

  test("robots.txt keeps search engines out and lets only link-preview bots in", async ({ request }) => {
    const text = await (await request.get("/robots.txt")).text();
    const groups = text.split(/\n\s*\n/).map((g) => g.replace(/^#.*$/gm, "").trim()).filter(Boolean);
    const all = groups.find((g) => /^User-agent:\s*\*$/im.test(g));
    expect(all, "a group for every other robot").toMatch(/^Disallow:\s*\/\s*$/im);
    const PREVIEW = /^(facebookexternalhit|Facebot|Twitterbot|LinkedInBot|TelegramBot|WhatsApp|Slackbot-LinkExpanding|Slackbot|Discordbot|Applebot|SkypeUriPreview|vkShare|Pinterestbot|redditbot)$/i;
    for (const g of groups.filter((x) => x !== all)) {
      const agents = [...g.matchAll(/^User-agent:\s*(.+)$/gim)].map((m) => m[1].trim());
      for (const a of agents) expect(a, "only link-preview bots are allowed in").toMatch(PREVIEW);
    }
    expect(text).not.toMatch(/Googlebot|bingbot|Yandex/i);
  });
});

test.describe("link preview of the home page (item 14)", () => {
  test.skip(({ isMobile }) => isMobile, "the same markup for every browser: desktop project only");

  test("/ and /ru carry Open Graph and Twitter card tags with the 1200×630 home picture", async ({ page, baseURL }) => {
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
      expect(image.origin, "the picture is on the host the page was opened on").toBe(new URL(baseURL!).origin);
      expect(image.pathname).toBe("/og.jpg");
      expect(await meta("og:image:width")).toBe("1200");
      expect(await meta("og:image:height")).toBe("630");
      expect(await meta("og:image:alt"), path).toBeTruthy();
      expect(await meta("twitter:card")).toBe("summary_large_image");
      expect(new URL((await meta("twitter:image"))!).pathname).toBe("/og.jpg");
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
