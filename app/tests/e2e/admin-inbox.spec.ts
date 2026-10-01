import { readFileSync } from "node:fs";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { submitsForms, test, expect } from "./test";
import {
  deleteStoredRequest,
  insertAdminFixtures,
  removeAdminFixtures,
  removeAdminRows,
  requestHandled,
  setStoredStatus,
  storedAdminRegistration,
  type AdminFixtures,
} from "./fixtures";

// Task 12: the admin shell (prototype B sidebar), the overview and the inboxes (registrations, requests, newsletter).
// The signed-in tests run against the local dev server only: they sign in as Dim through the devLink (no e-mail: global
// setup refuses a dev environment with RESEND_API_KEY) and look at rows each test inserts for itself (tests/e2e/
// fixtures.ts, an unpublished fixture course with its own session) and deletes again. The guard tests are GET-only and
// also run against a deployment.

const ADMIN = "dim@example.test";
const MENU = ["Ülevaade", "Koolitused", "Kalender", "Registreerimised", "Päringud", "Praktika", "Avaleht", "Koolitaja", "Uudised", "Kampaania", "Uudiskiri", "Seaded"];

const created = { tokens: new Set<string>(), sessions: new Set<string>() };
let fx: AdminFixtures | null = null;

test.afterEach(async () => {
  await removeAdminRows({ tokens: created.tokens, sessions: created.sessions }).catch(() => {});
  created.tokens.clear();
  created.sessions.clear();
  if (fx) expect(await removeAdminFixtures(fx.tag)).toBe(0);
  fx = null;
});

/** Inserts this test's rows. */
async function fixtures(project: string, opts: { extraSubscribers?: number } = {}): Promise<AdminFixtures> {
  fx = await insertAdminFixtures(project, opts);
  return fx;
}

