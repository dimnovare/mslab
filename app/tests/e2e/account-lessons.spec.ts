import type { Locator, Page } from "@playwright/test";
import { clientEmail, endClientSessions, insertClient, signInAsClient, takeTerms } from "./account";
import { E2E_BUNNY } from "./bunny-values";
import { LOCK_WAIT_MS, onLocalDb, removeClientRows } from "./fixtures";
import { dropVideo, insertLessonCourse, markDone, removeLessonFile, setVideoShape, type LessonCourse } from "./lessons";
import { smallTargets } from "./targets";
import { submitsForms, test, expect } from "./test";

// Phase 3a Task 9: the student's pages of an e-course with lessons, in a real browser against the real API (the fake Bunny's player
// in the frame): the course page with its progress, "Alusta" / "Jätka", the lessons' states and the lock sentence; a locked lesson's
// page; a video lesson played to the end (done, "Järgmine õppetund"), with the e-mail over the picture and the lesson never loaded
// again meanwhile; a text lesson with its file ("Lae alla": the student's own, nobody else's) and "Märgi tehtuks"; a video lesson
// whose video is not uploaded yet, which nothing can complete; a session ended by another device while a lesson is open; the phone (folded modules, 44 px targets, the player's window-filling
// fallback inside the account's frame); the player and its "Täisekraan" button within the window; Russian. Clients are sample
// addresses (`e2e-client-…@example.test`, never mailed) with rows written straight to the local database (lessons.ts). The lesson
// API checks the course terms, shared by every client, so each test takes them (takeTerms: version "1") and gives them back.

let restoreTerms: (() => Promise<void>) | null = null;
/** The addresses and the stored files this worker's tests made: removed after each test, whatever happened. */
const made = new Set<string>();
const keys = new Set<string>();

test.beforeEach(async ({}, info) => {
  submitsForms();
  // the wait for the shared terms (another test may hold them for a while) is part of this test's time, not taken from it
  info.setTimeout(info.timeout + LOCK_WAIT_MS);
  restoreTerms = await takeTerms();
});

test.afterEach(async () => {
  try {
    for (const email of made) await removeClientRows(email);
    made.clear();
    for (const key of keys) await removeLessonFile(key);
    keys.clear();
  } finally {
    await restoreTerms?.();
    restoreTerms = null;
  }
});

type Student = LessonCourse & { email: string };

/** A fresh student with the lesson course (lessons.ts), signed in on `page` (which is on /konto). */
async function student(page: Page, label: string, project: string, opts: { locale?: "et" | "ru" } = {}): Promise<Student> {
  const email = clientEmail(label, project);
  made.add(email);
  await removeClientRows(email);
  const course = await insertLessonCourse(email, opts);
  keys.add(course.fileKey);
  // in the fake player's frame: a note of the events the page asks for, so a test can wait until the player listens
  await page.addInitScript((fake) => {
    if (location.origin !== fake) return;
    const asked: string[] = [];
    (window as unknown as { __askedEvents: string[] }).__askedEvents = asked;
    addEventListener("message", (e) => {
      try {
        const m = JSON.parse(String(e.data)) as { context?: string; method?: string; value?: unknown };
        if (m.context === "player.js" && m.method === "addEventListener") asked.push(String(m.value));
      } catch {
        // not a Player.js command
      }
    });
  }, E2E_BUNNY.url);
  await signInAsClient(page, email);
  return { email, ...course };
}

const coursePath = (c: Student, ru = false) => `${ru ? "/ru" : ""}/konto/kursus/${c.slug}`;
const lessonPath = (c: Student, id: number, ru = false) => `${coursePath(c, ru)}/${id}`;
const lessonRow = (page: Page, id: number) => page.locator(`[data-lesson="${id}"]`);
const lessonPage = (page: Page) => page.locator("[data-lesson-page]");
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** Waits until the page has asked the fake player for its events (its answer to "ready"): a click on "Mängi lõpuni" is heard then. */
async function playerListens(page: Page): Promise<void> {
  const handle = await page.locator("[data-player] iframe").elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) throw new Error("e2e: no player frame");
  await expect
    .poll(() => frame.evaluate(() => [...((window as unknown as { __askedEvents?: string[] }).__askedEvents ?? [])].sort().join()))
    .toBe("ended,pause,timeupdate");
}

