import type { Page } from "@playwright/test";
import { clientEmail, expireLogins, knownLoginCode, signInAsClient } from "./account";
import { onLocalDb, removeClientRows } from "./fixtures";
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

const WAIT = /^Uue koodi saad saata (\d+) s pärast\.$/;

/** Counts this page's POSTs to /api/konto/login and /api/konto/code. */
function countPosts(page: Page): { login: number; code: number } {
  const posts = { login: 0, code: 0 };
  page.on("request", (r) => {
    if (r.method() !== "POST") return;
    const path = new URL(r.url()).pathname;
    if (path === "/api/konto/login") posts.login++;
    if (path === "/api/konto/code") posts.code++;
  });
  return posts;
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
  // one primary button, usable at six digits; "Saada uus kood" waits its 60 s as quiet text; "Muuda e-posti"
  await expect(page.getByRole("button", { name: "Logi sisse", exact: true })).toBeDisabled();
  await expect(page.locator("[data-login-wait]")).toHaveText(WAIT);
  await expect(page.getByRole("button", { name: "Saada uus kood" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Muuda e-posti" })).toBeVisible();
  // big, readable digits in the site's number font (Jost)
  const digits = await field.evaluate((e) => ({ size: parseFloat(getComputedStyle(e).fontSize), font: getComputedStyle(e).fontFamily }));
  expect(digits.size).toBeGreaterThanOrEqual(32);
  expect(digits.font).toMatch(/Jost/i);

  // the sixth digit signs in by itself
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

test("an expired code asks for a new one, with Saada uus kood ready and focused; a pasted code with a space signs in", async ({ page }, info) => {
  submitsForms();
  const email = clientEmail("expired", info.project.name);
  await removeClientRows(email);
  await openLogin(page);
  await askForCode(page, email);
  await expireLogins(email);
  await codeField(page).pressSequentially("123456");
  await expect(page.getByText("Kood on aegunud. Saada uus kood.")).toBeVisible();
  const resend = page.getByRole("button", { name: "Saada uus kood", exact: true });
  await expect(resend).toBeEnabled();
  await expect(resend).toBeFocused();
  await resend.click();
  await expect(page.getByText("Saatsime uue koodi.")).toBeVisible();
  await expect(codeField(page)).toBeFocused();
  await expect(page.locator("[data-login-wait]")).toHaveText(WAIT); // the next one in 60 s
  await expect(resend).toHaveCount(0);

  // "123 456" pasted from the e-mail
  const code = await knownLoginCode(email);
  await codeField(page).evaluate((input, text) => {
    const data = new DataTransfer();
    data.setData("text", text);
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, `${code.slice(0, 3)} ${code.slice(3)}`);
  await expect(page).toHaveURL(/\/konto$/);
});

test("Saada uus kood waits 60 seconds, counted down as quiet text, then sends a new code", async ({ page }, info) => {
  submitsForms();
  const email = clientEmail("resend", info.project.name);
  await removeClientRows(email);
  await page.clock.install();
  await openLogin(page);
  await askForCode(page, email);
  const wait = page.locator("[data-login-wait]");
  const resend = page.getByRole("button", { name: "Saada uus kood", exact: true });
  await expect(wait).toHaveText("Uue koodi saad saata 60 s pärast.");
  await expect(resend).toHaveCount(0);
  await page.clock.fastForward("00:30");
  await expect(wait).toHaveText(/^Uue koodi saad saata 3\d s pärast\.$/);
  await page.clock.fastForward("00:31");
  await expect(wait).toHaveCount(0);
  await expect(resend).toBeEnabled();
  await resend.click();
  await expect(page.getByText("Saatsime uue koodi.")).toBeVisible();
  await expect(wait).toHaveText("Uue koodi saad saata 60 s pärast.");
  await expect(resend).toHaveCount(0);
});

test("the code step's one button: Logi sisse works at six digits; Enter before that asks for all six; the sixth digit and Enter sign in once", async ({ page }, info) => {
  submitsForms();
  const email = clientEmail("button", info.project.name);
  await removeClientRows(email);
  const posts = countPosts(page);
  await openLogin(page);
  await askForCode(page, email);
  const button = page.getByRole("button", { name: "Logi sisse", exact: true });
  const field = codeField(page);
  await field.pressSequentially("12");
  await expect(button).toBeDisabled();
  await page.keyboard.press("Enter"); // a phone's "Go" is Enter too
  await expect(page.getByText("Sisesta kõik 6 numbrit.")).toBeVisible();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("12");
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  expect(posts.code, "nothing is checked before six digits").toBe(0);

  await field.fill("");
  await expect(page.getByText("Sisesta kõik 6 numbrit.")).toHaveCount(0); // typing again takes the hint away
  await field.pressSequentially(await knownLoginCode(email));
  await page.keyboard.press("Enter"); // right after the sixth digit, which has already sent the code
  await expect(page).toHaveURL(/\/konto$/);
  expect(posts).toEqual({ login: 1, code: 1 });
});

test("after a failure of ours the code stays in the field, and Logi sisse tries it again", async ({ page }, info) => {
  submitsForms();
  const email = clientEmail("retry", info.project.name);
  await removeClientRows(email);
  await openLogin(page);
  await askForCode(page, email);
  const code = await knownLoginCode(email);
  let failing = true;
  await page.route("**/api/konto/code", (route) =>
    failing ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "server" }) }) : route.fallback(),
  );
  await codeField(page).pressSequentially(code);
  await expect(page.getByText("Midagi läks valesti. Proovi uuesti.")).toBeVisible();
  await expect(codeField(page)).toHaveValue(code);
  failing = false;
  await page.getByRole("button", { name: "Logi sisse", exact: true }).click();
  await expect(page).toHaveURL(/\/konto$/);
});

test("the code step survives a reload (a phone that dropped the tab) with the rest of its 60 s, without a new code; Muuda e-posti forgets it", async ({ page }, info) => {
  submitsForms();
  const email = clientEmail("reload", info.project.name);
  await removeClientRows(email);
  const posts = countPosts(page);
  await openLogin(page);
  await askForCode(page, email);
  await page.reload();
  await expect(page.locator("[data-login-step='code']")).toBeVisible();
  await expect(page.getByText(`Saatsime 6-kohalise koodi aadressile ${email}.`)).toBeVisible();
  await expect(codeField(page)).toBeFocused();
  const seconds = Number(WAIT.exec((await page.locator("[data-login-wait]").textContent()) ?? "")?.[1]);
  expect(seconds).toBeGreaterThan(0);
  expect(seconds).toBeLessThanOrEqual(60);
  expect(posts.login, "the reload sends nothing").toBe(1);

  await page.getByRole("button", { name: "Muuda e-posti" }).click();
  await page.reload();
  await expect(page.locator("[data-login-step='email']")).toBeVisible();
  await expect(emailField(page)).toHaveValue(email);

  // signed in from a kept code step, the step is forgotten
  await askForCode(page, email);
  await page.reload();
  await codeField(page).pressSequentially(await knownLoginCode(email));
  await expect(page).toHaveURL(/\/konto$/);
  expect(await page.evaluate(() => sessionStorage.getItem("mslab-login-code"))).toBeNull();
  await openLogin(page);
  await expect(page.locator("[data-login-step='email']")).toBeVisible();
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
  // the next visit (a new tab: the code step is kept per tab) starts with the e-mail filled in
  const next = await page.context().newPage();
  await next.goto(LOGIN);
  await expect(next.locator("[data-login-ready]")).toBeAttached();
  await expect(next.locator("[data-login-step='email']")).toBeVisible();
  await expect(emailField(next)).toHaveValue(email);
  await next.close();

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

  const posts = countPosts(page);
  await again.click();
  await expect(page).toHaveURL(/\/konto\/sisene$/);
  await expect(page.getByText(`Saatsime 6-kohalise koodi aadressile ${email}.`)).toBeVisible();
  await expect(codeField(page)).toBeFocused();
  await codeField(page).pressSequentially(await knownLoginCode(email));
  await expect(page).toHaveURL(/\/konto$/);
  await expect(page.getByRole("heading", { name: PLACEHOLDER })).toBeVisible();
  expect(posts.login, "?korda=1 sends exactly one code").toBe(1);
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

test("in Russian: the page speaks Russian, the code opens /ru/konto and a first login makes a Russian account; a failed link opens the Russian page", async ({ page }, info) => {
  submitsForms();
  const email = clientEmail("ru", info.project.name);
  await removeClientRows(email);
  await openLogin(page, "/ru/konto/sisene");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Войти");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Отправить код" }).click();
  await expect(page.getByText(`Мы отправили 6-значный код на адрес ${email}.`)).toBeVisible();
  await expect(page.getByText("Не видите письма? Загляните в папку «Спам».")).toBeVisible();
  await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeDisabled();
  await expect(page.locator("[data-login-wait]")).toHaveText(/^Новый код можно отправить через \d+ с\.$/);
  await page.getByLabel("Код", { exact: true }).pressSequentially(await knownLoginCode(email));
  await expect(page).toHaveURL(/\/ru\/konto$/);
  await expect(page.getByRole("heading", { name: "Личный кабинет ученика скоро откроется" })).toBeVisible();
  const [client] = await onLocalDb((sql) => sql<{ locale: string }[]>`select locale from clients where email = ${email}`);
  expect(client.locale, "the account speaks the language of the page it was made on").toBe("ru");

  // the button of a Russian e-mail (l=ru), used already or too old: the Russian login page says so
  await page.goto(`/api/konto/verify?t=${"e2e".repeat(15)}&l=ru`);
  await expect(page).toHaveURL(/\/ru\/konto\/sisene$/);
  await expect(page.locator("[data-login-banner='link']")).toHaveText("Ссылка устарела или уже использована. Отправьте новый код.");
});

test("no horizontal overflow on both login steps: this project's width, then 834 and 2560", async ({ page }) => {
  await page.route("**/api/konto/login", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  const scrolls = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  for (const size of [null, { width: 834, height: 1112 }, { width: 2560, height: 1300 }]) {
    if (size) await page.setViewportSize(size);
    for (const path of [LOGIN, "/ru/konto/sisene"]) {
      const at = `${path} at ${size?.width ?? "the project's width"}`;
      await openLogin(page, path);
      await expect(page.locator("[data-login-step='email']")).toBeVisible();
      expect(await scrolls(), `${at}: e-mail step`).toBe(false);
      await page.locator("[data-login-email] input").fill("e2e-client-a-very-long-address-for-the-layout-check@example.test");
      await page.locator("[data-login-email] button[type='submit']").click();
      await expect(page.locator("[data-login-step='code']")).toBeVisible();
      expect(await scrolls(), `${at}: code step`).toBe(false);
      await page.evaluate(() => sessionStorage.clear()); // the next path starts at the e-mail step, not the kept code step
    }
  }
});
