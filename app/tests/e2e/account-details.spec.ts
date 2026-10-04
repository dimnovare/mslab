import type { Locator, Page } from "@playwright/test";
import { clientEmail, insertAccountFixtures, insertClient, signInAsClient, storedClient, storedNewsletter, storedRegistration } from "./account";
import { signInAsAdmin, type CreatedRows } from "./admin-login";
import { removeAdminRows, removeClientRows } from "./fixtures";
import { submitsForms, test, expect } from "./test";

// Phase 2a Task 8: "Minu andmed" (/konto/andmed). Name and phone (both optional) and the language with one "Salvesta" ("Salvestatud."
// in a live region; a language change saves, then opens the same tab in that language); "Saada mulle uudiskirja", a switch that saves
// at once (a confirmed subscriber, or none); at the very bottom "Kustuta konto" with one inline confirmation step: the account goes,
// the registrations stay with Maria (the admin still sees them), the browser is signed out and forgets the account, and the home page
// says "Konto on kustutatud.". Every client is a sample address (`e2e-client-details-…@example.test`, never mailed), written straight
// to the local database and removed after each test.

/** The addresses this worker's tests made rows for: removed after each test. */
const made = new Set<string>();
test.afterEach(async () => {
  for (const email of made) await removeClientRows(email);
  made.clear();
});