/**
 * The answered GET requests for one lesson's data in this browser context (each one signs the video's URL again). Answered: the dev
 * server's React runs the page's first effect twice, and the first request is cancelled at once.
 */
function lessonLoads(page: Page, c: Student, id: number): string[] {
  const seen: string[] = [];
  page.context().on("requestfinished", (r) => {
    if (r.method() === "GET" && new URL(r.url()).pathname === `/api/konto/kursus/${c.slug}/${id}`) seen.push(r.url());
  });
  return seen;
}

test("the course: '0 / 3 õppetundi tehtud', 'Alusta' to lesson 1, the lessons' states and the lock sentence once; a locked lesson's page says so with 'Jätka'", async ({ page }, info) => {
  const c = await student(page, "les-course", info.project.name);
  await page.goto(coursePath(c));
  await expect(page.locator("[data-ecourse-progress]")).toHaveText("0 / 3 õppetundi tehtud");
  await expect(page.locator("[data-ecourse] [role=progressbar]")).toHaveAttribute("aria-valuenow", "0");
  const next = page.locator("[data-ecourse-next]");
  await expect(next).toHaveText("Alusta");
  await expect(next).toHaveAttribute("href", lessonPath(c, c.lessons.video));
  await expect(lessonRow(page, c.lessons.video)).toHaveAttribute("data-state", "current");
  await expect(lessonRow(page, c.lessons.text)).toHaveAttribute("data-state", "locked");
  await expect(lessonRow(page, c.lessons.last)).toHaveAttribute("data-state", "locked");
  await expect(lessonRow(page, c.lessons.video).getByRole("link")).toHaveText("Esimene tund");
  await expect(lessonRow(page, c.lessons.text).getByRole("link")).toHaveCount(0);
  const hint = page.locator("[data-locked-hint]");
  await expect(hint).toHaveCount(1);
  await expect(hint).toHaveText("Avaneb, kui eelmine õppetund on tehtud.");
  await expect(lessonRow(page, c.lessons.text).locator("[data-locked-hint]")).toHaveCount(1);
  expect(await noOverflow(page)).toBe(true);

  // a locked lesson's own address: the lock sentence and "Jätka" to the lesson that is open
  await page.goto(lessonPath(c, c.lessons.text));
  const locked = page.locator("[data-account-state='locked']");
  await expect(locked.getByRole("heading", { level: 1 })).toHaveText("Avaneb, kui eelmine õppetund on tehtud.");
  await expect(locked.getByRole("link")).toHaveText(["Jätka"]);
  await expect(locked.getByRole("link")).toHaveAttribute("href", lessonPath(c, c.lessons.video));
  await expect(lessonPage(page)).toHaveCount(0);
  await locked.getByRole("link", { name: "Jätka" }).click();
  await expect(page).toHaveURL(new RegExp(`${lessonPath(c, c.lessons.video)}$`));
  await expect(lessonPage(page).getByRole("heading", { level: 1 })).toHaveText("Esimene tund");

  // an address that is no lesson of this course: "Seda õppetundi ei leitud." with the way back
  await page.goto(lessonPath(c, 2147483647));
  await expect(page.locator("[data-account-state='notFound']").getByRole("heading", { level: 1 })).toHaveText("Seda õppetundi ei leitud.");
  await expect(page.locator("[data-account-state='notFound']").getByRole("link")).toHaveAttribute("href", coursePath(c));
  // an id the database cannot hold is not a page at all
  expect((await page.request.get(lessonPath(c, 2147483648), { failOnStatusCode: false })).status()).toBe(404);
});

