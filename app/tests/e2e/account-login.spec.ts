import type { Page } from "@playwright/test";
import { clientEmail, expireLogins, knownLoginCode, signInAsClient } from "./account";
import { removeClientRows } from "./fixtures";
import { LOCAL_URL, TARGET } from "./target";
import { submitsForms, test, expect } from "./test";

// Phase 2a Task 5: the client login page /konto/sisene (a code by e-mail), the header's "Minu konto" and the "signed in on
// another device" message (spec 2.1 rules 1, 3, 8). Every address is a sample one (`@example.test`, never mailed); each test
// starts by removing its own address's rows. A typo test that needs a real-looking domain answers the login request in the
// browser itself, so such an address never reaches the server.

const LOGIN = "/konto/sisene";
const PLACEHOLDER = "Õppija konto avaneb peagi"; // the signed-in /konto until the dashboard (Task 6)

const emailField = (page: Page) => page.getByLabel("E-post", { exact: true });
const codeField = (page: Page) => page.getByLabel("Kood", { exact: true });

/**
 * Opens the login page and waits until its form handles the submit itself (data-login-ready): the page-wide ready mark
 * (test.ts) can come first, and a tap before the form has hydrated posts the plain form (the page opens again, empty).
 */
async function openLogin(page: Page, path = LOGIN): Promise<void> {
  await page.goto(path);
  await expect(page.locator("[data-login-ready]")).toBeAttached();
}

