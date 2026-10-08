import type { Page } from "@playwright/test";
import { test, expect } from "./test";

// Phase 2c (spec 4): the look changes of Maria's 06.10 feedback, at the four check widths with no horizontal overflow — the menu in
// Jost, one size for the list pages' titles (the catalogue's "Leia oma koolitus."), and (Task 5) the home page's news block on a light
// band and the footer at about half its old height.

const WIDTHS = [390, 834, 1440, 2560] as const;
const LIST_PAGES = ["/koolitused", "/koolituskalender", "/praktika", "/koolitaja", "/uudised"] as const;
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const fontOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((e) => {
    const c = getComputedStyle(e);
    return { family: c.fontFamily, size: c.fontSize, weight: c.fontWeight };
  });

test("the list pages' titles are one size (clamp(34px, 4vw, 52px)), Jost 400, at every check width", async ({ page, isMobile }) => {
  test.skip(isMobile, "the widths are set here; once is enough");
  test.setTimeout(180_000);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of LIST_PAGES) {
      await page.goto(path);
      const f = await fontOf(page, "main h1");
      expect(f.family, `${path} @ ${width}`).toMatch(/Jost/i);
      expect([f.size, f.weight], `${path} @ ${width}`).toEqual([`${Math.min(52, Math.max(34, width * 0.04))}px`, "400"]);
      expect(await noOverflow(page), `${path} @ ${width}`).toBe(true);
    }
  }
});

test("the menu is Jost 16 px / 400 on a computer and keeps its line height; the login and language buttons stay Manrope", async ({ page, isMobile }) => {
  test.skip(isMobile, "the computer's menu; the phone's is the next test");
  await page.goto("/koolitused");
  const link = page.locator("header nav").getByRole("link", { name: "Praktika" });
  const s = await link.evaluate((e) => {
    const c = getComputedStyle(e);
    return { family: c.fontFamily, size: c.fontSize, weight: c.fontWeight, height: e.getBoundingClientRect().height };
  });
  expect(s.family).toMatch(/Jost/i);
  expect([s.size, s.weight]).toEqual(["16px", "400"]);
  expect(s.height).toBeCloseTo(52.75, 0); // 14 + 14 padding + a 24.75 px line, as with Manrope 15/1.65
  expect((await fontOf(page, "header [data-account-link]")).family).toMatch(/Manrope/i);
});

test("the phone menu is Jost too", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the phone's menu");
  await page.goto("/koolitused");
  await page.getByRole("button", { name: "Ava menüü" }).click();
  const link = page.getByRole("dialog").getByRole("link", { name: "Praktika" });
  expect(await link.evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/Jost/i);
});

test("the home page's news block is a full-width band in the canvas colour, its cards on paper", async ({ page }) => {
  await page.goto("/");
  const band = page.locator("[data-news-band]");
  await expect(band).toHaveAccessibleName("Uudised ja nõuanded");
  const box = (await band.boundingBox())!;
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  expect([Math.round(box.x), Math.round(box.width)]).toEqual([0, width]);
  expect(await band.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(246, 244, 245)"); // --canvas
  const card = band.getByRole("link", { name: /Kuidas valida endale sobiv kulmukoolitus/ });
  expect(await card.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(255, 255, 255)"); // --paper
});

test("the footer at 1440: the links at the left, the newsletter card at the right, at most 460 px high", async ({ page, isMobile }) => {
  test.skip(isMobile, "1440 wide");
  await page.goto("/");
  const footer = page.locator("footer");
  expect((await footer.boundingBox())!.height).toBeLessThanOrEqual(460);
  const card = (await footer.locator("[data-footer-newsletter]").boundingBox())!;
  const links = (await footer.getByRole("link", { name: "Kõik koolitused" }).boundingBox())!;
  expect(card.x).toBeGreaterThan(links.x);
  expect(card.y).toBeLessThan(links.y + links.height); // side by side, not under each other
  await expect(footer.getByRole("heading", { level: 2, name: /Hea järgmine samm/ })).toHaveCSS("font-size", "28px");
});

test("below 900 px the newsletter card comes first, then the links; no page overflows at the check widths", async ({ page, isMobile }) => {
  test.skip(isMobile, "the widths are set here");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("/");
  const footer = page.locator("footer");
  const card = (await footer.locator("[data-footer-newsletter]").boundingBox())!;
  const links = (await footer.getByRole("link", { name: "Kõik koolitused" }).boundingBox())!;
  expect(card.y + card.height).toBeLessThanOrEqual(links.y);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/ru", "/kontakt"]) {
      await page.goto(path);
      expect(await noOverflow(page), `${path} @ ${width}`).toBe(true);
    }
  }
});