test("a video lesson: the fake Bunny's frame with the e-mail over it; played to the end: done and 'Järgmine õppetund' to lesson 2, the lesson never loaded again; the course counts it", async ({ page }, info) => {
  const c = await student(page, "les-play", info.project.name);
  const loads = lessonLoads(page, c, c.lessons.video);
  await page.goto(lessonPath(c, c.lessons.video));
  await expect(page.locator("[data-lesson-module]")).toHaveText("Alustame");
  await expect(lessonPage(page).getByRole("heading", { level: 1 })).toHaveText("Esimene tund");
  const frame = page.locator("[data-player] iframe");
  await expect(frame).toHaveAttribute("src", new RegExp(`^${E2E_BUNNY.url}/embed/${E2E_BUNNY.libraryId}/`));
  const src = await frame.getAttribute("src");
  await expect(page.locator("[data-watermark]")).toHaveText(c.email);
  await expect(page.locator("[data-lesson-text] p")).toHaveText(["Vaata video lõpuni."]);
  const next = page.locator("[data-lesson-next]");
  await expect(next).toHaveText("Järgmine õppetund");
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await expect(next).not.toHaveAttribute("href");
  await expect(page.locator("[data-mark-done]")).toHaveCount(0);
  await expect(page.locator("[data-lesson-done]")).toHaveCount(0);

  await playerListens(page);
  // the tab looks away and comes back: nothing is loaded again (a new answer would sign the URL again and reload the video)
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.frameLocator("[data-player] iframe").getByRole("button", { name: "Mängi lõpuni" }).click();
  await expect(page.locator("[data-lesson-done]")).toHaveText("Õppetund tehtud ✓");
  await expect(next).toHaveAttribute("href", lessonPath(c, c.lessons.text));
  await expect(next).not.toHaveAttribute("aria-disabled");
  await expect(frame).toHaveAttribute("src", src!); // the same frame: the video was not reloaded
  expect(loads).toHaveLength(1);

  await next.click();
  await expect(page).toHaveURL(new RegExp(`${lessonPath(c, c.lessons.text)}$`));
  await expect(lessonPage(page).getByRole("heading", { level: 1 })).toHaveText("Teine tund");
  await expect(page.locator("[data-mark-done]")).toHaveText("Märgi tehtuks");
  await page.locator("[data-lesson-back]").click();
  await expect(page).toHaveURL(new RegExp(`${coursePath(c)}$`));
  await expect(page.locator("[data-ecourse-progress]")).toHaveText("1 / 3 õppetundi tehtud");
  await expect(page.locator("[data-ecourse-next]")).toHaveText("Jätka");
  await expect(page.locator("[data-ecourse-next]")).toHaveAttribute("href", lessonPath(c, c.lessons.text));
  await expect(lessonRow(page, c.lessons.video)).toHaveAttribute("data-state", "done");
  await expect(lessonRow(page, c.lessons.text)).toHaveAttribute("data-state", "current");
});