/** Signs in as Dim through the login API's devLink (local only); lands on /admin. */
async function signIn(page: Page, context: BrowserContext, ip: string): Promise<void> {
  const res = await page.request.post("/api/auth/request", { data: { email: ADMIN }, headers: { "x-forwarded-for": ip } });
  expect(res.status()).toBe(200);
  const { devLink } = (await res.json()) as { devLink?: string };
  expect(devLink, "devLink in the local answer").toBeTruthy();
  const link = new URL(devLink!);
  created.tokens.add(link.searchParams.get("t")!);
  await page.goto(link.pathname + link.search);
  await expect(page).toHaveURL(/\/admin$/);
  const cookie = (await context.cookies()).find((c) => c.name === "__Host-mslab_admin");
  expect(cookie, "session cookie").toBeTruthy();
  created.sessions.add(cookie!.value);
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** The admin menu: the sidebar on a wide screen, the drawer (opened here) on a phone. */
async function menu(page: Page, isMobile: boolean): Promise<Locator> {
  if (isMobile) {
    await page.getByRole("button", { name: "Ava menüü" }).click();
    const drawer = page.locator("[data-admin-drawer]");
    await expect(drawer).toBeVisible();
    return drawer.getByRole("navigation", { name: "Halduse menüü" });
  }
  return page.locator("aside").getByRole("navigation", { name: "Halduse menüü" });
}

test.describe("guard (GET only, also against a deployment)", () => {
  test("the inbox pages and the CSV export need a session", async ({ request }) => {
    for (const path of ["/admin/registreerimised", "/admin/paringud", "/admin/uudiskiri", "/admin/koolitused", "/admin/seaded"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([302, 303, 307], path).toContain(res.status());
      expect(new URL(res.headers()["location"], "http://x").pathname, path).toBe("/admin/login");
    }
    const csv = await request.get("/api/admin/subscribers.csv", { maxRedirects: 0 });
    expect(csv.status()).toBe(401);
    expect(csv.headers()["content-type"]).toContain("application/json");
    expect(csv.headers()["cache-control"]).toContain("no-store");
    expect(await csv.text()).not.toContain("@");
  });
});

test.describe("signed in", () => {
  test.beforeEach(() => submitsForms());

  test("overview: greeting, the numbers, the B menu with badges, quick links", async ({ page, context, visitorIp, isMobile }, info) => {
    await fixtures(info.project.name);
    await signIn(page, context, visitorIp);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tere, Dim.");
    await expect(page).toHaveTitle(/Ülevaade — Haldus/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    expect(Number(await page.locator('[data-stat="awaiting"] strong').textContent())).toBeGreaterThanOrEqual(1);
    expect(Number(await page.locator('[data-stat="requests"] strong').textContent())).toBeGreaterThanOrEqual(5);
    await expect(page.locator('[data-stat="sessions"]')).toContainText("Koolitused järgmise 30 päeva jooksul");
    await expect(page.locator('[data-stat="awaiting"]')).toHaveAttribute("href", "/admin/registreerimised?staatus=ootab");
    for (const key of ["contact", "interest", "individual", "practice", "waitlist"]) await expect(page.locator(`[data-inbox="${key}"]`)).toContainText("tegemata");
    await expect(page.getByRole("link", { name: "Lae alla kinnitatud tellijad (CSV)" })).toHaveAttribute("href", "/api/admin/subscribers.csv?kinnitatud=1");
    expect(await noOverflow(page)).toBe(true);

    const nav = await menu(page, isMobile);
    const links = nav.getByRole("list").first().getByRole("link");
    await expect(links).toHaveCount(MENU.length);
    for (const [i, label] of MENU.entries()) await expect(links.nth(i)).toContainText(label);
    await expect(nav.locator('[data-nav="overview"]')).toHaveAttribute("aria-current", "page");
    await expect(nav.locator('[data-badge="registrations"]')).toBeVisible();
    await expect(nav.locator('[data-badge="requests"]')).toBeVisible();
    const site = nav.getByRole("link", { name: /Vaata lehte/ });
    await expect(site).toHaveAttribute("href", "/");
    await expect(site).toHaveAttribute("target", "_blank");
    await expect(nav.getByRole("button", { name: "Logi välja" })).toBeVisible();
    for (const target of await nav.locator("a, button").all()) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test("a section that is not built yet opens its 'Tulekul' page from the menu", async ({ page, context, visitorIp, isMobile }) => {
    await signIn(page, context, visitorIp);
    const nav = await menu(page, isMobile);
    await nav.getByRole("link", { name: "Koolitused" }).click();
    await expect(page).toHaveURL(/\/admin\/koolitused$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Koolitused");
    await expect(page.locator("[data-coming-soon]")).toContainText("Tulekul");
    if (isMobile) await expect(page.locator("[data-admin-drawer]")).toBeHidden(); // the link closed the drawer
    const again = await menu(page, isMobile);
    await expect(again.locator('[data-nav="courses"]')).toHaveAttribute("aria-current", "page");
  });

  test("registrations: the fixture is under Kontaktõpe as 'Ootab ettemaksu'; 50% paid confirms it", async ({ page, context, visitorIp }, info) => {
    const f = await fixtures(info.project.name);
    await signIn(page, context, visitorIp);
    await page.goto("/admin/registreerimised");
    const typeFilter = page.locator("[data-type-filter]");
    await expect(typeFilter.getByRole("link")).toHaveText(["Kõik", "E-õpe", "Kontaktõpe"]);
    await expect(typeFilter.getByRole("link", { name: "Kõik" })).toHaveAttribute("aria-current", "true");

    await typeFilter.getByRole("link", { name: "Kontaktõpe" }).click();
    await expect(page).toHaveURL(/\?vorm=k$/);
    const row = page.locator(`[data-registration="${f.registration.id}"]`);
    await expect(row).toContainText(f.registration.name);
    await expect(row).toContainText(f.registration.email);
    await expect(row).toContainText(f.course.title);
    await expect(row).toContainText("Pärnu");
    await expect(row).toContainText("50% ettemaks");
    await expect(row.locator('[data-label="Liik"]')).toContainText("Kontaktõpe");
    await expect(row.locator('[data-label="Liik"]')).toContainText("Grupp");
    await expect(row.locator("[data-reg-status]")).toHaveText("Ootab ettemaksu");
    expect(await noOverflow(page)).toBe(true);

    // the drawer: details, price 350 €, half 175 €
    await row.getByRole("link", { name: `Ava ${f.registration.name}` }).click();
    await expect(page).toHaveURL(new RegExp(`vorm=k&id=${f.registration.id}$`));
    const drawer = page.getByRole("dialog", { name: `Registreerimine: ${f.registration.name}` });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("350 €");
    await expect(drawer).toContainText("175 €");
    await expect(drawer.locator("[data-reg-status]")).toHaveText("Ootab ettemaksu");

    const amount = drawer.getByLabel("Laekunud summa (€)");
    const save = drawer.getByRole("button", { name: "Salvesta summa" });
    await expect(amount).toHaveValue(""); // nothing paid yet: an empty field, not "0"
    // not an amount: an error on the field, nothing stored
    await amount.fill("palju");
    await save.click();
    await expect(drawer.getByText("Sisesta summa eurodes, näiteks 175 või 175,50.")).toBeVisible();
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(await storedAdminRegistration(f.registration.id)).toMatchObject({ paidCents: 0, status: "awaiting_prepayment" });
    // below 50%: stays awaiting
    await amount.fill("174,99");
    await save.click();
    await expect(drawer.getByText("Summa salvestatud.")).toBeVisible();
    await expect(drawer.locator("[data-paid]")).toHaveText("174,99 €");
    await expect(drawer.locator("[data-reg-status]")).toHaveText("Ootab ettemaksu");
    expect(await storedAdminRegistration(f.registration.id)).toMatchObject({ paidCents: 17499, status: "awaiting_prepayment" });
    // 50%: confirmed
    await amount.fill("175");
    await save.click();
    await expect(drawer.locator("[data-reg-status]")).toHaveText("Kinnitatud");
    await expect(drawer.locator("[data-paid]")).toHaveText("175 €");
    expect(await storedAdminRegistration(f.registration.id)).toMatchObject({ paidCents: 17500, status: "confirmed" });
    // the status choice follows the new status (a later note save must not undo the confirmation)
    await expect(drawer.getByRole("radio", { name: "Kinnitatud" })).toBeChecked();

    // Esc closes the drawer; the list shows the new status and the focus is back on the row's link
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\?vorm=k$/);
    await expect(row.locator("[data-reg-status]")).toHaveText("Kinnitatud");
    await expect(row.getByRole("link", { name: `Ava ${f.registration.name}` })).toBeFocused();

    // E-õpe: not listed there; the note about e-learning purchases
    await typeFilter.getByRole("link", { name: "E-õpe" }).click();
    await expect(page).toHaveURL(/\?vorm=e$/);
    await expect(page.locator("[data-e-note]")).toHaveText("E-õppe ostud lisanduvad koos maksetega.");
    await expect(page.locator(`[data-registration="${f.registration.id}"]`)).toHaveCount(0);

    // status filter
    await page.goto("/admin/registreerimised?vorm=k&staatus=kinnitatud");
    await expect(page.locator(`[data-registration="${f.registration.id}"]`)).toBeVisible();
    await page.goto("/admin/registreerimised?vorm=k&staatus=ootab");
    await expect(page.locator(`[data-registration="${f.registration.id}"]`)).toHaveCount(0);
  });

  test("registrations: status and note by hand, then 'Tühista'", async ({ page, context, visitorIp }, info) => {
    const f = await fixtures(info.project.name);
    await signIn(page, context, visitorIp);
    await page.goto(`/admin/registreerimised?id=${f.registration.id}`);
    const drawer = page.getByRole("dialog", { name: `Registreerimine: ${f.registration.name}` });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("radio", { name: "Kinnitatud" }).check();
    await drawer.getByLabel("Märkus").fill("Maksis kohapeal sularahas");
    await drawer.getByRole("button", { name: "Salvesta staatus" }).click();
    await expect(drawer.getByText("Staatus salvestatud.")).toBeVisible();
    await expect(drawer.locator("[data-reg-status]")).toHaveText("Kinnitatud");
    expect(await storedAdminRegistration(f.registration.id)).toMatchObject({ status: "confirmed", note: "Maksis kohapeal sularahas", paidCents: 0 });

    await drawer.getByRole("button", { name: "Tühista registreerimine" }).click();
    await expect(drawer.locator("[data-reg-status]")).toHaveText("Tühistatud");
    await expect(drawer.locator("[data-cancelled]")).toBeFocused();
    expect(await storedAdminRegistration(f.registration.id)).toMatchObject({ status: "cancelled", note: "Maksis kohapeal sularahas" });
    // a payment does not revive a cancelled registration
    await drawer.getByLabel("Laekunud summa (€)").fill("350");
    await drawer.getByRole("button", { name: "Salvesta summa" }).click();
    await expect(drawer.locator("[data-paid]")).toHaveText("350 €");
    await expect(drawer.locator("[data-reg-status]")).toHaveText("Tühistatud");

    await drawer.getByRole("button", { name: "Sulge" }).click();
    await expect(drawer).toBeHidden();
    await expect(page.locator(`[data-registration="${f.registration.id}"] [data-reg-status]`)).toHaveText("Tühistatud");
  });

  test("registrations: a status form that saw an old status does not overwrite the change made meanwhile", async ({ page, context, visitorIp }, info) => {
    const f = await fixtures(info.project.name);
    await signIn(page, context, visitorIp);
    await page.goto(`/admin/registreerimised?vorm=k&id=${f.registration.id}`);
    const drawer = page.getByRole("dialog", { name: `Registreerimine: ${f.registration.name}` });
    await expect(drawer.locator("[data-reg-status]")).toHaveText("Ootab ettemaksu");
    await setStoredStatus(f.registration.id, "cancelled"); // e.g. Maria cancelled it in another tab
    await drawer.getByRole("radio", { name: "Kinnitatud" }).check();
    await drawer.getByRole("button", { name: "Salvesta staatus" }).click();
    await expect(drawer.getByText("Staatus muutus vahepeal (näed nüüd kehtivat). Vaata üle ja salvesta uuesti.")).toBeVisible();
    await expect(drawer.locator("[data-reg-status]")).toHaveText("Tühistatud");
    await expect(drawer.getByRole("radio", { name: "Tühistatud" })).toBeChecked();
    expect((await storedAdminRegistration(f.registration.id)).status).toBe("cancelled");
    // now that it shows the stored status, a change goes through
    await drawer.getByRole("radio", { name: "Kinnitatud" }).check();
    await drawer.getByRole("button", { name: "Salvesta staatus" }).click();
    await expect(drawer.getByText("Staatus salvestatud.")).toBeVisible();
    expect((await storedAdminRegistration(f.registration.id)).status).toBe("confirmed");
  });

  test("requests: tabs Kontakt / Individuaal / Praktika / Ootenimekiri, the practice request, 'Märgi tehtuks'", async ({ page, context, visitorIp }, info) => {
    const f = await fixtures(info.project.name);
    await signIn(page, context, visitorIp);
    await page.goto("/admin/paringud");
    const tabs = page.locator("[data-request-tabs]");
    await expect(tabs.getByRole("link")).toHaveText([/^Kontakt/, /^Individuaal/, /^Praktika/, /^Ootenimekiri/]);
    await expect(tabs.locator('[data-tab="kontakt"]')).toHaveAttribute("aria-current", "page");

    // Kontakt: the message and the e-learning purchase interest (tagged)
    const contact = page.locator(`[data-request="${f.contact.id}"]`);
    await expect(contact).toContainText(f.contact.name);
    await expect(contact).toContainText("Kas jaanuaris on veel kohti?");
    const interest = page.locator(`[data-request="${f.interest.id}"]`);
    await expect(interest).toContainText("E-õppe huvi");
    await expect(interest).toContainText("Kulmumeistri e-koolitus");
    await expect(interest).toContainText("RU");
    await expect(contact).not.toContainText("E-õppe huvi");
    expect(await noOverflow(page)).toBe(true);

    // Praktika
    await tabs.getByRole("link", { name: /^Praktika/ }).click();
    await expect(page).toHaveURL(/\?liik=praktika$/);
    const practice = page.locator(`[data-request="${f.practice.id}"]`);
    await expect(practice).toContainText(f.practice.name);
    await expect(practice).toContainText("MINI");
    await expect(practice).toContainText("Tööpäeviti pärast kella 17");
    await expect(practice).toContainText("Kulmumeistri baaskoolitus");
    await expect(practice.locator("[data-request-state]")).toHaveText("Uus");
    await practice.getByRole("button", { name: "Märgi tehtuks" }).click();
    await expect(practice.locator("[data-request-state]")).toHaveText("Tehtud");
    await expect.poll(() => requestHandled(f.practice.id)).toBe(true);
    await practice.getByRole("button", { name: "Märgi tegemata" }).click();
    await expect(practice.locator("[data-request-state]")).toHaveText("Uus");
    await expect.poll(() => requestHandled(f.practice.id)).toBe(false);

    // Individuaal and Ootenimekiri: course names (and the session) instead of slugs and ids
    await tabs.getByRole("link", { name: /^Individuaal/ }).click();
    const individual = page.locator(`[data-request="${f.individual.id}"]`);
    await expect(individual).toContainText(f.course.title);
    await expect(individual).toContainText("Jaanuari teine pool");
    await tabs.getByRole("link", { name: /^Ootenimekiri/ }).click();
    const waitlist = page.locator(`[data-request="${f.waitlist.id}"]`);
    await expect(waitlist).toContainText(f.waitlist.name);
    await expect(waitlist).toContainText(f.course.title);
    await expect(waitlist).toContainText(/\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}, Pärnu/);
  });

  test("requests: a failed 'Märgi tehtuks' says so instead of failing silently", async ({ page, context, visitorIp }, info) => {
    const f = await fixtures(info.project.name);
    await signIn(page, context, visitorIp);
    await page.goto("/admin/paringud?liik=praktika");
    const practice = page.locator(`[data-request="${f.practice.id}"]`);
    await expect(practice).toBeVisible();
    await deleteStoredRequest(f.practice.id); // gone behind the open page
    await practice.getByRole("button", { name: "Märgi tehtuks" }).click();
    await expect(practice.getByRole("status")).toHaveText("Salvestamine ei õnnestunud. Proovi uuesti.");
  });

  test("newsletter: 50 subscribers a page, Järgmine / Eelmine, an out-of-range ?leht= shows the last page", async ({ page, context, visitorIp }, info) => {
    await fixtures(info.project.name, { extraSubscribers: 55 });
    await signIn(page, context, visitorIp);
    await page.goto("/admin/uudiskiri");
    const pager = page.locator("[data-pager]");
    await expect(pager).toContainText(/Lehekülg 1 \/ \d+/);
    const pages = Number((await pager.textContent())!.match(/Lehekülg 1 \/ (\d+)/)![1]);
    expect(pages).toBeGreaterThanOrEqual(2);
    await expect(page.locator("[data-subscriber]")).toHaveCount(50);
    await expect(pager.getByRole("link", { name: /Eelmine/ })).toHaveCount(0);
    await pager.getByRole("link", { name: /Järgmine/ }).click();
    await expect(page).toHaveURL(/\/admin\/uudiskiri\?leht=2$/);
    await expect(pager).toContainText(`Lehekülg 2 / ${pages}`);
    await expect(pager.getByRole("link", { name: /Eelmine/ })).toHaveAttribute("href", "/admin/uudiskiri");
    await page.goto("/admin/uudiskiri?leht=9999");
    await expect(pager).toContainText(`Lehekülg ${pages} / ${pages}`);
    await expect(pager.getByRole("link", { name: /Järgmine/ })).toHaveCount(0);
    expect(await noOverflow(page)).toBe(true);
  });

  test("newsletter: the subscribers and the CSV downloads (formula cells defused)", async ({ page, context, visitorIp }, info) => {
    const f = await fixtures(info.project.name);
    await signIn(page, context, visitorIp);
    await page.goto("/admin/uudiskiri");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Uudiskirja tellijad");
    const ok = page.locator("tr", { hasText: f.subscribers.confirmed });
    const waiting = page.locator("tr", { hasText: f.subscribers.pending });
    await expect(ok).toBeVisible();
    await expect(waiting).toContainText("Ootab kinnitust");
    expect(await noOverflow(page)).toBe(true);

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Lae alla kõik (CSV)" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^mslab-uudiskiri-\d{4}-\d{2}-\d{2}\.csv$/);
    const all = readFileSync((await download.path())!, "utf8");
    expect(all.startsWith("\uFEFFE-post,Keel,Nõusolek,Kinnitatud,Kinnitamise aeg\r\n")).toBe(true);
    expect(all).toContain(`${f.subscribers.confirmed},ET,`);
    expect(all).toContain(`${f.subscribers.pending},'=1+1,`); // a formula-like cell gets an apostrophe

    const confirmed = await page.request.get("/api/admin/subscribers.csv?kinnitatud=1");
    expect(confirmed.status()).toBe(200);
    expect(confirmed.headers()["content-type"]).toContain("text/csv");
    expect(confirmed.headers()["cache-control"]).toContain("no-store");
    expect(confirmed.headers()["content-disposition"]).toMatch(/^attachment; filename="mslab-uudiskiri-kinnitatud-\d{4}-\d{2}-\d{2}\.csv"$/);
    const body = await confirmed.text();
    expect(body).toContain(f.subscribers.confirmed);
    expect(body).not.toContain(f.subscribers.pending);
  });

  test("phone: the sidebar is a top bar with a menu drawer (Esc closes it)", async ({ page, context, visitorIp, isMobile }) => {
    await signIn(page, context, visitorIp);
    const button = page.getByRole("button", { name: "Ava menüü" });
    if (!isMobile) {
      await expect(button).toBeHidden();
      await expect(page.locator("aside").getByRole("navigation", { name: "Halduse menüü" })).toBeVisible();
      return;
    }
    await expect(page.locator("aside")).toBeHidden();
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    const drawer = page.locator("[data-admin-drawer]");
    await expect(drawer).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(drawer.getByRole("link", { name: /^Registreerimised/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    await drawer.getByRole("button", { name: "Sulge menüü" }).click();
    await expect(drawer).toBeHidden();
    await button.click();
    await drawer.getByRole("link", { name: /^Päringud/ }).click();
    await expect(page).toHaveURL(/\/admin\/paringud$/);
    await expect(drawer).toBeHidden();
    expect(await noOverflow(page)).toBe(true);
  });
});
