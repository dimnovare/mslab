import { test, expect, type Page } from "@playwright/test";
import { LOCAL_FIXTURES } from "./fixtures";

// Task 9: calendar (L1–L5), practice (R1–R5), trainer (T1–T4), blog (B1), contact and legal pages.
// The first three tests are the brief's tests, verbatim except one locator: `getByText(/ak/)` first matched the header's
// "Praktika" menu link (pr-AK-tika), which is hidden on phones, so the duration check is `/\d+\s*ak\b/` ("≈ 4 ak").
// The rest cover the remaining checklist items against the seed data (8 contact-course sessions, the Tartu one
// cancelled; MINI/MAXI; 7 trainer works; 6 posts). Against the local server, global-setup also makes the LAMI Pärnu
// session full and the Lash Lift Viljandi one "few" with test-owned registrations (see fixtures.ts).

test("calendar puts course name first and shows language", async ({ page }) => {
  await page.goto("/koolituskalender");
  const row = page.locator("[data-calendar-row]").first();
  const name = row.locator("[data-course-name]"); const city = row.locator("[data-city]");
  const [nf, cf] = await Promise.all([name.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)), city.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))]);
  expect(nf).toBeGreaterThan(cf);
  await expect(row.locator("[data-lang]")).toHaveText(/ET|RU/);
});
test("practice says Pärnu only and shows durations", async ({ page }) => {
  await page.goto("/praktika");
  await expect(page.getByText(/ainult Pärnus/i).first()).toBeVisible();
  await expect(page.getByText(/\d+\s*ak\b/).first()).toBeVisible();
});
test("trainer page has gallery, story and journey", async ({ page }) => {
  await page.goto("/koolitaja");
  await expect(page.getByText("Koolituskeskuse lugu")).toBeVisible();
  await expect(page.getByText("Koolitaja teekond")).toBeVisible();
  await page.locator("[data-works] img").first().click(); await expect(page.getByRole("dialog")).toBeVisible();
});

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};
const fontSize = (el: import("@playwright/test").Locator) => el.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));