test("a text lesson and its file: 'Lae alla' downloads Juhend.pdf for her and nobody else; 'Märgi tehtuks' opens 'Järgmine õppetund' to lesson 3", async ({ page, browser, request }, info) => {
  const c = await student(page, "les-text", info.project.name);
  await markDone(c.clientId, c.lessons.video);
  await page.goto(lessonPath(c, c.lessons.text));
  await expect(page.locator("[data-lesson-text] p")).toHaveText(["Loe juhend läbi.", "Siis märgi tehtuks."]);
  await expect(page.locator("[data-player]")).toHaveCount(0);
  const files = page.locator("[data-lesson-files]");
  await expect(files.getByRole("heading", { level: 2 })).toHaveText("Failid");
  await expect(files).toContainText("Juhend.pdf");
  await expect(files).toContainText("1 kB");
  const link = files.getByRole("link", { name: "Lae alla: Juhend.pdf" });
  await expect(link).toHaveText("Lae alla");
  const fileUrl = `/api/konto/kursus/${c.slug}/${c.lessons.text}/fail/${c.fileId}`;
  await expect(link).toHaveAttribute("href", fileUrl);
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toBe("Juhend.pdf");

  // without the session: 401; with another signed-in client's session: 404 (not hers to know about)
  const anonymous = await request.get(fileUrl, { failOnStatusCode: false, maxRedirects: 0 });
  expect(anonymous.status()).toBe(401);
  const otherEmail = clientEmail("les-other", info.project.name);
  made.add(otherEmail);
  await removeClientRows(otherEmail);
  await insertClient(otherEmail);
  const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const otherPage = await other.newPage();
    await signInAsClient(otherPage, otherEmail);
    const refused = await otherPage.request.get(fileUrl, { failOnStatusCode: false, maxRedirects: 0 });
    expect(refused.status()).toBe(404);
  } finally {
    await other.close();
  }

  // the one button of a text lesson
  await expect(page.locator("[data-lesson-next]")).toHaveCount(0);
  const mark = page.locator("[data-mark-done]");
  await expect(mark).toHaveText("Märgi tehtuks");
  await mark.click();
  const done = page.locator("[data-lesson-done]");
  await expect(done).toHaveText("Õppetund tehtud ✓");
  await expect(done).toBeFocused();
  await expect(mark).toHaveCount(0);
  const next = page.locator("[data-lesson-next]");
  await expect(next).toHaveText("Järgmine õppetund");
  await expect(next).toHaveAttribute("href", lessonPath(c, c.lessons.last));
  await next.click();
  await expect(page).toHaveURL(new RegExp(`${lessonPath(c, c.lessons.last)}$`));
  await expect(page.locator("[data-lesson-module]")).toHaveText("Edasi");
  await expect(lessonPage(page).getByRole("heading", { level: 1 })).toHaveText("Kolmas tund");
});

test("another device signs in while a lesson is open: 'Märgi tehtuks', or the video's report, ends in 'Sinu konto avati teises seadmes', not an endless 'Proovi uuesti'", async ({ page }, info) => {
  const c = await student(page, "les-ended", info.project.name);
  await markDone(c.clientId, c.lessons.video);
  const replaced = page.locator("[data-account-state='replaced']");

  // the text lesson: the press is answered 401, the page asks again and says so
  await page.goto(lessonPath(c, c.lessons.text));
  await expect(page.locator("[data-mark-done]")).toBeVisible();
  await endClientSessions(c.clientId);
  await page.locator("[data-mark-done]").click();
  await expect(replaced.getByRole("heading", { level: 1 })).toHaveText("Sinu konto avati teises seadmes");
  await expect(replaced.getByRole("link")).toHaveText(["Saada uus kood"]);
  await expect(page.getByText("Ei õnnestunud salvestada. Proovi uuesti.")).toHaveCount(0);

  // the video lesson: the player's report is answered 401, the page says the same
  await signInAsClient(page, c.email);
  await onLocalDb((sql) => sql`delete from lesson_progress where client_id = ${c.clientId}`, { marksPages: false });
  await page.goto(lessonPath(c, c.lessons.video));
  await playerListens(page);
  await endClientSessions(c.clientId);
  await page.frameLocator("[data-player] iframe").getByRole("button", { name: "Mängi lõpuni" }).click();
  await expect(replaced.getByRole("heading", { level: 1 })).toHaveText("Sinu konto avati teises seadmes");
  await expect(page.locator("[data-player]")).toHaveCount(0);
});

test("a video lesson whose video is not uploaded yet: 'Video lisandub peagi', no button, nothing completes it, and the next lesson stays locked", async ({ page }, info) => {
  const c = await student(page, "les-soon", info.project.name);
  await dropVideo(c.lessons.video);
  await page.goto(lessonPath(c, c.lessons.video));
  await expect(page.locator("[data-lesson-soon]")).toHaveText("Video lisandub peagi");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator("[data-mark-done]")).toHaveCount(0);
  await expect(page.locator("[data-lesson-next]")).toHaveCount(0);
  await expect(lessonPage(page).getByRole("button")).toHaveCount(0);
  await expect(lessonPage(page).getByRole("link")).toHaveText(["Tagasi koolitusele"]);
  for (const [action, data] of [["progress", { watchedSec: 1 }], ["tehtud", undefined]] as const) {
    const res = await page.request.post(`/api/konto/kursus/${c.slug}/${c.lessons.video}/${action}`, { data, failOnStatusCode: false });
    expect(res.status(), action).toBe(409);
    expect(await res.json(), action).toEqual({ ok: false, error: "video" });
  }
  await page.goto(lessonPath(c, c.lessons.text));
  await expect(page.locator("[data-account-state='locked']").getByRole("heading", { level: 1 })).toHaveText("Avaneb, kui eelmine õppetund on tehtud.");
  await page.goto(coursePath(c));
  await expect(page.locator("[data-ecourse-progress]")).toHaveText("0 / 3 õppetundi tehtud");
  await expect(lessonRow(page, c.lessons.text)).toHaveAttribute("data-state", "locked");
});

