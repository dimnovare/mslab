import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./test";

// Task 14: the campaign popup on the home page — Maria C37 (M1: D's popup and its behaviour kept), C39 (M3: no
// "Mitte praegu"), C40/C41 (M4: "Leia enda koolitus"). Only on / and /ru, 6 s after the page loads, once per browser
// session (sessionStorage "mslab-camp"), never on any other page. A modal dialog: focus moves in and stays inside, Esc,
// ✕, the backdrop and (on a phone, where it is a bottom sheet) a downward swipe close it, and focus goes back.
//
// These tests only read the seed campaign ("−15% Lash Lift BOTOX koolitusele", code TALV15, the seed picture). The
// tests that change the campaign row (an uploaded img/ picture, a switched-off campaign) are in admin-site.spec.ts, which
// runs after every other test (playwright.config.ts). Every test is a new browser context, so a new session.

const TITLE = "−15% Lash Lift BOTOX koolitusele";
const popup = (page: Page) => page.getByRole("dialog", { name: TITLE });
const anyDialog = (page: Page) => page.getByRole("dialog");
const seen = (page: Page) => page.evaluate(() => sessionStorage.getItem("mslab-camp"));
const scrollLocked = (page: Page) => page.evaluate(() => document.documentElement.style.overflow === "hidden");
const newSession = (page: Page) => page.evaluate(() => sessionStorage.removeItem("mslab-camp"));

/** A finger pulling `el` down by `distance` px (Chrome DevTools touch input, as in swipe.spec.ts). */
async function swipeDown(page: Page, el: Locator, distance: number) {
  const box = await el.boundingBox();
  if (!box) throw new Error("swipe target has no box");
  const x = box.x + box.width / 2;
  const fromY = box.y + 60;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: fromY }] });
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: fromY + (distance * i) / steps }] });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

test.describe("the site's own timing (brief)", () => {
  test.use({ campaignPopup: "site" });

  test("on / it opens after 6 s with 'Leia enda koolitus' and no 'Mitte praegu'; not again after a reload; never on /koolitused", async ({ page }) => {
    test.setTimeout(60_000);
    // Timed from the page's first byte (waitUntil "commit"). The popup's 6 s start later still, once the page has run
    // its scripts, so for the first 5 s there is no dialog at all: a shorter delay (1 s, say) fails here.
    await page.goto("/", { waitUntil: "commit" });
    const start = Date.now();
    while (Date.now() - start < 5000) {
      expect(await anyDialog(page).count(), `no dialog at ${Date.now() - start} ms`).toBe(0);
      await page.waitForTimeout(200);
    }
    expect(await seen(page)).toBeNull();
    await page.waitForTimeout(Math.max(0, 6500 - (Date.now() - start)));
    await expect(popup(page)).toBeVisible();
    await expect(popup(page).getByRole("link", { name: "Leia enda koolitus" })).toBeVisible(); // M4
    await expect(page.getByText("Mitte praegu")).toHaveCount(0); // M3
    expect(await seen(page)).toBe("1"); // set when it is shown

    await page.reload();
    await page.waitForTimeout(6500);
    await expect(anyDialog(page)).toHaveCount(0); // once per session

    await newSession(page);
    await page.goto("/koolitused");
    await page.waitForTimeout(6500);
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await seen(page)).toBeNull();
  });
});

test.describe("the dialog", () => {
  // long enough to put the focus somewhere first
  test.use({ campaignPopup: 2000 });

  test("D's card in a modal dialog named by its title; focus moves in, Tab stays inside, Esc closes and gives the focus back", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const logo = page.getByRole("banner").getByRole("link", { name: "MS LAB Koolituskeskus — avaleht" });
    await logo.focus();
    const p = popup(page);
    await expect(p).toBeVisible();
    await expect(p).toHaveAttribute("aria-modal", "true");
    const titleId = await p.getAttribute("aria-labelledby");
    await expect(page.locator(`[id="${titleId}"]`)).toHaveText(TITLE);
    await expect(p.getByRole("heading", { level: 2 })).toHaveText(TITLE);
    // D's campHtml: picture, kicker, title, text, code with "Kopeeri", the button; no "Mitte praegu"
    const card = p.locator("[data-campaign-card]");
    await expect(card.locator("img")).toHaveAttribute("src", "/seed/lash-editorial.jpg");
    await expect(card.getByText("Talvine pakkumine")).toBeVisible();
    await expect(card.getByText("Kehtib registreerumisel kuni 30.11. Sisesta kood ostukorvis.")).toBeVisible();
    await expect(card.locator("[data-campaign-code]")).toHaveText("TALV15");
    await expect(p.getByRole("link", { name: "Leia enda koolitus" })).toHaveAttribute("href", "/koolitused/lash-lift-botox");
    await expect(p.getByRole("button")).toHaveText(["", "Kopeeri"]); // ✕ (an icon) and Kopeeri: nothing else
    await expect(page.getByText("Mitte praegu")).toHaveCount(0);

    const close = p.getByRole("button", { name: "Sulge" });
    const copy = p.getByRole("button", { name: "Kopeeri" });
    const cta = p.getByRole("link", { name: "Leia enda koolitus" });
    await expect(close).toBeFocused();
    expect(await scrollLocked(page)).toBe(true);
    await page.keyboard.press("Tab");
    await expect(copy).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cta).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused(); // round again, never out to the page
    await page.keyboard.press("Shift+Tab");
    await expect(cta).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(anyDialog(page)).toHaveCount(0);
    await expect(logo).toBeFocused();
    expect(await scrollLocked(page)).toBe(false);
  });

  test("✕ closes it and gives the focus back; a click on the card does not, a click on the backdrop does", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const logo = page.getByRole("banner").getByRole("link", { name: "MS LAB Koolituskeskus — avaleht" });
    await logo.focus();
    await expect(popup(page)).toBeVisible();
    await popup(page).getByRole("button", { name: "Sulge" }).click();
    await expect(anyDialog(page)).toHaveCount(0);
    await expect(logo).toBeFocused();
    expect(await scrollLocked(page)).toBe(false);

    await newSession(page);
    await page.reload();
    const p = popup(page);
    await expect(p).toBeVisible();
    await p.getByText("Kehtib registreerumisel").click();
    await expect(p).toBeVisible();
    await page.mouse.click(6, 6); // the backdrop: the window's top left corner, outside the card (and above the phone sheet)
    await expect(anyDialog(page)).toHaveCount(0);
  });

});

