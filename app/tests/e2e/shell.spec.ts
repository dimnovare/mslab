import { test, expect } from "./test";
import { LOCAL_FIXTURES, storedSubscriber, testEmail } from "./fixtures";

// Site shell (Task 6): B header with Manrope UI font (G3, G4), footer with the lilac newsletter (H13), ET + RU (G8).

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "desktop layout only");

  test("header and footer", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "Koolitused" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Logi sisse" })).toBeVisible();
    const navFont = await header.getByRole("link", { name: "Koolitused" }).evaluate((el) => getComputedStyle(el).fontFamily);
    expect(navFont).toMatch(/Manrope/i);
    await page.mouse.wheel(0, 900); await page.waitForTimeout(400);
    expect(await header.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
    await expect(page.locator("footer").getByText("Otse sinu postkasti.")).toBeVisible();
    await page.goto("/ru"); await expect(page.locator("header").getByRole("link", { name: "Курсы" })).toBeVisible();
  });

  test("menu, login and language switch are Manrope 500 15px (G4)", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");
    for (const el of [
      header.getByRole("navigation").getByRole("link", { name: "Praktika" }),
      header.getByRole("link", { name: "Logi sisse" }),
      header.getByRole("link", { name: /Vaheta keelt/ }),
    ]) {
      const s = await el.evaluate((e) => { const c = getComputedStyle(e); return { f: c.fontFamily, w: c.fontWeight, z: c.fontSize }; });
      expect(s.f).toMatch(/Manrope/i); expect(s.w).toBe("500"); expect(s.z).toBe("15px");
    }
  });

  test("home header is transparent over the hero and follows the hero tone (G3, G5)", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");
    expect(await header.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    const ink = await header.evaluate((el) => getComputedStyle(el).color);
    await page.evaluate(() => { document.documentElement.dataset.heroTone = "dark"; });
    await expect.poll(() => header.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
    await page.evaluate(() => { document.documentElement.dataset.heroTone = "light"; });
    await expect.poll(() => header.evaluate((el) => getComputedStyle(el).color)).toBe(ink);
  });

  test("inner pages have a white sticky header and the account placeholder", async ({ page }) => {
    await page.goto("/konto");
    const header = page.locator("header");
    const s = await header.evaluate((el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, pos: c.position }; });
    expect(s).toEqual({ bg: "rgb(255, 255, 255)", pos: "sticky" });
    await expect(page.getByRole("heading", { name: "Õppija konto avaneb peagi" })).toBeVisible();
    await header.getByRole("link", { name: /Vaheta keelt/ }).click();
    await expect(page).toHaveURL(/\/ru\/konto$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(page.getByRole("heading", { name: "Личный кабинет ученика скоро откроется" })).toBeVisible();
  });

  test("unknown paths show a localized 404 inside the shell", async ({ page }) => {
    const et = await page.goto("/olematu-leht");
    expect(et?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Lehte ei leitud" })).toBeVisible();
    await expect(page.locator("header").getByRole("link", { name: "Koolitused" })).toBeVisible();
    const ru = await page.goto("/ru/net-takoj");
    expect(ru?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
  });

  test("the whole host is noindex", async ({ request }) => {
    for (const p of ["/", "/ru", "/konto", "/brand/logo.png"]) {
      const res = await request.get(p);
      expect(res.headers()["x-robots-tag"], p).toBe("noindex, nofollow");
    }
  });

  test("newsletter form shows the sent state", async ({ page }, info) => {
    const addr = testEmail("shell-nl", info.project.name);
    await page.goto("/konto");
    const footer = page.locator("footer");
    await footer.getByLabel("Sinu e-post").fill(addr);
    await footer.getByRole("checkbox").check();
    await footer.getByRole("button", { name: "Liitu" }).click();
    await expect(footer.getByText("Kontrolli oma postkasti")).toBeVisible();
    if (LOCAL_FIXTURES) expect(await storedSubscriber(addr)).toMatchObject({ email: addr, confirmed: false });
  });
});

test.describe("mobile", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile layout only");

  test("burger menu opens and lists the five links", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "Koolituskalender", exact: true })).toHaveCount(0); // desktop menu hidden
    await header.getByRole("button", { name: "Ava menüü" }).click();
    const menu = page.getByRole("dialog");
    await expect(menu).toBeVisible();
    for (const name of ["Koolitused", "Koolituskalender", "Praktika", "Koolitaja", "Uudised"])
      await expect(menu.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Logi sisse" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("no horizontal overflow", async ({ page }) => {
    for (const p of ["/", "/konto", "/ru"]) {
      await page.goto(p);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), p).toBeLessThanOrEqual(390);
    }
  });
});