test("a phone (390 × 844): the module of the next lesson open and the other folded (a tap opens it), 44 px targets, nothing wider than the screen; the player's window-filling fallback covers the screen over the account's frame", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // an iPhone has no Fullscreen API for the wrapper: the player fills the window itself (position: fixed under the account's frame)
  await page.addInitScript(() => {
    delete (Element.prototype as { requestFullscreen?: unknown }).requestFullscreen;
  });
  const c = await student(page, "les-phone", info.project.name);
  await page.goto(coursePath(c));
  const folds = page.locator("[data-module] details");
  await expect(folds).toHaveCount(2);
  await expect(folds.nth(0)).toHaveJSProperty("open", true);
  await expect(folds.nth(1)).toHaveJSProperty("open", false);
  await expect(lessonRow(page, c.lessons.last)).toBeHidden();
  const summary = folds.nth(1).locator("summary");
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await summary.click();
  await expect(folds.nth(1)).toHaveJSProperty("open", true);
  await expect(lessonRow(page, c.lessons.last)).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  expect(await smallTargets(page.locator("main"))).toEqual([]);

  await page.goto(lessonPath(c, c.lessons.video));
  await playerListens(page);
  expect(await noOverflow(page)).toBe(true);
  expect(await smallTargets(page.locator("main"))).toEqual([]);
  const wrapper = page.locator("[data-player]");
  const button = page.locator("[data-fullscreen]");
  await button.click();
  await expect(wrapper).toHaveAttribute("data-expanded", "");
  // the whole screen, whatever the page around it: no ancestor makes position: fixed relative to itself (a transform, a filter)
  expect(await wrapper.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  // and on top of everything: the site's header and the account's bottom bar are under it (only the review tools' comment button,
  // #mslab-fb, which leaves at the launch, may lie over it)
  const covered = await page.evaluate(() => {
    const player = document.querySelector("[data-player]")!;
    const points = [[2, 2], [195, 40], [388, 2], [195, 422], [2, 842], [195, 820], [388, 842]];
    return points
      .filter(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return !player.contains(el) && !el?.closest("#mslab-fb");
      })
      .map((p) => p.join(","));
  });
  expect(covered, "points of the screen not covered by the player").toEqual([]);
  const [mark, frame] = await Promise.all([page.locator("[data-watermark]").boundingBox(), page.locator("[data-player-frame]").boundingBox()]);
  expect(await page.evaluate(() => document.querySelector("[data-player]")!.contains(document.querySelector("[data-watermark]")))).toBe(true);
  expect(mark!.x >= frame!.x && mark!.y >= frame!.y && mark!.x + mark!.width <= frame!.x + frame!.width + 0.5 && mark!.y + mark!.height <= frame!.y + frame!.height + 0.5, "the watermark on the picture").toBe(true);
  await expect(button).toHaveText("Välju täisekraanist");
  await expect(button).toBeInViewport({ ratio: 1 });
  await button.click();
  await expect(wrapper).not.toHaveAttribute("data-expanded");
  await expect(button).toHaveText("Täisekraan");
});

