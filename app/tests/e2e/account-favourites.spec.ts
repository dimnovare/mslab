import type { Page } from "@playwright/test";
import { addFavourites, clientEmail, endClientSessions, insertClient, SEED_FAVOURITES, signInAsClient, storedFavourites } from "./account";
import { removeClientRows } from "./fixtures";
import { submitsForms, test, expect } from "./test";

// Phase 2a Task 8: favourites in the account. A visitor's ♡ is kept in the browser (localStorage "mslab-fav"); after signing in it
// is merged into the account once (whichever account page loads first) and the browser's list is cleared; "Lemmikud" shows the
// account's favourites as the catalogue's cards, ♡ takes one off in place; the course page's ♡ then reads and writes the account,
// without asking the server anything when the page loads; a session that has ended sends the press to the browser's list, quietly.
// Every client is a sample address (`e2e-client-fav-…@example.test`, never mailed), written straight to the local database and
// removed after each test. The hearts are on published seed courses: a heart changes no public page.

const LAMI = SEED_FAVOURITES.lami;
const BOTOX = SEED_FAVOURITES.botox;

/** The addresses this worker's tests made rows for: removed after each test. */
const made = new Set<string>();
test.afterEach(async () => {
  for (const email of made) await removeClientRows(email);
  made.clear();
});

async function newClient(label: string, project: string): Promise<{ email: string; clientId: number }> {
  const email = clientEmail(`fav-${label}`, project);
  made.add(email);
  await removeClientRows(email);
  return { email, clientId: await insertClient(email) };
}

/** This browser's own list (null when there is none), and its copy of the account's (localStorage too). */
const browserList = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("mslab-fav") ?? "null") as string[] | null);
const accountCopy = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("mslab-account-fav") ?? "null") as string[] | null);

/** Counts this page's requests to the account API, as "METHOD /path". */
function accountRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith("/api/konto")) seen.push(`${r.method()} ${path}`);
  });
  return seen;
}

const tab = (page: Page, name: string) => page.locator("nav[data-account-tabs]").getByRole("link", { name }).filter({ visible: true });
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("a favourite kept in this browser before signing in moves into the account once: it is in Lemmikud and gone from this browser", async ({ page }, info) => {
  submitsForms();
  const { email, clientId } = await newClient("merge", info.project.name);

  // a visitor hearts a course: kept in this browser
  await page.goto(`/koolitused/${LAMI.slug}`);
  const fav = page.locator("[data-favourite]");
  await fav.click();
  await expect(fav).toHaveAttribute("aria-pressed", "true");
  expect(await browserList(page)).toEqual([LAMI.slug]);

  // signing in opens Minu koolitused; its load sends the browser's list to the account, once
  const seen = accountRequests(page);
  await signInAsClient(page, email);
  await expect.poll(() => storedFavourites(clientId)).toEqual([LAMI.slug]);
  await expect.poll(() => browserList(page)).toBeNull();
  await expect.poll(() => accountCopy(page)).toEqual([LAMI.slug]);
  expect(seen.filter((r) => r === "POST /api/konto/lemmikud/merge")).toHaveLength(1);

  // Lemmikud shows it, as the catalogue's card; nothing is merged again
  await tab(page, "Lemmikud").click();
  await expect(page).toHaveURL(/\/konto\/lemmikud$/);
  const card = page.locator(`[data-favourite-card="${LAMI.slug}"]`);
  await expect(card.locator("[data-course-card]")).toHaveAttribute("href", `/koolitused/${LAMI.slug}`);
  await expect(card.getByRole("heading", { level: 3 })).toHaveText(LAMI.title);
  await page.reload();
  await expect(card).toBeVisible();
  expect(seen.filter((r) => r === "POST /api/konto/lemmikud/merge")).toHaveLength(1);

  // whichever account page loads first does it: a list in this browser (kept while signed out), then Lemmikud opened directly —
  // the page loads, the merge follows, and the list shows the new card without a reload of the page
  await page.evaluate((slug) => localStorage.setItem("mslab-fav", JSON.stringify([slug])), BOTOX.slug);
  await page.goto("/konto/lemmikud");
  await expect(page.locator("[data-favourite-card]")).toHaveCount(2);
  await expect(page.locator(`[data-favourite-card="${BOTOX.slug}"]`)).toBeVisible();
  await expect.poll(() => browserList(page)).toBeNull();
  await expect.poll(() => storedFavourites(clientId)).toEqual([BOTOX.slug, LAMI.slug]);
  expect(seen.filter((r) => r === "POST /api/konto/lemmikud/merge")).toHaveLength(2);
});

