import { submitsForms, test, expect } from "./test";
import { LOCAL_FIXTURES, storedRequests, storedSubscriber, testEmail } from "./fixtures";

// Task 10: the forms store what they are sent (local dev DB), double opt-in for the newsletter, honeypot, rate limit,
// and the Task 6 carry-overs (newsletter keeps its state after a failed attempt, announces success, ink focus ring on
// the lilac surface, 44px touch targets). Local `next dev` has no RESEND_API_KEY / TELEGRAM_BOT_TOKEN, so nothing is
// e-mailed (global-setup refuses to run otherwise).

const INK = "rgb(34, 34, 34)";

test.describe("newsletter", () => {
  test("a failed attempt keeps the e-mail and the consent; each error is on its own field", async ({ page }, info) => {
    submitsForms();
    const addr = testEmail("nl-failed", info.project.name);
    await page.goto("/konto");
    const footer = page.locator("footer");
    const form = footer.locator("[data-newsletter-form]");
    await expect(form).toHaveAttribute("method", "post");
    const email = footer.getByLabel("Sinu e-post");
    const consent = footer.getByRole("checkbox");
    const submit = footer.getByRole("button", { name: "Liitu" });

    await email.fill("vale-aadress");
    await consent.check();
    await submit.click();
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAccessibleDescription("Sisesta korrektne e-posti aadress.");
    await expect(consent).toBeChecked(); // React did not reset the form
    await expect(consent).not.toHaveAttribute("aria-invalid", "true");

    await email.fill(addr);
    await consent.uncheck();
    await submit.click();
    await expect(consent).toBeFocused();
    await expect(consent).toHaveAttribute("aria-invalid", "true");
    await expect(consent).toHaveAccessibleDescription("See väli on kohustuslik.");
    await expect(email).not.toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveValue(addr);
    if (LOCAL_FIXTURES) expect(await storedSubscriber(addr)).toBeNull();
  });

  test("sign-up: announced in the status region, stored unconfirmed; the e-mailed link confirms it", async ({ page }, info) => {
    submitsForms();
    const addr = testEmail("nl", info.project.name);
    await page.goto("/koolitused");
    const footer = page.locator("footer");
    const status = footer.locator("[data-newsletter-status]");
    // The polite live region is in the page before anything is sent, so its new content is announced.
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toBeEmpty();
    await footer.getByLabel("Sinu e-post").fill(addr.toUpperCase());
    await footer.getByRole("checkbox").check();
    await footer.getByRole("button", { name: "Liitu" }).click();
    await expect(status).toContainText("Kontrolli oma postkasti");
    await expect(status).toContainText("Saatsime sulle kinnituskirja.");
    await expect(status).toBeFocused();

    test.skip(!LOCAL_FIXTURES, "reads the confirmation token from the local database");
    const sub = await storedSubscriber(addr); // stored lowercased
    expect(sub).toMatchObject({ email: addr, locale: "et", confirmed: false });
    await page.goto(`/api/newsletter/confirm?t=${sub!.token}`);
    const notice = page.locator("[data-flash-notice]");
    await expect(notice).toContainText("Tere tulemast MS LABi!");
    await expect(notice).toContainText("Sinu liitumine on kinnitatud.");
    await expect(notice).toHaveAttribute("role", "status");
    // The notice removes ?uudiskiri from the address, so a reload does not repeat it.
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe("/");
    expect((await storedSubscriber(addr))?.confirmed).toBe(true);
    await notice.getByRole("button", { name: "Sulge" }).click();
    await expect(notice).toBeEmpty();
  });

  test("signing up again gives the same answer and keeps one row (does not tell whether the address exists)", async ({ page }, info) => {
    submitsForms();
    test.skip(!LOCAL_FIXTURES, "checks the local database");
    const addr = testEmail("nl-again", info.project.name);
    for (let i = 0; i < 2; i++) {
      await page.goto("/uudised");
      const footer = page.locator("footer");
      await footer.getByLabel("Sinu e-post").fill(addr);
      await footer.getByRole("checkbox").check();
      await footer.getByRole("button", { name: "Liitu" }).click();
      await expect(footer.locator("[data-newsletter-status]")).toContainText("Kontrolli oma postkasti");
    }
    const sub = await storedSubscriber(addr);
    expect(sub?.confirmed).toBe(false);
  });

  test("Russian sign-up confirms to /ru; a wrong link says the link is not valid", async ({ page }, info) => {
    submitsForms();
    test.skip(!LOCAL_FIXTURES, "reads the confirmation token from the local database");
    const addr = testEmail("nl-ru", info.project.name);
    await page.goto("/ru/koolitused");
    const footer = page.locator("footer");
    await footer.getByLabel("Ваш e-mail").fill(addr);
    await footer.getByRole("checkbox").check();
    await footer.getByRole("button", { name: "Подписаться" }).click();
    await expect(footer.locator("[data-newsletter-status]")).toContainText("Проверьте почту");
    const sub = await storedSubscriber(addr);
    expect(sub?.locale).toBe("ru");
    await page.goto(`/api/newsletter/confirm?t=${sub!.token}`);
    await expect(page.locator("[data-flash-notice]")).toContainText("Добро пожаловать в MS LAB!");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/ru");

    await page.goto("/api/newsletter/confirm?t=not-a-real-token-0000000000");
    await expect(page.locator("[data-flash-notice='warn']")).toContainText("See kinnituslink ei kehti.");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  });

  test("ink focus ring on the lilac surface; consent hit area and login pill at least 44px", async ({ page, isMobile }) => {
    await page.goto("/konto");
    const footer = page.locator("footer");
    const email = footer.getByLabel("Sinu e-post");
    await email.focus();
    expect(await email.evaluate((e) => getComputedStyle(e).outlineColor)).toBe(INK);
    await page.keyboard.press("Tab"); // the Liitu button
    expect(await footer.getByRole("button", { name: "Liitu" }).evaluate((e) => getComputedStyle(e).outlineColor)).toBe(INK);
    await page.keyboard.press("Tab"); // the consent box
    const consent = footer.getByRole("checkbox");
    await expect(consent).toBeFocused();
    expect(await consent.evaluate((e) => getComputedStyle(e).outlineColor)).toBe(INK);
    const label = await footer.locator("label:has(input[name='consent'])").boundingBox();
    expect(label!.height).toBeGreaterThanOrEqual(44);

    if (isMobile) {
      await page.locator("header").getByRole("button", { name: "Ava menüü" }).click();
      const login = page.getByRole("dialog").getByRole("link", { name: "Logi sisse" });
      expect((await login.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    } else {
      const login = page.locator("header").getByRole("link", { name: "Logi sisse" });
      expect((await login.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("spam protection", () => {
  test("a filled honeypot looks like success but nothing is stored", async ({ page }, info) => {
    submitsForms();
    const addr = testEmail("honeypot", info.project.name);
    await page.goto("/kontakt");
    const form = page.locator("[data-contact-form]");
    await form.getByLabel("Nimi").fill("Robot");
    await form.getByLabel("E-post", { exact: true }).fill(addr);
    await form.getByLabel("Sõnum").fill("Buy now");
    await form.locator("input[name='website']").evaluate((el) => ((el as HTMLInputElement).value = "https://spam.example"));
    await form.getByRole("button", { name: "Saada" }).click();
    await expect(page.getByText("Aitäh! Sinu sõnum on saadetud.")).toBeVisible();
    if (LOCAL_FIXTURES) expect(await storedRequests(addr)).toEqual([]);
  });

  test("5 submissions per form in 10 minutes; the 6th asks to try again later", async ({ page, isMobile }, info) => {
    submitsForms();
    test.skip(isMobile, "the limit is per visitor, not per layout: desktop only");
    test.skip(!LOCAL_FIXTURES, "the visitor address comes from x-forwarded-for only under next dev");
    const addr = testEmail("rate", info.project.name);
    for (let i = 1; i <= 6; i++) {
      await page.goto("/ostukorv?kursus=kulmumeistri-e-koolitus");
      const form = page.locator("[data-interest-form]");
      await form.getByLabel("E-post").fill(addr);
      await form.getByRole("button").click();
      if (i <= 5) await expect(page.getByText("Aitäh! Anname teada, kui makse on avatud.")).toBeVisible();
      else {
        const error = form.getByRole("alert");
        await expect(error).toHaveText("Liiga palju katseid. Proovi mõne minuti pärast.");
        await expect(error).toBeFocused();
      }
    }
    expect(await storedRequests(addr)).toHaveLength(5);
  });
});