function address(label: string, project: string): string {
  const email = clientEmail(`details-${label}`, project);
  made.add(email);
  return email;
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const height = async (l: Locator) => (await l.boundingBox())!.height;
const status = (page: Page) => page.locator("[data-details-status]");
const pathOf = (page: Page) => new URL(page.url()).pathname;

/** What this browser keeps about the account: the remembered e-mail, the login's code step, the copy of the favourites, the change requests sent. */
const kept = (page: Page) =>
  page.evaluate(() => ({
    email: localStorage.getItem("mslab-email"),
    code: sessionStorage.getItem("mslab-login-code"),
    favourites: sessionStorage.getItem("mslab-account-fav"),
    sent: sessionStorage.getItem("mslab-change-sent"),
  }));

test("Minu andmed: the e-mail, name and phone (optional) and the language with one Salvesta; a language change saves and opens the same tab in that language", async ({ page }, info) => {
  submitsForms();
  const email = address("profile", info.project.name);
  await removeClientRows(email);
  await insertClient(email, { name: "Kati Tamm" });
  await signInAsClient(page, email);
  await page.goto("/konto/andmed");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sinu andmed");
  await expect(page.locator("[data-account-email]")).toHaveText(`E-post${email}`);
  const name = page.getByLabel("Nimi");
  const phone = page.getByLabel("Telefon");
  await expect(name).toHaveValue("Kati Tamm");
  await expect(phone).toHaveValue("");
  await expect(phone).toHaveAttribute("type", "tel");
  await expect(page.getByRole("radio", { name: "Eesti keel" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Русский язык" })).not.toBeChecked();
  const save = page.getByRole("button", { name: "Salvesta" });

  // saved as typed, one line each; said in the live region
  await name.fill("  Kati   Kask ");
  await phone.fill("+372 5555 0101");
  await save.click();
  await expect(status(page)).toHaveText("Salvestatud.");
  await expect(status(page)).toHaveAttribute("role", "status");
  await expect(name).toHaveValue("Kati Kask");
  expect(await storedClient(email)).toMatchObject({ name: "Kati Kask", phone: "+372 5555 0101", locale: "et" });
  // typing again takes the word away; both fields may be empty
  await phone.fill("");
  await expect(status(page)).toHaveText("");
  await save.click();
  await expect(status(page)).toHaveText("Salvestatud.");
  expect(await storedClient(email)).toMatchObject({ name: "Kati Kask", phone: "" });
  await page.reload();
  await expect(name).toHaveValue("Kati Kask");
  await expect(phone).toHaveValue("");

  // a failure says so, and nothing moves
  await page.route("**/api/konto/andmed", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"ok":false,"error":"server"}' }), { times: 1 });
  await page.getByRole("radio", { name: "Русский язык" }).check();
  await save.click();
  await expect(status(page)).toHaveText("Ei õnnestunud salvestada. Proovi uuesti.");
  expect(pathOf(page)).toBe("/konto/andmed");
  expect((await storedClient(email))!.locale).toBe("et");

  // the language: saved first, then the same tab in Russian, which says it was saved (the fragment is read once and removed)
  await save.click();
  await expect.poll(() => pathOf(page)).toBe("/ru/konto/andmed");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ваши данные");
  await expect(status(page)).toHaveText("Сохранено.");
  expect(new URL(page.url()).hash).toBe("");
  expect(new URL(page.url()).search).toBe("");
  await expect(page.getByRole("radio", { name: "Русский язык" })).toBeChecked();
  await expect(page.getByLabel("Имя")).toHaveValue("Kati Kask");
  expect((await storedClient(email))!.locale).toBe("ru");
  await page.reload();
  await expect(status(page)).toHaveText(""); // said once

  // and back: Estonian
  await page.getByRole("radio", { name: "Eesti keel" }).check();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect.poll(() => pathOf(page)).toBe("/konto/andmed");
  await expect(status(page)).toHaveText("Salvestatud.");
  expect((await storedClient(email))!.locale).toBe("et");

  // targets and widths
  for (const target of [save, page.locator("label", { has: page.getByRole("radio", { name: "Eesti keel" }) }), name, phone])
    expect(await height(target)).toBeGreaterThanOrEqual(44);
  for (const width of [390, 834, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noOverflow(page), `no horizontal overflow at ${width}`).toBe(true);
  }
});

test("Saada mulle uudiskirja: a switch that saves at once with its own line — on is a confirmed subscriber, off removes it; a failure is put back", async ({ page }, info) => {
  submitsForms();
  const email = address("newsletter", info.project.name);
  await removeClientRows(email);
  const clientId = await insertClient(email);
  await signInAsClient(page, email);
  await page.goto("/konto/andmed");

  const sw = page.getByRole("switch", { name: "Saada mulle uudiskirja" });
  const line = page.locator("[data-details-newsletter-status]");
  await expect(sw).not.toBeChecked();
  // the whole row is the target
  const row = page.locator("label", { has: sw });
  expect(await height(row)).toBeGreaterThanOrEqual(44);
  await row.getByText("Saada mulle uudiskirja").click();
  await expect(sw).toBeChecked();
  await expect(line).toHaveText("Salvestatud.");
  await expect.poll(() => storedNewsletter(email)).toEqual({ email, confirmed: true, clientId });
  // not tied to Salvesta: the profile's line says nothing
  await expect(status(page)).toHaveText("");
  await page.reload();
  await expect(sw).toBeChecked();

  await sw.click();
  await expect(sw).not.toBeChecked();
  await expect(line).toHaveText("Salvestatud.");
  await expect.poll(() => storedNewsletter(email)).toBeNull();

  await page.route("**/api/konto/uudiskiri", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"ok":false,"error":"server"}' }), { times: 1 });
  await sw.click();
  await expect(line).toHaveText("Ei õnnestunud salvestada. Proovi uuesti.");
  await expect(sw).not.toBeChecked();
  expect(await storedNewsletter(email)).toBeNull();
});

test("Kustuta konto: quiet, at the very bottom; an inline step (Tühista gives the focus back); Jah, kustuta deletes the account, keeps the registration for Maria, signs out, forgets and says so on the home page", async ({ page, context, visitorIp, isMobile }, info) => {
  submitsForms();
  const email = address("delete", info.project.name);
  await removeClientRows(email);
  const f = await insertAccountFixtures(email, { name: "Kati Tamm", cards: ["awaiting"] });
  const registration = f.registrations.awaiting!;
  await signInAsClient(page, email); // Minu koolitused: the e-mail is remembered, the copy of the favourites kept
  await expect(page.locator("[data-account-dashboard]")).toBeVisible();
  // what else this tab may keep: a login's code step, a change request sent
  await page.evaluate(() => {
    sessionStorage.setItem("mslab-login-code", JSON.stringify({ sentTo: "someone@example.test", sentAt: Date.now() }));
    sessionStorage.setItem("mslab-change-sent", JSON.stringify([{ id: 1, startsAt: "2026-12-01T08:00:00.000Z", at: Date.now() }]));
  });
  await expect.poll(() => kept(page)).toMatchObject({ email, favourites: "[]" });
  await page.goto("/konto/andmed");

  // quiet text at the very bottom: the last control of the page's content
  const del = page.getByRole("button", { name: "Kustuta konto" });
  await expect(page.locator("[data-account-details]").locator("button, input, a").last()).toHaveAttribute("data-delete-account", "");
  expect(await height(del)).toBeGreaterThanOrEqual(44);
  expect(await del.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");

  // the step: in the page (no dialog), the focus in it, its question, two answers; Tühista closes it and gives the focus back
  await del.click();
  const step = page.locator("[data-delete-confirm]");
  await expect(step).toBeFocused();
  await expect(step).toHaveAccessibleName("Kas kustutame su konto? Sinu registreeringud jäävad Mariale alles.");
  await expect(step.getByRole("button")).toHaveText(["Jah, kustuta", "Tühista"]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const button of await step.getByRole("button").all()) expect(await height(button)).toBeGreaterThanOrEqual(44);
  for (const width of [390, 834, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noOverflow(page), `no horizontal overflow at ${width}`).toBe(true);
  }
  await page.setViewportSize(info.project.use.viewport!);
  await step.getByRole("button", { name: "Tühista" }).click();
  await expect(step).toHaveCount(0);
  await expect(del).toBeFocused();
  // Esc closes it too
  await del.click();
  await expect(step).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(step).toHaveCount(0);
  await expect(del).toBeFocused();
  expect(await storedClient(email)).not.toBeNull();

  // a failure says so and keeps the step
  await page.route("**/api/konto/kustuta", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"ok":false,"error":"server"}' }), { times: 1 });
  await del.click();
  await step.getByRole("button", { name: "Jah, kustuta" }).click();
  await expect(step.getByRole("alert")).toHaveText("Kustutamine ei õnnestunud. Proovi uuesti.");
  expect(await storedClient(email)).not.toBeNull();

  // Jah, kustuta: the home page says so, once
  await step.getByRole("button", { name: "Jah, kustuta" }).click();
  await expect.poll(() => pathOf(page)).toBe("/");
  await expect(page.locator("[data-flash-notice]")).toContainText("Konto on kustutatud.");
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  // signed out: no cookie, the header says Logi sisse
  const cookies = (await context.cookies()).map((c) => c.name);
  expect(cookies).not.toContain("__Host-mslab_client");
  expect(cookies).not.toContain("mslab_in");
  for (const link of await page.locator("[data-account-link]").all()) await expect(link).toHaveAttribute("data-account-link", "out");
  if (!isMobile) await expect(page.locator("header").getByRole("link", { name: "Logi sisse", exact: true })).toBeVisible();
  // this browser forgot the account
  expect(await kept(page)).toEqual({ email: null, code: null, favourites: null, sent: null });
  // the account is gone; the registration stays with its name and e-mail, unlinked
  expect(await storedClient(email)).toBeNull();
  expect(await storedRegistration(registration)).toEqual({ clientId: null, email, name: "Kati Tamm" });
  // a reload does not say it again; /konto now asks to sign in, with nothing filled in
  await page.reload();
  await expect(page.locator("[data-flash-notice]")).not.toContainText("Konto on kustutatud.");
  await page.goto("/konto");
  await expect(page).toHaveURL(/\/konto\/sisene$/);
  await expect(page.getByRole("textbox", { name: "E-post", exact: true })).toHaveValue("");

  // Maria still has the registration: Registreerimised
  const created: CreatedRows = { tokens: new Set(), sessions: new Set() };
  try {
    await signInAsAdmin(page, context, visitorIp, created);
    await page.goto(`/admin/registreerimised?id=${registration}`);
    await expect(page.locator(`[data-registration="${registration}"]`)).toContainText("Kati Tamm");
    await expect(page.locator(`[data-registration-detail="${registration}"]`)).toContainText(email);
  } finally {
    await removeAdminRows(created);
  }
});

test("Russian: the step and the home page's notice in Russian", async ({ page }, info) => {
  submitsForms();
  const email = address("delete-ru", info.project.name);
  await removeClientRows(email);
  await insertClient(email, { locale: "ru" });
  await signInAsClient(page, email);
  await page.goto("/ru/konto/andmed");
  await page.getByRole("button", { name: "Удалить кабинет" }).click();
  const step = page.locator("[data-delete-confirm]");
  await expect(step).toHaveAccessibleName("Удалить ваш личный кабинет? Ваши регистрации останутся у Марии.");
  await expect(step.getByRole("button")).toHaveText(["Да, удалить", "Отмена"]);
  await step.getByRole("button", { name: "Да, удалить" }).click();
  await expect.poll(() => pathOf(page)).toBe("/ru");
  await expect(page.locator("[data-flash-notice]")).toContainText("Личный кабинет удалён.");
  expect(await storedClient(email)).toBeNull();
});