test("Lemmikud: the catalogue's cards, newest first; ♡ takes one off in place and the focus moves on; the last one leaves the one sentence and Vaata koolitusi", async ({ page }, info) => {
  submitsForms();
  const { email, clientId } = await newClient("list", info.project.name);
  await addFavourites(clientId, [BOTOX.slug, LAMI.slug]); // LAMI is the newest
  await signInAsClient(page, email);
  await page.goto("/konto/lemmikud");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sinu lemmikud");
  const cards = page.locator("[data-favourite-card]");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute("data-favourite-card", LAMI.slug);
  await expect(cards.nth(1)).toHaveAttribute("data-favourite-card", BOTOX.slug);
  // the public card: photo, title, the next date and city, the price, a link to the course page
  const first = cards.nth(0).locator("[data-course-card]");
  await expect(first).toHaveAttribute("href", `/koolitused/${LAMI.slug}`);
  await expect(first.locator("[data-card-photo] img")).toBeVisible();
  await expect(first).toContainText("€");
  // one ♡ under each card, named for its course, at least 44 px tall
  const removeLami = page.getByRole("button", { name: `Eemalda lemmikutest: ${LAMI.title}` });
  const removeBotox = page.getByRole("button", { name: `Eemalda lemmikutest: ${BOTOX.title}` });
  await expect(removeLami).toHaveText("Eemalda lemmikutest");
  expect((await removeLami.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await cards.nth(0).locator("[data-course-card]").boundingBox())!.y).toBeLessThan((await removeLami.boundingBox())!.y);
  for (const width of [390, 834, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noOverflow(page), `no horizontal overflow at ${width}`).toBe(true);
  }
  await page.setViewportSize(info.project.use.viewport!);

  // a failure keeps the card and says so under it
  await page.route("**/api/konto/lemmikud", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"ok":false,"error":"server"}' }), { times: 1 });
  await removeLami.click();
  await expect(cards.nth(0).getByText("Ei õnnestunud eemaldada. Proovi uuesti.")).toBeVisible();
  await expect(cards).toHaveCount(2);
  expect(await storedFavourites(clientId)).toEqual([LAMI.slug, BOTOX.slug]);

  // ♡ takes it off in place: the same page, the next card's ♡ has the focus, a screen reader hears what went
  await page.locator("[data-account-favourites]").evaluate((el) => el.setAttribute("data-e2e-same", ""));
  await removeLami.click();
  await expect(cards).toHaveCount(1);
  await expect(page.locator("[data-account-favourites][data-e2e-same]")).toHaveCount(1);
  await expect(removeBotox).toBeFocused();
  await expect(page.locator("[data-favourites-status]")).toHaveText(`Eemaldatud lemmikutest: ${LAMI.title}`);
  await expect(page.getByText("Ei õnnestunud eemaldada. Proovi uuesti.")).toHaveCount(0);
  expect(await storedFavourites(clientId)).toEqual([BOTOX.slug]);
  expect(await accountCopy(page)).toEqual([BOTOX.slug]);

  // the last one: the one sentence and one button, the focus on the heading
  await removeBotox.click();
  const empty = page.locator("[data-favourites-empty]");
  await expect(empty).toContainText("Lisa koolitus lemmikuks ♡ koolituse lehel.");
  await expect(empty.getByRole("link")).toHaveText(["Vaata koolitusi"]);
  await expect(empty.getByRole("link")).toHaveAttribute("href", "/koolitused");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  expect(await storedFavourites(clientId)).toEqual([]);
  await page.reload();
  await expect(empty).toBeVisible();
  await expect(cards).toHaveCount(0);
});