test.describe("calendar", () => {
  test("rows: date, dominant course name, city and venue, format and language, seat state, action (L1–L4)", async ({ page }) => {
    await page.goto("/koolituskalender");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Koolituskalender");
    const rows = page.locator("[data-calendar-row]");
    await expect(rows).toHaveCount(8); // contact-course sessions only; e-learning has no dates
    await expect(page.getByText("Kulmumeistri e-koolitus")).toHaveCount(0);

    const first = rows.first();
    await expect(first.locator("[data-course-name]")).toHaveText("Kulmumeistri baaskoolitus");
    await expect(first.locator("[data-city]")).toHaveText("Pärnu");
    await expect(first).toContainText("MS LAB stuudio, Rüütli 12");
    await expect(first).toContainText("14.11");
    await expect(first).toContainText("laupäev");
    await expect(first).toContainText("Kontaktõpe");
    await expect(first).toContainText("Vabu kohti · 4");
    // Course name at A's city size (Jost 26px), before the city in reading order (L2, L3).
    const name = first.locator("[data-course-name]");
    expect(await fontSize(name)).toBe(26);
    expect(await name.evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/Jost/i);
    const nameFirst = await first.evaluate((row) => {
      const n = row.querySelector("[data-course-name]")!;
      const c = row.querySelector("[data-city]")!;
      return Boolean(n.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(nameFirst).toBe(true);
    for (const r of await rows.all()) expect(await fontSize(r.locator("[data-course-name]"))).toBeGreaterThan(await fontSize(r.locator("[data-city]")));

    // Language tag on every row (L4): the bilingual LAMI shows both.
    await expect(rows.locator("[data-lang]")).toHaveCount(8);
    await expect(rows.filter({ hasText: "Kulmude LAMI" }).first().locator("[data-lang]")).toContainText("ET / RU");

    // Registreeru → the course page with that session picked.
    const register = first.getByRole("link", { name: /Registreeru/ });
    const target = await register.getAttribute("href");
    expect(target).toMatch(/^\/koolitused\/kulmumeistri-baaskoolitus\?sessioon=\d+$/);
    await register.click();
    await expect(page).toHaveURL(target!);
    const id = target!.split("=")[1];
    await expect(page.locator(`[data-session='${id}']`)).toHaveAttribute("aria-checked", "true");
  });

  test("a cancelled session says Tühistatud and offers the other dates", async ({ page }) => {
    await page.goto("/koolituskalender");
    const cancelled = page.locator("[data-calendar-row][data-state='cancelled']");
    await expect(cancelled).toHaveCount(1);
    await expect(cancelled).toContainText("Tühistatud");
    await expect(cancelled).toContainText("Lash Lift BOTOX baaskoolitus");
    await expect(cancelled.getByRole("link", { name: /Registreeru/ })).toHaveCount(0);
    await expect(cancelled.getByRole("link", { name: /Vaata teisi/ })).toHaveAttribute("href", "/koolitused/lash-lift-botox");
  });

  test("city filter: ?linn is the source of truth; Back, reload and unknown values (L5)", async ({ page }) => {
    await page.goto("/koolituskalender");
    const chips = page.locator("[data-city-filter] button");
    await expect(chips).toHaveText(["Kõik", "Pärnu", "Tallinn", "Tartu", "Viljandi"]);
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    const rows = page.locator("[data-calendar-row]");

    await page.locator("[data-city-filter]").getByRole("button", { name: "Tallinn" }).click();
    await expect(page).toHaveURL(/\/koolituskalender\?linn=tallinn$/);
    await expect(rows).toHaveCount(2);
    await expect(rows.locator("[data-city]")).toHaveText(["Tallinn", "Tallinn"]);
    await expect(page.locator("[data-city-filter]").getByRole("button", { name: "Tallinn" })).toHaveAttribute("aria-pressed", "true");

    await rows.first().getByRole("link", { name: /Registreeru/ }).click();
    await expect(page).toHaveURL(/\/koolitused\/lash-lift-botox\?sessioon=\d+$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/koolituskalender\?linn=tallinn$/);
    await expect(rows).toHaveCount(2);
    await expect(page.locator("[data-city-filter]").getByRole("button", { name: "Tallinn" })).toHaveAttribute("aria-pressed", "true");

    await page.locator("[data-city-filter]").getByRole("button", { name: "Kõik" }).click();
    await expect(page).toHaveURL(/\/koolituskalender$/);
    await expect(rows).toHaveCount(8);

    await page.goto("/koolituskalender?linn=viljandi");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator("[data-city]")).toHaveText("Viljandi");
    await page.reload();
    await expect(rows).toHaveCount(1);

    await page.goto("/koolituskalender?linn=parnu");
    await expect(rows).toHaveCount(3);

    await page.goto("/koolituskalender?linn=narva");
    await expect(rows).toHaveCount(8);
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
  });

  test("RU calendar", async ({ page }) => {
    await page.goto("/ru/koolituskalender");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Расписание");
    await expect(page.locator("[data-city-filter] button").first()).toHaveText("Все");
    await expect(page.locator("[data-calendar-row]").first().getByRole("link", { name: /Записаться/ })).toHaveAttribute("href", /^\/ru\/koolitused\/.+\?sessioon=\d+$/);
  });
});

test.describe("calendar seat states (test-owned fixtures in the local DB)", () => {
  test.skip(!LOCAL_FIXTURES, "the seat fixtures are only inserted into the local dev database");

  test("a full session: Täis, the Ootenimekirja disclosure and the waitlist form (L3, A3)", async ({ page }) => {
    await page.goto("/koolituskalender");
    const full = page.locator("[data-calendar-row][data-state='full']");
    await expect(full).toHaveCount(1);
    await expect(full.locator("[data-course-name]")).toHaveText("Kulmude LAMI");
    await expect(full.locator("[data-city]")).toHaveText("Pärnu");
    await expect(full).toContainText("23.01");
    await expect(full).toContainText("Täis");
    expect(await full.locator("[data-seat-state]").evaluate((e) => getComputedStyle(e).color)).toBe("rgb(94, 85, 89)");
    await expect(full.getByRole("link", { name: /Registreeru/ })).toHaveCount(0);

    // Disclosure: opens the form under the row with focus in the name field, and closes again.
    const toggle = full.getByRole("button", { name: /Ootenimekirja/ });
    const form = full.locator("[data-waitlist-form]");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(form).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`[id="${await toggle.getAttribute("aria-controls")}"]`)).toBeVisible();
    await expect(form.getByLabel("Nimi")).toBeFocused();
    await expect(form).toContainText("Kulmude LAMI · 23.01 · Pärnu");
    await expect(form).toHaveAttribute("method", "post");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(form).toBeHidden();
    await toggle.click();
    await expect(form.getByLabel("Nimi")).toBeFocused();

    // Errors: focus goes to the first invalid field, which describes its error.
    const submit = form.getByRole("button", { name: "Liitu ootenimekirjaga" });
    await submit.click();
    const name = form.getByLabel("Nimi");
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveAccessibleDescription("See väli on kohustuslik.");
    await name.fill("Test Õpilane");
    const email = form.getByLabel("E-post", { exact: true });
    await email.fill("vale-aadress");
    await submit.click();
    await expect(email).toBeFocused();
    await expect(email).toHaveAccessibleDescription("Sisesta korrektne e-posti aadress.");
    await expect(name).not.toHaveAttribute("aria-invalid", "true");

    // A valid request shows the confirmation and moves focus to it.
    await email.fill("test@example.com");
    await submit.click();
    const sent = full.locator("[data-waitlist-sent]");
    await expect(sent).toHaveText("Aitäh! Oled ootenimekirjas.");
    await expect(sent).toBeFocused();
  });

  test("a session with two seats left says Viimased kohad and can still be booked", async ({ page }) => {
    await page.goto("/koolituskalender");
    const few = page.locator("[data-calendar-row][data-state='few']");
    await expect(few).toHaveCount(1);
    await expect(few.locator("[data-course-name]")).toHaveText("Lash Lift BOTOX baaskoolitus");
    await expect(few.locator("[data-city]")).toHaveText("Viljandi");
    await expect(few).toContainText("Viimased kohad · 2");
    expect(await few.locator("[data-seat-state]").evaluate((e) => getComputedStyle(e).color)).toBe("rgb(107, 79, 92)");
    await expect(few.getByRole("link", { name: /Registreeru/ })).toHaveAttribute("href", /^\/koolitused\/lash-lift-botox\?sessioon=\d+$/);
    await expect(few.getByRole("button", { name: /Ootenimekirja/ })).toHaveCount(0);
  });

  test("the course page shows the full date but it cannot be picked", async ({ page }) => {
    await page.goto("/koolitused/kulmude-lami");
    const full = page.locator("[data-session][data-state='full']");
    await expect(full).toHaveCount(1);
    await expect(full).toHaveAttribute("aria-disabled", "true");
    await expect(full).toContainText("Täis");
    await full.click({ force: true });
    await expect(full).toHaveAttribute("aria-checked", "false");
  });

  test("RU: full and few rows", async ({ page }) => {
    await page.goto("/ru/koolituskalender");
    const full = page.locator("[data-calendar-row][data-state='full']");
    await expect(full).toContainText("Мест нет");
    await expect(full.getByRole("button", { name: /В лист ожидания/ })).toBeVisible();
    await expect(page.locator("[data-calendar-row][data-state='few']")).toContainText("Последние места · 2");
  });
});