test.describe("leaving the home page early", () => {
  // the course card is clicked once the page has loaded, well before the popup's time
  test.use({ campaignPopup: 4000 });

  test("a client-side move to a course before the popup's time: none there; back on the home page it comes", async ({ page }) => {
    await page.goto("/");
    await page.locator("[data-course-card]").first().click();
    await expect(page).toHaveURL(/\/koolitused\/[a-z0-9-]+$/);
    await page.waitForTimeout(4600);
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await seen(page)).toBeNull();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(popup(page)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("short delay", () => {
  test.use({ campaignPopup: 300 });

  test("Kopeeri copies the code and says 'Kopeeritud'", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    const p = popup(page);
    await p.getByRole("button", { name: "Kopeeri" }).click();
    await expect(p.getByRole("status")).toHaveText("Kopeeritud");
    await expect(p.locator("[data-campaign-copy]")).toHaveText("Kopeeritud");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("TALV15");
  });

  test("without a clipboard the code is selected for copying instead", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }));
    await page.goto("/");
    const p = popup(page);
    await p.getByRole("button", { name: "Kopeeri" }).click();
    await expect(p.getByRole("status")).toHaveText("Kood on märgitud.");
    expect(await page.evaluate(() => getSelection()?.toString())).toBe("TALV15");
    await expect(p).toBeVisible();
  });

  test("when the browser refuses storage, it is shown once per page load: not again after closing, nor back on the home page", async ({ page }) => {
    await page.addInitScript(() =>
      Object.defineProperty(window, "sessionStorage", {
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      }),
    );
    await page.goto("/");
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(anyDialog(page)).toHaveCount(0);
    await page.waitForTimeout(1500);
    await expect(anyDialog(page)).toHaveCount(0);

    // home → course → home without a page load (the marker survives only in the same document)
    await page.evaluate(() => ((window as unknown as { sameLoad: boolean }).sameLoad = true));
    await page.locator("[data-course-card]").first().click();
    await expect(page).toHaveURL(/\/koolitused\/[a-z0-9-]+$/);
    await page.getByRole("banner").getByRole("link", { name: "MS LAB Koolituskeskus — avaleht" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("[data-hero]")).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { sameLoad?: boolean }).sameLoad)).toBe(true);

    // a new page load may show it once more
    await page.reload();
    await expect(popup(page)).toBeVisible();
  });

  test("ctrl/cmd-, shift- or middle-click on the button opens the course elsewhere: the popup stays, the focus too", async ({ page, context }) => {
    await page.goto("/");
    const p = popup(page);
    const cta = p.getByRole("link", { name: "Leia enda koolitus" });
    await expect(p).toBeVisible();
    for (const how of [{ modifiers: ["ControlOrMeta" as const] }, { modifiers: ["Shift" as const] }, { button: "middle" as const }]) {
      const opened = context.waitForEvent("page", { timeout: 5000 }).catch(() => null);
      await cta.click(how);
      (await opened)?.close();
      await expect(p, JSON.stringify(how)).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
      expect(await scrollLocked(page)).toBe(true);
      await expect(p.locator(":focus"), JSON.stringify(how)).toHaveCount(1); // the focus is still inside
    }
    await cta.click(); // a plain click still goes
    await expect(page).toHaveURL(/\/koolitused\/lash-lift-botox$/);
    await expect(anyDialog(page)).toHaveCount(0);
  });

  test("the button closes the popup and opens the course", async ({ page }) => {
    await page.goto("/");
    await popup(page).getByRole("link", { name: "Leia enda koolitus" }).click();
    await expect(page).toHaveURL(/\/koolitused\/lash-lift-botox$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lash Lift BOTOX baaskoolitus");
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await scrollLocked(page)).toBe(false);
  });

  test("/ru: Russian controls and button, the link stays in Russian", async ({ page }) => {
    await page.goto("/ru");
    const p = popup(page); // the seed campaign has Estonian texts only: they are shown (content falls back to et)
    await expect(p.getByRole("button", { name: "Закрыть" })).toBeFocused();
    await expect(p.getByRole("button", { name: "Копировать" })).toBeVisible();
    await expect(p.getByRole("link", { name: "Найти свой курс" })).toHaveAttribute("href", "/ru/koolitused/lash-lift-botox");
    expect(await seen(page)).toBe("1");
  });

  test("never on any other page: catalogue, course, calendar, practice, cart, Russian pages, admin", async ({ page }) => {
    for (const path of ["/koolitused", "/koolitused/lash-lift-botox", "/koolituskalender", "/praktika", "/ostukorv", "/kontakt", "/ru/koolitused", "/ru/ostukorv", "/admin/login"]) {
      await page.goto(path);
      await page.waitForTimeout(900);
      await expect(anyDialog(page), path).toHaveCount(0);
      expect(await seen(page), path).toBeNull();
    }
    await page.goto("/"); // the same session still gets it on the home page
    await expect(popup(page)).toBeVisible();
  });

  test("no sideways scrolling at 390, 834, 1440 and 2560; the picture beside the text when there is room; controls ≥ 44 px", async ({ page, isMobile }) => {
    test.skip(isMobile, "the desktop project sets each width");
    for (const [w, h] of [[390, 844], [834, 1112], [1440, 900], [2560, 1440]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto("/");
      const p = popup(page);
      await expect(p).toBeVisible();
      const panel = p.locator("[data-campaign-panel]");
      await expect.poll(() => panel.evaluate((e) => getComputedStyle(e).transform), `${w}: settled`).toBe("none");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${w}: page`).toBeLessThanOrEqual(0);
      expect(await panel.evaluate((e) => e.scrollWidth - e.clientWidth), `${w}: card`).toBeLessThanOrEqual(0);
      for (const el of [p.getByRole("button", { name: "Sulge" }), p.getByRole("button", { name: "Kopeeri" }), p.getByRole("link", { name: "Leia enda koolitus" })]) {
        const b = (await el.boundingBox())!;
        expect(b.height, `${w}: ${await el.textContent()}`).toBeGreaterThanOrEqual(44);
        expect(b.width, `${w}: ${await el.textContent()}`).toBeGreaterThanOrEqual(44);
        expect(b.x + b.width, `${w}: inside the window`).toBeLessThanOrEqual(w);
      }
      const photo = (await p.locator("[data-campaign-card] img").boundingBox())!;
      const title = (await p.getByRole("heading", { level: 2 }).boundingBox())!;
      const box = (await panel.boundingBox())!;
      if (w >= 834) {
        expect(photo.x + photo.width, `${w}: picture left of the text`).toBeLessThanOrEqual(title.x);
        expect(Math.abs(box.x + box.width / 2 - w / 2), `${w}: centred`).toBeLessThan(2);
        expect(box.width, `${w}: D's 840 px`).toBeLessThanOrEqual(840);
      } else {
        expect(photo.y + photo.height, `${w}: picture on top`).toBeLessThanOrEqual(title.y);
        expect(Math.round(box.y + box.height), `${w}: a bottom sheet`).toBe(h);
        expect(Math.round(box.width), `${w}: full width`).toBe(w);
      }
      await page.keyboard.press("Escape");
      await expect(anyDialog(page)).toHaveCount(0);
      await newSession(page);
    }
  });
});