test("Lemmikud in Russian: the Russian cards, links and words", async ({ page }, info) => {
  submitsForms();
  const { email, clientId } = await newClient("ru", info.project.name);
  await addFavourites(clientId, [LAMI.slug]);
  await signInAsClient(page, email);
  await page.goto("/ru/konto/lemmikud");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ваше избранное");
  const card = page.locator(`[data-favourite-card="${LAMI.slug}"]`);
  await expect(card.locator("[data-course-card]")).toHaveAttribute("href", `/ru/koolitused/${LAMI.slug}`);
  await expect(card.getByRole("heading", { level: 3 })).toHaveText("Ламинирование бровей");
  await card.getByRole("button", { name: "Убрать из избранного: Ламинирование бровей" }).click();
  const empty = page.locator("[data-favourites-empty]");
  await expect(empty).toContainText("Добавляйте курсы в избранное ♡ на странице курса.");
  await expect(empty.getByRole("link", { name: "Посмотреть курсы" })).toHaveAttribute("href", "/ru/koolitused");
});

test("signed in, the course page's ♡ is the account's: nothing is asked when the page loads, one POST per press, a failure is put back, and Lemmikud follows", async ({ page }, info) => {
  submitsForms();
  const { email, clientId } = await newClient("heart", info.project.name);
  await signInAsClient(page, email); // the dashboard's load keeps this browser's copy of the account's favourites: none
  await expect.poll(() => accountCopy(page)).toEqual([]);

  const seen = accountRequests(page);
  await page.goto(`/koolitused/${LAMI.slug}`);
  const fav = page.locator("[data-favourite]");
  await expect(fav).toHaveAttribute("aria-pressed", "false");
  await page.waitForLoadState("networkidle");
  expect(seen, "no account request when the page loads").toEqual([]);

  await fav.click();
  await expect(fav).toHaveAttribute("aria-pressed", "true");
  await expect(fav).toHaveText("Lemmikutes");
  await expect(fav).toHaveAttribute("title", "Eemalda lemmikutest");
  await expect.poll(() => storedFavourites(clientId)).toEqual([LAMI.slug]);
  expect(seen).toEqual(["POST /api/konto/lemmikud"]);
  expect(await browserList(page), "the browser's own list is not used").toBeNull();

  // Lemmikud lists it; back on the course page it is pressed from the copy, again with no request
  await page.goto("/konto/lemmikud");
  await expect(page.locator(`[data-favourite-card="${LAMI.slug}"]`)).toBeVisible();
  seen.length = 0;
  await page.goto(`/koolitused/${LAMI.slug}`);
  await expect(fav).toHaveAttribute("aria-pressed", "true");
  await page.waitForLoadState("networkidle");
  expect(seen).toEqual([]);

  // a press shows at once (the answer is held back here); a failure puts it back and says so next to the button
  const failed = page.locator("[data-favourite-failed]");
  await expect(failed).toHaveText("");
  await expect(failed).toHaveAttribute("role", "status");
  const held: { answer?: () => Promise<void> } = {};
  await page.route(
    "**/api/konto/lemmikud",
    (route) => {
      held.answer = () => route.fulfill({ status: 500, contentType: "application/json", body: '{"ok":false,"error":"server"}' });
    },
    { times: 1 },
  );
  await fav.click();
  await expect.poll(() => held.answer !== undefined).toBe(true);
  await expect(fav).toHaveAttribute("aria-pressed", "false");
  await held.answer!();
  await expect(fav).toHaveAttribute("aria-pressed", "true");
  await expect(failed).toHaveText("Ei õnnestunud. Proovi uuesti.");
  const [line, button] = [(await failed.boundingBox())!, (await fav.boundingBox())!];
  expect(line.y, "the line is under the actions").toBeGreaterThanOrEqual(button.y + button.height - 1);
  expect(await storedFavourites(clientId)).toEqual([LAMI.slug]);

  // and off again: the next press takes the line away
  await fav.click();
  await expect(failed).toHaveText("");
  await expect(fav).toHaveAttribute("aria-pressed", "false");
  await expect(fav).toHaveText("Lisa lemmikutesse");
  await expect.poll(() => storedFavourites(clientId)).toEqual([]);
  await page.goto("/konto/lemmikud");
  await expect(page.locator("[data-favourites-empty]")).toBeVisible();
});

