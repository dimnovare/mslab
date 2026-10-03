import { scrollLeft, swipe } from "./touch";
import { test, expect } from "./test";

// Touch swipes on the phone project (isMobile + hasTouch), as a finger does them (tests/e2e/touch.ts).

test.skip(({ isMobile }) => !isMobile, "touch swipes: phone project only");

test.describe("touch swipes", () => {
  test("home hero: swipe left advances the slide, swipe right goes back (H2, H5)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" }); // no autoplay racing the swipe
    await page.goto("/");
    const hero = page.locator("[data-hero]");
    const counter = hero.getByText(/^\d\d \/ \d\d$/);
    await expect(counter).toHaveText("01 / 05");
    await swipe(page, hero, "left", 0.3);
    await expect(counter).toHaveText("02 / 05");
    await swipe(page, hero, "left", 0.3);
    await expect(counter).toHaveText("03 / 05");
    await swipe(page, hero, "right", 0.3);
    await expect(counter).toHaveText("02 / 05");
  });

  test("home blog carousel: swipe scrolls the track (H16)", async ({ page }) => {
    await page.goto("/");
    const track = page.getByRole("group", { name: "Postituste karussell" });
    expect(await scrollLeft(track)).toBe(0);
    await swipe(page, track, "left");
    await expect.poll(() => scrollLeft(track)).toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/$/); // a swipe is not a tap on a card
  });

  test("course page: swipe scrolls the thumbnails, and the lightbox changes image (P2)", async ({ page }) => {
    await page.goto("/koolitused/kulmumeistri-baaskoolitus");
    const thumbs = page.locator("[data-gallery-track]");
    expect(await scrollLeft(thumbs)).toBe(0);
    await swipe(page, thumbs, "left");
    await expect.poll(() => scrollLeft(thumbs)).toBeGreaterThan(0);
    await expect(page.getByRole("dialog")).toHaveCount(0); // a swipe does not open an image

    await page.locator("[data-gallery-main]").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("1 / 4");
    await swipe(page, dialog, "left");
    await expect(dialog).toContainText("2 / 4");
    await swipe(page, dialog, "left");
    await expect(dialog).toContainText("3 / 4");
    await swipe(page, dialog, "right");
    await expect(dialog).toContainText("2 / 4");
  });

  test("trainer works: swipe moves to the next images, and the lightbox changes image (T2)", async ({ page }) => {
    await page.goto("/koolitaja");
    const track = page.locator("[data-works-track]");
    expect(await scrollLeft(track)).toBe(0);
    await swipe(page, track, "left");
    await expect.poll(() => scrollLeft(track)).toBeGreaterThan(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // The previous arrow becomes active once the track has moved.
    await expect(page.locator("[data-works]").getByRole("button", { name: "Eelmine" })).not.toHaveAttribute("aria-disabled", "true");

    await page.evaluate(() => document.querySelector("[data-works-track]")!.scrollTo({ left: 0 }));
    await page.locator("[data-work]").first().getByRole("button").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("1 / 7");
    await swipe(page, dialog, "left");
    await expect(dialog).toContainText("2 / 7");
    await swipe(page, dialog, "right");
    await expect(dialog).toContainText("1 / 7");
    await swipe(page, dialog, "right"); // wraps around
    await expect(dialog).toContainText("7 / 7");
  });
});