/** The header's account button (and the phone menu's) says "Minu konto" → /konto, or "Logi sisse" → the login page. */
async function expectAccountButton(page: Page, isMobile: boolean, signedIn: boolean): Promise<void> {
  const links = page.locator("[data-account-link]");
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("data-account-link", signedIn ? "in" : "out");
    await expect(link).toHaveAttribute("href", signedIn ? "/konto" : "/konto/sisene");
  }
  const label = signedIn ? "Minu konto" : "Logi sisse";
  if (isMobile) {
    await page.locator("header").getByRole("button", { name: "Ava menüü" }).click();
    await expect(page.getByRole("dialog").getByRole("link", { name: label, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  } else {
    await expect(page.locator("header").getByRole("link", { name: label, exact: true })).toBeVisible();
  }
}

/** Fills in the e-mail and asks for the code; the code step is on screen afterwards, its field focused. */
async function askForCode(page: Page, email: string): Promise<void> {
  await emailField(page).fill(email);
  await page.getByRole("button", { name: "Saada kood" }).click();
  await expect(page.getByText(`Saatsime 6-kohalise koodi aadressile ${email}.`)).toBeVisible();
  await expect(codeField(page)).toBeFocused();
}

test("a code by e-mail signs in and opens Minu konto; the header follows, and Logi sisse is back after logging out", async ({ page, isMobile }, info) => {
  submitsForms();
  const email = clientEmail("code", info.project.name);
  await removeClientRows(email);
  await openLogin(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Logi sisse");
  await expectAccountButton(page, isMobile, false);

  await askForCode(page, email);
  const field = codeField(page);
  await expect(field).toHaveAttribute("inputmode", "numeric");
  await expect(field).toHaveAttribute("autocomplete", "one-time-code");
  await expect(field).toHaveAttribute("maxlength", "6");
  await expect(page.getByText("Ei leia kirja? Vaata ka rämpsposti kausta.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Saada uuesti/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Muuda e-posti" })).toBeVisible();
  // big, readable digits in the site's number font (Jost)
  const digits = await field.evaluate((e) => ({ size: parseFloat(getComputedStyle(e).fontSize), font: getComputedStyle(e).fontFamily }));
  expect(digits.size).toBeGreaterThanOrEqual(32);
  expect(digits.font).toMatch(/Jost/i);

  // the sixth digit signs in: no button to press
  await field.pressSequentially(await knownLoginCode(email));
  await expect(page).toHaveURL(/\/konto$/);
  await expect(page.getByRole("heading", { name: PLACEHOLDER })).toBeVisible();
  await expectAccountButton(page, isMobile, true);

  await page.evaluate(() => fetch("/api/konto/logout", { method: "POST" }));
  await page.reload();
  // signed out, /konto sends the visitor to the login page, the e-mail already filled in
  await expect(page).toHaveURL(/\/konto\/sisene$/);
  await expect(emailField(page)).toHaveValue(email);
  await expectAccountButton(page, isMobile, false);
});

test("a wrong code says so, empties the field and keeps the focus there; the right code still signs in", async ({ page }, info) => {
  submitsForms();
  const email = clientEmail("wrong", info.project.name);
  await removeClientRows(email);
  await openLogin(page);
  await askForCode(page, email);
  const code = await knownLoginCode(email);
  const field = codeField(page);
  await field.pressSequentially(code === "000000" ? "111111" : "000000");
  await expect(page.getByText("Kood ei sobi. Proovi uuesti.")).toBeVisible();
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAccessibleDescription(new RegExp(`Kood ei sobi\\. Proovi uuesti\\.`));
  await field.pressSequentially(code);
  await expect(page).toHaveURL(/\/konto$/);
});

test("an expired code asks for a new one, with Saada uuesti ready and focused; a pasted code with a space signs in", async ({ page }, info) => {
  submitsForms();
  const email = clientEmail("expired", info.project.name);
  await removeClientRows(email);
  await openLogin(page);
  await askForCode(page, email);
  await expireLogins(email);
  await codeField(page).pressSequentially("123456");
  await expect(page.getByText("Kood on aegunud. Saada uus kood.")).toBeVisible();
  const resend = page.getByRole("button", { name: "Saada uuesti", exact: true });
  await expect(resend).toBeEnabled();
  await expect(resend).toBeFocused();
  await resend.click();
  await expect(page.getByText("Saatsime uue koodi.")).toBeVisible();
  await expect(codeField(page)).toBeFocused();
  await expect(page.getByRole("button", { name: /^Saada uuesti \(\d+ s\)$/ })).toBeDisabled();

  // "123 456" pasted from the e-mail
  const code = await knownLoginCode(email);
  await codeField(page).evaluate((input, text) => {
    const data = new DataTransfer();
    data.setData("text", text);
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, `${code.slice(0, 3)} ${code.slice(3)}`);
  await expect(page).toHaveURL(/\/konto$/);
});

test("Saada uuesti waits 60 seconds, then sends a new code", async ({ page }, info) => {
  submitsForms();
  const email = clientEmail("resend", info.project.name);
  await removeClientRows(email);
  await page.clock.install();
  await openLogin(page);
  await askForCode(page, email);
  const resend = page.getByRole("button", { name: /^Saada uuesti/ });
  await expect(resend).toHaveText("Saada uuesti (60 s)");
  await expect(resend).toBeDisabled();
  await page.clock.fastForward("00:30");
  await expect(resend).toHaveText(/^Saada uuesti \(3\d s\)$/);
  await expect(resend).toBeDisabled();
  await page.clock.fastForward("00:31");
  await expect(resend).toHaveText("Saada uuesti");
  await expect(resend).toBeEnabled();
  await resend.click();
  await expect(page.getByText("Saatsime uue koodi.")).toBeVisible();
  await expect(resend).toBeDisabled();
});

test("a typo in a common domain asks Kas mõtlesid …? first: Jah, paranda corrects and sends, Ei, saada nii sends as typed", async ({ page }) => {
  const typed = ["kati", "gmial.com"].join("@");
  const fixed = ["kati", "gmail.com"].join("@");
  const sent: string[] = [];
  // answered here: the address never reaches the server (the domain is a real one)
  await page.route("**/api/konto/login", async (route) => {
    sent.push((route.request().postDataJSON() as { email: string }).email);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await openLogin(page);
  const field = emailField(page);
  await field.fill(`  ${typed.toUpperCase()} `); // trimmed and lower-cased as well
  await page.getByRole("button", { name: "Saada kood" }).click();
  await expect(page.getByText(`Kas mõtlesid ${fixed}?`)).toBeVisible();
  await expect(field).toHaveValue(typed);
  await expect(page.getByRole("button", { name: "Saada kood" })).toHaveCount(0); // the two answers take its place
  const yes = page.getByRole("button", { name: "Jah, paranda" });
  await expect(yes).toBeFocused();
  expect(sent, "nothing is sent before the answer").toEqual([]);
  await yes.click();
  await expect(page.getByText(`Saatsime 6-kohalise koodi aadressile ${fixed}.`)).toBeVisible();
  expect(sent).toEqual([fixed]);
  await page.getByRole("button", { name: "Muuda e-posti" }).click();
  await expect(field).toHaveValue(fixed); // the field is corrected
  await expect(field).toBeFocused();

  await field.fill(typed);
  await page.getByRole("button", { name: "Saada kood" }).click();
  await page.getByRole("button", { name: "Ei, saada nii" }).click();
  await expect(page.getByText(`Saatsime 6-kohalise koodi aadressile ${typed}.`)).toBeVisible();
  expect(sent).toEqual([fixed, typed]);
});

test("errors say what to do: a malformed address, too many tries, a server or network failure", async ({ page }) => {
  let answer: "rate" | "server" | "email" | "network" = "rate";
  let requests = 0;
  await page.route("**/api/konto/login", async (route) => {
    requests++;
    if (answer === "network") return route.abort("connectionfailed");
    const [status, body] = answer === "rate" ? [429, { ok: false, error: "rate" }] : answer === "email" ? [400, { ok: false, error: "email" }] : [500, { ok: false, error: "server" }];
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await openLogin(page);
  const field = emailField(page);
  const send = page.getByRole("button", { name: "Saada kood" });

  await field.fill("kati");
  await send.click();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAccessibleDescription("Sisesta korrektne e-posti aadress.");
  await expect(field).toBeFocused();
  expect(requests, "a malformed address is not sent").toBe(0);

  const address = "e2e-client-errors@example.test";
  for (const [kind, text] of [
    ["rate", "Liiga palju katseid. Proovi mõne minuti pärast uuesti."],
    ["server", "Midagi läks valesti. Proovi uuesti."],
    ["network", "Midagi läks valesti. Proovi uuesti."],
    ["email", "Sisesta korrektne e-posti aadress."],
  ] as const) {
    answer = kind;
    await field.fill(address);
    await send.click();
    await expect(field, kind).toHaveAccessibleDescription(text);
    await expect(page.locator("[data-login-step='email']"), kind).toBeVisible(); // still the e-mail step, the address kept
    await expect(field).toHaveValue(address);
  }
});

test("the e-mail is remembered; a used or old link and a server failure show a notice above the filled-in form", async ({ page }, info) => {
  submitsForms();
  const email = clientEmail("again", info.project.name);
  await removeClientRows(email);
  // "Saada uus kood" without a remembered e-mail: just the empty form
  await openLogin(page, `${LOGIN}?korda=1`);
  await expect(page).toHaveURL(/\/konto\/sisene$/);
  await expect(page.locator("[data-login-step='email']")).toBeVisible();
  await expect(emailField(page)).toHaveValue("");

  await askForCode(page, email);
  await openLogin(page);
  await expect(emailField(page)).toHaveValue(email);

  // the e-mail's button, used already or too old: the API sends the visitor here with ?viga=link
  await page.goto(`/api/konto/verify?t=${"e2e".repeat(15)}`);
  await expect(page).toHaveURL(/\/konto\/sisene$/); // the parameter is read and removed: a reload does not repeat it
  await expect(page.locator("[data-login-banner='link']")).toHaveText("Link on aegunud või juba kasutatud. Saada uus kood.");
  await expect(emailField(page)).toHaveValue(email);

  await page.goto(`${LOGIN}?viga=server`);
  await expect(page.locator("[data-login-banner='server']")).toHaveText("Midagi läks valesti. Proovi uuesti.");
  await expect(emailField(page)).toHaveValue(email);
  await page.reload();
  await expect(page.locator("[data-login-banner]")).toHaveCount(0);
});

test("signed in on another device: one message and one button, which sends a new code and opens the code field", async ({ page, browser, isMobile }, info) => {
  submitsForms();
  const email = clientEmail("replaced", info.project.name);
  await removeClientRows(email);
  await signInAsClient(page, email);
  await expect(page.getByRole("heading", { name: PLACEHOLDER })).toBeVisible();

  // the same student signs in on another device (another browser)
  const other = await browser.newContext({ baseURL: TARGET || LOCAL_URL });
  try {
    await signInAsClient(await other.newPage(), email);
  } finally {
    await other.close();
  }

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sinu konto avati teises seadmes");
  const again = page.getByRole("link", { name: "Saada uus kood" });
  await expect(again).toBeVisible();
  await expect(page.locator("main").getByRole("link")).toHaveCount(1); // one button, nothing else to choose
  await expectAccountButton(page, isMobile, false); // the answer cleared the hint cookie

  await again.click();
  await expect(page).toHaveURL(/\/konto\/sisene$/);
  await expect(page.getByText(`Saatsime 6-kohalise koodi aadressile ${email}.`)).toBeVisible();
  await expect(codeField(page)).toBeFocused();
  await codeField(page).pressSequentially(await knownLoginCode(email));
  await expect(page).toHaveURL(/\/konto$/);
  await expect(page.getByRole("heading", { name: PLACEHOLDER })).toBeVisible();
});

test("an account page that cannot load says so, and Proovi uuesti asks again (here: not signed in, so the login page opens)", async ({ page }) => {
  let failing = true;
  await page.route("**/api/konto/me", (route) =>
    failing ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "server" }) }) : route.fallback(),
  );
  await page.goto("/konto");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Midagi läks valesti.");
  await expect(page).toHaveURL(/\/konto$/); // no redirect: the visitor may well be signed in
  failing = false;
  await page.getByRole("button", { name: "Proovi uuesti" }).click();
  await expect(page).toHaveURL(/\/konto\/sisene$/);
});

test("in Russian: the page speaks Russian and the code opens /ru/konto", async ({ page }, info) => {
  submitsForms();
  const email = clientEmail("ru", info.project.name);
  await removeClientRows(email);
  await openLogin(page, "/ru/konto/sisene");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Войти");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Отправить код" }).click();
  await expect(page.getByText(`Мы отправили 6-значный код на адрес ${email}.`)).toBeVisible();
  await expect(page.getByText("Не видите письма? Загляните в папку «Спам».")).toBeVisible();
  await page.getByLabel("Код", { exact: true }).pressSequentially(await knownLoginCode(email));
  await expect(page).toHaveURL(/\/ru\/konto$/);
  await expect(page.getByRole("heading", { name: "Личный кабинет ученика скоро откроется" })).toBeVisible();
});

test("no horizontal overflow on the login steps and the message, at phone and desktop widths", async ({ page }) => {
  await page.route("**/api/konto/login", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  for (const path of [LOGIN, "/ru/konto/sisene"]) {
    await openLogin(page, path);
    const width = await page.evaluate(() => window.innerWidth);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(width);
    await page.locator("[data-login-email] input").fill("e2e-client-a-very-long-address-for-the-layout-check@example.test");
    await page.locator("[data-login-email] button[type='submit']").click();
    await expect(page.locator("[data-login-step='code']")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} code step`).toBeLessThanOrEqual(width);
  }
});