test.describe("phone: the bottom sheet closes with a downward swipe (Dim: swipe wherever it matters)", () => {
  test.skip(({ isMobile }) => !isMobile, "touch swipes: phone project only");
  test.use({ campaignPopup: 300 });

  test("a short pull springs back; a swipe down closes it", async ({ page }) => {
    await page.goto("/");
    const p = popup(page);
    const panel = p.locator("[data-campaign-panel]");
    await expect(p).toBeVisible();
    await expect.poll(() => panel.evaluate((e) => getComputedStyle(e).transform)).toBe("none");
    const box = (await panel.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(page.viewportSize()!.height); // a bottom sheet
    await swipeDown(page, panel, 30);
    await expect(p).toBeVisible();
    await expect.poll(() => panel.evaluate((e) => getComputedStyle(e).transform)).toBe("none"); // back in place
    await swipeDown(page, panel, 260);
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await scrollLocked(page)).toBe(false);
    await expect(page).toHaveURL(/\/$/); // a swipe is not a tap on the button
  });

  test("with reduced motion: no sliding, but the swipe still closes it", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const p = popup(page);
    const panel = p.locator("[data-campaign-panel]");
    await expect(p).toBeVisible();
    expect(await panel.evaluate((e) => getComputedStyle(e).transitionDuration)).toBe("0s");
    expect(await panel.evaluate((e) => getComputedStyle(e).transform)).toBe("none"); // no entrance offset
    await swipeDown(page, panel, 260);
    await expect(anyDialog(page)).toHaveCount(0);
  });
});