test("signed out elsewhere meanwhile (401): the press goes to this browser's own list, quietly, and the header says Logi sisse", async ({ page, isMobile }, info) => {
  submitsForms();
  const { email, clientId } = await newClient("401", info.project.name);
  await signInAsClient(page, email);
  await page.goto(`/koolitused/${LAMI.slug}`);
  const fav = page.locator("[data-favourite]");
  await expect(page.locator("[data-account-link]").first()).toHaveAttribute("data-account-link", "in");

  await endClientSessions(clientId); // another device signed in
  await fav.click();
  await expect(fav).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => browserList(page)).toEqual([LAMI.slug]);
  expect(await storedFavourites(clientId)).toEqual([]);
  expect(await accountCopy(page)).toBeNull();
  for (const link of await page.locator("[data-account-link]").all()) await expect(link).toHaveAttribute("data-account-link", "out");
  if (!isMobile) await expect(page.locator("header").getByRole("link", { name: "Logi sisse", exact: true })).toBeVisible();
  // quiet: no message anywhere
  await expect(page.getByText(/Proovi uuesti|Ei õnnestunud/)).toHaveCount(0);

  // the browser's list works as before: off again, and it stays after a reload
  await fav.click();
  await expect(fav).toHaveAttribute("aria-pressed", "false");
  expect(await browserList(page)).toEqual([]);
  await page.reload();
  await expect(fav).toHaveAttribute("aria-pressed", "false");
});

test("the copy is this browser's: a new tab (or a visit days later) shows the account's hearts with no request, and Logi välja forgets it", async ({ page, context }, info) => {
  submitsForms();
  const { email, clientId } = await newClient("newtab", info.project.name);
  await signInAsClient(page, email);
  await page.goto(`/koolitused/${LAMI.slug}`);
  await page.locator("[data-favourite]").click();
  await expect.poll(() => storedFavourites(clientId)).toEqual([LAMI.slug]);

  // a new tab of the same browser: pressed from the copy, nothing asked
  const other = await context.newPage();
  const seen = accountRequests(other);
  await other.goto(`/koolitused/${LAMI.slug}`);
  await other.locator("html[data-site-ready]").waitFor({ state: "attached" });
  await expect(other.locator("[data-favourite]")).toHaveAttribute("aria-pressed", "true");
  await other.waitForLoadState("networkidle");
  expect(seen, "no account request when the page loads").toEqual([]);
  // a change in one tab shows in the other (the storage event), still with no request there
  await page.locator("[data-favourite]").click();
  await expect.poll(() => storedFavourites(clientId)).toEqual([]);
  await expect(other.locator("[data-favourite]")).toHaveAttribute("aria-pressed", "false");
  expect(seen).toEqual([]);
  await other.close();

  // Logi välja: the copy is gone, so the course page shows this browser's own list (empty) again
  await page.locator("[data-favourite]").click();
  await expect.poll(() => accountCopy(page)).toEqual([LAMI.slug]);
  await page.goto("/konto");
  await page.locator("[data-account-menu]").filter({ visible: true }).click();
  await page.locator("[data-account-logout]").filter({ visible: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  expect(await accountCopy(page)).toBeNull();
  await page.goto(`/koolitused/${LAMI.slug}`);
  await expect(page.locator("[data-favourite]")).toHaveAttribute("aria-pressed", "false");
});

test("signing in forgets the copy a previous session left on this device, also when the first account load fails", async ({ page }, info) => {
  submitsForms();
  const { email } = await newClient("login", info.project.name);
  // the previous person's hearts, left here (as if they had never logged out)
  await page.goto("/");
  await page.evaluate((slug) => localStorage.setItem("mslab-account-fav", JSON.stringify([slug])), LAMI.slug);
  // the login link opens Minu koolitused, whose load fails this time
  // (every load until it says so: the dev server's strict mode asks twice)
  await page.route("**/api/konto", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"ok":false,"error":"server"}' }));
  await signInAsClient(page, email);
  await expect(page.locator("[data-account-state='error']")).toBeVisible();
  await page.unroute("**/api/konto");
  expect(await accountCopy(page)).toBeNull();
  expect(new URL(page.url()).hash, "the login mark leaves the address").toBe("");
  await page.goto(`/koolitused/${LAMI.slug}`);
  await expect(page.locator("[data-favourite]")).toHaveAttribute("aria-pressed", "false");
});