/** The "Täisekraan" button lies wholly in the window, above the account's bottom bar on a phone; the frame stays in its column. */
async function playerFits(page: Page, what: string): Promise<void> {
  const button = page.locator("[data-fullscreen]");
  await expect(button, what).toBeInViewport({ ratio: 1 });
  const b = (await button.boundingBox())!;
  const bar: Locator = page.locator("[data-account-tabs='bottom']");
  if (await bar.isVisible()) expect(b.y + b.height, `${what}: above the bottom bar`).toBeLessThanOrEqual((await bar.boundingBox())!.y + 0.5);
  const [frame, column] = await page.evaluate(() => {
    const r = (el: Element) => el.getBoundingClientRect().toJSON() as { x: number; width: number; height: number };
    const player = document.querySelector("[data-player]")!;
    return [r(document.querySelector("[data-player-frame]")!), r(player.closest("[data-lesson-page]")!)];
  });
  expect(frame.width, `${what}: within the page's column`).toBeLessThanOrEqual(column.width + 0.5);
  expect(await noOverflow(page), what).toBe(true);
}

test("the player and its 'Täisekraan' fit the window as the lesson opens: 16:9, 4:3 and upright, at 1440 × 900 (a computer) or 390 × 844 (a phone); the browser's fullscreen holds the watermark", async ({ page, isMobile }, info) => {
  const c = await student(page, "les-fit", info.project.name);
  const size = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(size);
  for (const [label, shape, aspect] of [
    ["16:9 (shape unknown)", null, 16 / 9],
    ["16:9", [1920, 1080], 16 / 9],
    ["4:3", [1440, 1080], 4 / 3],
    ["upright", [1080, 1920], 1080 / 1920],
  ] as const) {
    if (shape) await setVideoShape(c.lessons.video, shape[0], shape[1]);
    await page.goto(lessonPath(c, c.lessons.video));
    const frame = (await page.locator("[data-player-frame]").boundingBox())!;
    expect(Math.abs(frame.width / frame.height - aspect) / aspect, `${label}: the video's shape`).toBeLessThan(0.01);
    await playerFits(page, `${size.width} × ${size.height}, ${label}`);
  }
  if (isMobile) return; // the phone's fullscreen is the window-filling wrapper (above)
  await setVideoShape(c.lessons.video, 1920, 1080);
  await page.goto(lessonPath(c, c.lessons.video));
  await playerListens(page);
  const button = page.locator("[data-fullscreen]");
  await button.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.hasAttribute("data-player") ?? false)).toBe(true);
  expect(await page.evaluate(() => document.fullscreenElement!.contains(document.querySelector("[data-watermark]")))).toBe(true);
  await button.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(button).toBeFocused();
});

test("Russian: the course says 'Пройдено уроков: 0 / 3' and 'Начать'; the lesson 'Следующий урок' and 'Назад к курсу'", async ({ page }, info) => {
  const c = await student(page, "les-ru", info.project.name, { locale: "ru" });
  await page.goto(coursePath(c, true));
  await expect(page.locator("[data-ecourse-progress]")).toHaveText("Пройдено уроков: 0 / 3");
  await expect(page.locator("[data-ecourse-next]")).toHaveText("Начать");
  await expect(page.locator("[data-ecourse-next]")).toHaveAttribute("href", lessonPath(c, c.lessons.video, true));
  await expect(page.locator("[data-module] [data-module-title]")).toHaveText(["Начинаем", "Дальше"]);
  await expect(page.locator("[data-locked-hint]")).toHaveText("Откроется, когда предыдущий урок будет пройден.");
  await page.locator("[data-ecourse-next]").click();
  await expect(page).toHaveURL(new RegExp(`${lessonPath(c, c.lessons.video, true)}$`));
  await expect(lessonPage(page).getByRole("heading", { level: 1 })).toHaveText("Первый урок");
  await expect(page.locator("[data-lesson-module]")).toHaveText("Начинаем");
  await expect(page.locator("[data-lesson-next]")).toHaveText("Следующий урок");
  await expect(page.locator("[data-fullscreen]")).toHaveText("Во весь экран");
  await expect(page.locator("[data-lesson-back]")).toHaveText("Назад к курсу");
  await expect(page.locator("[data-lesson-back]")).toHaveAttribute("href", coursePath(c, true));
});