test.describe("practice", () => {
  test("H1 Praktika first, Pärnu only, Maria's text and the protocol, MINI and MAXI with durations and Jost prices (R1–R5)", async ({ page }) => {
    await page.goto("/praktika");
    await expect(page.locator("#main").locator("h1, h2").first()).toHaveText("Praktika");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Praktika");
    await expect(page.getByText("Praktika toimub ainult Pärnus, MS LAB stuudios.")).toBeVisible();
    const panel = page.locator("[data-practice]");
    await expect(panel.getByText(/Praktika toimub koolitaja juhendamisel/)).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Praktikaprotokoll" })).toBeVisible();
    await expect(panel).toContainText("MINI");
    await expect(panel).toContainText("MAXI");
    await expect(panel).toContainText("≈ 4 ak");
    await expect(panel).toContainText("≈ 8 ak");
    await expect(panel).toContainText("Töö kahel modellil");
    const prices = panel.locator("[data-price]");
    await expect(prices).toHaveText(["100 €", "150 €"]);
    expect(await prices.first().evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/Jost/i);
    // The H1 is the largest heading on the page (H11).
    expect(await fontSize(page.getByRole("heading", { level: 1 }))).toBeGreaterThan(await fontSize(panel.locator("h2")));
  });

  test("?pakett=MAXI#taotlus preselects the package and lands on the form; card buttons switch it", async ({ page }) => {
    await page.goto("/praktika?pakett=MAXI#taotlus");
    const form = page.locator("[data-practice-form]");
    await expect(form.getByRole("radio", { name: /MAXI/ })).toBeChecked();
    await expect(page.locator("#taotlus")).toBeInViewport();
    await expect(page.locator("#taotlus")).toContainText("Valitud pakett: MAXI");
    await expect(page.locator("[data-package='MAXI']")).toHaveAttribute("data-selected", "true");

    await page.locator("[data-practice]").getByRole("link", { name: /Registreeru MINI/ }).click();
    await expect(page).toHaveURL(/\/praktika\?pakett=MINI#taotlus$/);
    await expect(form.getByRole("radio", { name: /MINI/ })).toBeChecked();
    await expect(page.locator("[data-package='MINI']")).toHaveAttribute("data-selected", "true");

    await form.getByRole("radio", { name: /MAXI/ }).check();
    await expect(page).toHaveURL(/\/praktika\?pakett=MAXI#taotlus$/);
    await expect(page.locator("[data-package='MAXI']")).toHaveAttribute("data-selected", "true");
    await page.reload();
    await expect(form.getByRole("radio", { name: /MAXI/ })).toBeChecked();
  });

  test("home practice cards lead to the form with the package picked", async ({ page }) => {
    await page.goto("/");
    await page.locator("[data-practice]").getByRole("link", { name: /Registreeru MAXI/ }).click();
    await expect(page).toHaveURL(/\/praktika\?pakett=MAXI#taotlus$/);
    await expect(page.locator("[data-practice-form]").getByRole("radio", { name: /MAXI/ })).toBeChecked();
  });

  test("request form: focus goes to the first invalid field; a complete request is sent", async ({ page }) => {
    await page.goto("/praktika");
    const form = page.locator("[data-practice-form]");
    await expect(form).toHaveAttribute("method", "post");
    await form.getByRole("button", { name: "Saada taotlus" }).click();
    await expect(form.getByRole("radio", { name: /MINI/ })).toBeFocused();
    await form.getByRole("radio", { name: /MINI/ }).check();
    await form.getByRole("button", { name: "Saada taotlus" }).click();
    const nameField = form.getByLabel("Nimi");
    await expect(nameField).toBeFocused();
    await expect(nameField).toHaveAttribute("aria-invalid", "true");
    await expect(nameField).toHaveAccessibleDescription("See väli on kohustuslik.");
    await nameField.fill("Test Õpilane");
    await form.getByLabel("E-post", { exact: true }).fill("test@example.com");
    await form.getByLabel("Telefon").fill("+372 5555 5555");
    await form.getByLabel(/Läbitud koolitus/).fill("Kulmumeistri baaskoolitus");
    await form.getByLabel(/Millised ajad/).fill("Tööpäeva õhtud");
    await form.getByRole("button", { name: "Saada taotlus" }).click();
    await expect(page.getByText("Taotlus on saadetud.")).toBeVisible();
    await expect(page.locator("[data-practice-sent]")).toBeFocused();
  });

  test("RU practice", async ({ page }) => {
    await page.goto("/ru/praktika?pakett=MINI");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Практика");
    await expect(page.getByText("Практика проходит только в Пярну, в студии MS LAB.")).toBeVisible();
    await expect(page.locator("[data-practice-form]").getByRole("radio", { name: /MINI/ })).toBeChecked();
  });
});

test.describe("trainer", () => {
  test("D base: name, bio, stats, portrait with the works gallery under it (T1, T2)", async ({ page, isMobile }) => {
    await page.goto("/koolitaja");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Maria Sosnina");
    await expect(page.getByText(/Töötan Pärnus ilukliinikus/)).toBeVisible();
    await expect(page.getByText("8+")).toBeVisible();
    await expect(page.getByRole("link", { name: "Vaata koolitusi" })).toHaveAttribute("href", "/koolitused");
    const portrait = await page.locator("[data-portrait]").boundingBox();
    const works = page.locator("[data-works]");
    await expect(works.getByRole("heading", { name: "Koolitaja tööd" })).toBeVisible();
    const box = await works.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(portrait!.y + portrait!.height - 1);
    expect(Math.abs(box!.x - portrait!.x)).toBeLessThan(2);
    await expect(works.locator("[data-work]")).toHaveCount(7);

    // Per view: 3 on desktop, about 1.2 on phones (2 on tablets, checked below).
    const perView = () =>
      works.locator("[data-works-track]").evaluate((track) => {
        const item = track.firstElementChild as HTMLElement;
        const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
        return (track.clientWidth + gap) / (item.getBoundingClientRect().width + gap);
      });
    if (isMobile) expect(await perView()).toBeCloseTo(1.2, 1);
    else {
      expect(await perView()).toBeCloseTo(3, 1);
      await page.setViewportSize({ width: 834, height: 1112 });
      await expect.poll(perView).toBeCloseTo(2, 1);
    }
  });

  test("works carousel: arrows scroll, lightbox opens at the image, ←/→ move, Esc closes and returns focus (T2)", async ({ page }) => {
    await page.goto("/koolitaja");
    const works = page.locator("[data-works]");
    const track = works.locator("[data-works-track]");
    const prev = works.getByRole("button", { name: "Eelmine" });
    const next = works.getByRole("button", { name: "Järgmine" });
    await expect(prev).toBeDisabled();
    await next.click();
    await expect.poll(() => track.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
    await expect(prev).toBeEnabled();

    const second = works.locator("[data-work]").nth(1).getByRole("button");
    await second.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("2 / 7");
    await page.keyboard.press("ArrowRight");
    await expect(dialog).toContainText("3 / 7");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(second).toBeFocused();
  });

  test("carousel arrows keep keyboard focus at the ends (aria-disabled, not disabled)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/koolitaja");
    const works = page.locator("[data-works]");
    const track = works.locator("[data-works-track]");
    const prev = works.getByRole("button", { name: "Eelmine" });
    const next = works.getByRole("button", { name: "Järgmine" });
    await expect(prev).toHaveAttribute("aria-disabled", "true");
    await expect(next).not.toHaveAttribute("aria-disabled", "true");
    await next.focus();
    for (let i = 0; i < 10 && (await next.getAttribute("aria-disabled")) !== "true"; i++) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);
    }
    await expect(next).toHaveAttribute("aria-disabled", "true");
    await expect(next).toBeFocused();
    const end = await track.evaluate((e) => e.scrollLeft);
    await page.keyboard.press("Enter"); // nothing to scroll at the end
    await page.waitForTimeout(100);
    expect(await track.evaluate((e) => e.scrollLeft)).toBe(end);
    await expect(prev).not.toHaveAttribute("aria-disabled", "true");
    await prev.focus();
    for (let i = 0; i < 10 && (await prev.getAttribute("aria-disabled")) !== "true"; i++) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);
    }
    await expect(prev).toHaveAttribute("aria-disabled", "true");
    await expect(prev).toBeFocused();
    expect(await track.evaluate((e) => e.scrollLeft)).toBe(0);
  });

  test("Koolituskeskuse lugu and Koolitaja teekond are editorial blocks with a thin rose rule (T3, T4)", async ({ page }) => {
    await page.goto("/koolitaja");
    const story = page.locator("[data-story='center_story']");
    const journey = page.locator("[data-story='trainer_journey']");
    await expect(story.getByRole("heading", { level: 2 })).toHaveText("Koolituskeskuse lugu");
    await expect(story).toContainText("MS LAB ühendab teooria ja praktika.");
    await expect(journey.getByRole("heading", { level: 2 })).toHaveText("Koolitaja teekond");
    await expect(journey).toContainText("Maria täiendab.");
    for (const block of [story, journey]) {
      const rule = await block.evaluate((e) => { const c = getComputedStyle(e); return { w: c.borderTopWidth, c: c.borderTopColor }; });
      expect(rule).toEqual({ w: "1px", c: "rgb(158, 137, 147)" });
    }
    const s = await story.boundingBox(); const j = await journey.boundingBox();
    expect(j!.y).toBeGreaterThan(s!.y);
  });

  test("RU trainer: Russian section names until Maria adds Russian titles, Estonian text as fallback", async ({ page }) => {
    await page.goto("/ru/koolitaja");
    await expect(page.locator("[data-story='center_story'] h2")).toHaveText("История учебного центра");
    await expect(page.locator("[data-story='center_story']")).toContainText("MS LAB объединяет теорию и практику.");
    await expect(page.locator("[data-story='trainer_journey'] h2")).toHaveText("Путь преподавателя");
    await expect(page.locator("[data-story='trainer_journey']")).toContainText("Maria täiendab.");
    await expect(page.locator("[data-works]").getByRole("heading")).toHaveText("Работы преподавателя");
  });
});

test.describe("blog", () => {
  test("list: D grid of cards that open the full post (B1)", async ({ page }) => {
    await page.goto("/uudised");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blogi.");
    const cards = page.locator("[data-news-card]");
    await expect(cards).toHaveCount(6);
    await expect(cards.first()).toContainText("22.09.2026 · Nõuanne");
    await expect(cards.first()).toHaveAttribute("href", "/uudised/kuidas-valida-endale-sobiv-kulmukoolitus");
    await cards.nth(2).click();
    await expect(page).toHaveURL(/\/uudised\/praktika-modellidega-mida-oodata$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Praktika modellidega — mida oodata?");
  });

  test("article: crumb, date and category, cover, paragraphs, Loe veel with three other posts", async ({ page }) => {
    await page.goto("/uudised/praktika-modellidega-mida-oodata");
    await expect(page.getByRole("navigation", { name: "Lehe asukoht" }).getByRole("link", { name: "Uudised" })).toHaveAttribute("href", "/uudised");
    await expect(page.locator("[data-article]")).toContainText("02.09.2026 · Praktika");
    await expect(page.locator("[data-article-cover] img")).toBeVisible();
    await expect(page.locator("[data-article-body] p")).toHaveCount(3);
    await expect(page.locator("[data-article-body] p").first()).toContainText("Kuidas praktikapäev käib");
    const more = page.locator("[data-more-posts]");
    await expect(more.getByRole("heading", { name: "Loe veel" })).toBeVisible();
    await expect(more.locator("[data-news-card]")).toHaveCount(3);
    await expect(more.locator("[data-news-card][href='/uudised/praktika-modellidega-mida-oodata']")).toHaveCount(0);
  });

  test("an unknown post is a 404 inside the shell", async ({ page }) => {
    const res = await page.goto("/uudised/olematu-postitus");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Lehte ei leitud" })).toBeVisible();
  });

  test("RU blog uses RU interface text and falls back to ET content", async ({ page }) => {
    await page.goto("/ru/uudised");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Блог.");
    await expect(page.locator("[data-news-card]").first()).toHaveAttribute("href", /^\/ru\/uudised\//);
    await page.goto("/ru/uudised/praktika-modellidega-mida-oodata");
    await expect(page.locator("[data-article]")).toContainText("02.09.2026 · Практика");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Praktika modellidega — mida oodata?");
    await expect(page.locator("[data-more-posts]").getByRole("heading", { name: "Читайте также" })).toBeVisible();
  });
});

test.describe("contact and legal", () => {
  test("contact page: details from settings and the D contact form", async ({ page }) => {
    await page.goto("/kontakt");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Alustame vestlusest.");
    await expect(page.locator("[data-contact-details]").getByRole("link", { name: "info@mslab.ee" })).toHaveAttribute("href", "mailto:info@mslab.ee");
    const form = page.locator("[data-contact-form]");
    await expect(form).toHaveAttribute("method", "post");
    await form.getByRole("button", { name: "Saada" }).click();
    await expect(form.getByLabel("Nimi")).toBeFocused();
    await expect(form.getByLabel("Nimi")).toHaveAttribute("aria-invalid", "true");
    await form.getByLabel("Nimi").fill("Test Õpilane");
    await form.getByLabel("E-post", { exact: true }).fill("test@example.com");
    await form.getByLabel("Sõnum").fill("Tere! Küsimus praktika kohta.");
    await form.getByRole("button", { name: "Saada" }).click();
    await expect(page.getByText("Aitäh! Sinu sõnum on saadetud.")).toBeVisible();
  });

  test("privacy and terms render their stored text; the footer links reach them", async ({ page }) => {
    for (const [path, title] of [["/privaatsus", "Privaatsus"], ["/tingimused", "Õppetingimused"]]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.locator("[data-legal-body]")).toContainText("Maria täiendab");
    }
    await page.goto("/ru/tingimused");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Условия обучения");
    await page.goto("/konto");
    await page.locator("footer").getByRole("link", { name: "Privaatsus" }).click();
    await expect(page).toHaveURL(/\/privaatsus$/);
    await page.locator("footer").getByRole("link", { name: "Õppetingimused" }).click();
    await expect(page).toHaveURL(/\/tingimused$/);
  });
});

test("new pages: no horizontal overflow and no console errors", async ({ page }) => {
  const errors = collectErrors(page);
  for (const p of [
    "/koolituskalender",
    "/koolituskalender?linn=tartu",
    "/praktika?pakett=MAXI#taotlus",
    "/koolitaja",
    "/uudised",
    "/uudised/kuidas-valida-endale-sobiv-kulmukoolitus",
    "/kontakt",
    "/privaatsus",
    "/tingimused",
    "/ru/koolituskalender",
    "/ru/praktika",
    "/ru/koolitaja",
  ]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const w = await page.evaluate(() => window.innerWidth);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), p).toBeLessThanOrEqual(w);
  }
  expect(errors).toEqual([]);
});
