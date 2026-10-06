import type { Frame, Page, Request } from "@playwright/test";
import { clientEmail, signInAsClient, takeTerms } from "./account";
import { E2E_BUNNY } from "./bunny-values";
import { LOCK_WAIT_MS, removeClientRows } from "./fixtures";
import { insertPlayerLesson, openPlayerHarness, readyLesson, storedProgress } from "./player-harness";
import { smallTargets } from "./targets";
import { submitsForms, test, expect } from "./test";

// Phase 3a Task 8: the lesson player (components/account/LessonPlayer.tsx) in a real browser, on its own page (player-harness.ts:
// the lesson page that holds it comes with Task 9), with the lesson API's signed embed URL and e-mail, the fake Bunny's Player.js
// page in the iframe (fake-bunny.ts) and the real progress endpoint: the frame, the watermark over it, the reports up to done, only
// the player's origin heard, the last point sent on leaving, "Video ei lae. Proovi hiljem uuesti." when Bunny never answers, our
// fullscreen with the Fullscreen API and without it (an iPhone). Clients are sample addresses (`e2e-client-…@example.test`, never
// mailed); the lesson API checks the course terms, so the terms are taken (takeTerms) just for reading the lesson.

const made = new Set<string>();

test.beforeEach(async ({}, info) => {
  submitsForms();
  info.setTimeout(info.timeout + LOCK_WAIT_MS); // the wait for the shared terms is this test's time, not taken from it
});

test.afterEach(async () => {
  for (const email of made) await removeClientRows(email);
  made.clear();
});

/** A fresh student with a ready video lesson, signed in on `page` (which is on /konto), and the lesson API's answer for it. */
async function student(page: Page, label: string, project: string) {
  const email = clientEmail(label, project);
  made.add(email);
  await removeClientRows(email);
  const lesson = await insertPlayerLesson(email);
  // in the fake player's frame: a note of the events the page asks for (the fake keeps its own list to itself)
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
  const restoreTerms = await takeTerms();
  try {
    return { email, lesson, view: await readyLesson(page, lesson) };
  } finally {
    await restoreTerms();
  }
}

/** The fake Bunny's frame inside the player. */
async function fakeFrame(page: Page): Promise<Frame> {
  const frame = await (await page.locator("[data-player] iframe").elementHandle())?.contentFrame();
  if (!frame) throw new Error("e2e: no player frame");
  return frame;
}

/** Waits until the page has asked the fake player for its events (its answer to "ready"). */
const subscribed = (frame: Frame) =>
  expect.poll(() => frame.evaluate(() => [...((window as unknown as { __askedEvents?: string[] }).__askedEvents ?? [])].sort().join())).toBe("ended,pause,timeupdate");

/** Posts a Player.js event from `frame`'s window to its parent, as the player would. */
const postFromPlayer = (frame: Frame, event: string, value?: unknown) =>
  frame.evaluate(([e, v]) => parent.postMessage(JSON.stringify({ context: "player.js", version: "0.0.11", event: e, value: v }), "*"), [event, value] as const);

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** The progress reports for `lessonId` made in this browser context (keepalive ones of a page going away included). */
function progressReports(page: Page, lessonId: number): unknown[] {
  const bodies: unknown[] = [];
  page.context().on("request", (r: Request) => {
    if (r.method() === "POST" && new URL(r.url()).pathname.endsWith(`/${lessonId}/progress`)) bodies.push(r.postDataJSON());
  });
  return bodies;
}

test("the player: Bunny's frame (the fake) with the student's e-mail over it, played to the end: done", async ({ page }, info) => {
  const { email, lesson, view } = await student(page, "play", info.project.name);
  expect(view.video.embedUrl.startsWith(`${E2E_BUNNY.url}/embed/${E2E_BUNNY.libraryId}/`), view.video.embedUrl).toBe(true);
  expect(new URL(view.video.embedUrl).searchParams.get("autoplay")).toBe("false");
  const reports = progressReports(page, lesson.lessonId);
  await openPlayerHarness(page, lesson, view);

  const frame = page.locator("[data-player] iframe");
  await expect(frame).toHaveAttribute("src", view.video.embedUrl);
  await expect(frame).toHaveAttribute("allow", "autoplay; encrypted-media");
  await expect(frame).not.toHaveAttribute("allowfullscreen");
  await expect(frame).toHaveAttribute("title", "Video: Esimene tund");
  const mark = page.locator("[data-watermark]");
  await expect(mark).toHaveText(email);
  await expect(mark).toHaveAttribute("aria-hidden", "true");
  const [m, f] = [(await mark.boundingBox())!, (await frame.boundingBox())!];
  expect(m.x >= f.x && m.y >= f.y && m.x + m.width <= f.x + f.width && m.y + m.height <= f.y + f.height, "the watermark lies over the video").toBe(true);
  expect(await mark.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe("none");

  await subscribed(await fakeFrame(page));
  await page.frameLocator("[data-player] iframe").getByRole("button", { name: "Mängi lõpuni" }).click();
  await expect(page.locator("[data-harness-done]")).toHaveText("Õppetund tehtud ✓");
  expect(await storedProgress(lesson.clientId, lesson.lessonId)).toEqual({ watchedSec: 125, done: true });
  // pause sent 125 and the answer said done; "ended" had nothing new (a 15 s report may have come during the play)
  expect(reports.at(-1)).toEqual({ watchedSec: 125 });
  expect(reports.length).toBeLessThanOrEqual(2);
  await expect(page.locator("[data-player-error]")).toHaveCount(0);
  expect(await noOverflow(page)).toBe(true);
  expect(await smallTargets(page.locator("[data-player]"))).toEqual([]);
});

test("only the player's origin is heard; leaving the page sends the last point (fetch keepalive), and the server takes it", async ({ page }, info) => {
  const { lesson, view } = await student(page, "leave", info.project.name);
  await openPlayerHarness(page, lesson, view);
  const fake = await fakeFrame(page);
  await subscribed(fake);
  // the page itself posing as the player (the end of the video): not heard
  await page.evaluate(() => {
    for (const m of [{ event: "timeupdate", value: { seconds: 120, duration: 125 } }, { event: "ended" }])
      window.postMessage(JSON.stringify({ context: "player.js", version: "0.0.11", ...m }), "*");
  });
  // the player at 30.6 s, then the student leaves (no pause): the report goes out as the page goes away (Playwright no longer sees
  // a request of a page being unloaded, so the database is the witness; one report and not two: lesson-player.test.ts)
  await postFromPlayer(fake, "timeupdate", { seconds: 30.6, duration: 125 });
  expect(await storedProgress(lesson.clientId, lesson.lessonId)).toBeNull();
  await page.goto("/konto");
  await expect.poll(() => storedProgress(lesson.clientId, lesson.lessonId)).toEqual({ watchedSec: 30, done: false });
});

test("no word from Bunny (a token it refuses): 'Video ei lae. Proovi hiljem uuesti.' after 20 s, and nothing reported", async ({ page }, info) => {
  const { lesson, view } = await student(page, "fail", info.project.name);
  const bad = new URL(view.video.embedUrl);
  bad.searchParams.set("token", "0".repeat(64));
  await page.clock.install();
  await openPlayerHarness(page, lesson, view, { embedUrl: bad.href });
  const error = page.locator("[data-player-error]");
  await expect(page.locator("[data-player] iframe")).toBeAttached();
  await page.clock.fastForward(19_000);
  await expect(error).toHaveCount(0);
  await page.clock.fastForward(1_000);
  await expect(error).toHaveText("Video ei lae. Proovi hiljem uuesti.");
  await expect(error).toHaveAttribute("role", "status");
  await expect(error).toBeInViewport();
  await expect(page.locator("[data-fullscreen]")).toHaveCount(0); // no "Täisekraan" for a video that does not load
  expect(await storedProgress(lesson.clientId, lesson.lessonId)).toBeNull();
});

test("our fullscreen: the wrapper with the watermark fills the screen; the same button leaves it", async ({ page }, info) => {
  const { lesson, view } = await student(page, "full", info.project.name);
  await openPlayerHarness(page, lesson, view);
  const button = page.locator("[data-fullscreen]");
  await expect(button).toHaveText("Täisekraan");
  await button.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.hasAttribute("data-player") ?? false)).toBe(true);
  expect(await page.evaluate(() => document.fullscreenElement!.contains(document.querySelector("[data-watermark]")))).toBe(true);
  await expect(page.locator("[data-watermark]")).toBeInViewport();
  await expect(button).toHaveText("Välju täisekraanist");
  const screen = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const frame = (await page.locator("[data-player] iframe").boundingBox())!;
  expect(Math.round(frame.width)).toBe(screen.width);
  expect(frame.height).toBeGreaterThan(screen.height * 0.75); // the frame takes the space above the button
  await button.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(button).toHaveText("Täisekraan");
});

test("without the Fullscreen API (an iPhone): the wrapper covers the window, the page under it stays still, Escape closes it", async ({ page }, info) => {
  const { lesson, view } = await student(page, "cover", info.project.name);
  await page.addInitScript(() => {
    delete (Element.prototype as { requestFullscreen?: unknown }).requestFullscreen;
  });
  await openPlayerHarness(page, lesson, view, { locale: "ru" });
  const wrapper = page.locator("[data-player]");
  const button = page.locator("[data-fullscreen]");
  await expect(page.locator("[data-player] iframe")).toHaveAttribute("title", "Видео: Первый урок");
  await expect(button).toHaveText("Во весь экран");
  await button.click();
  await expect(wrapper).toHaveAttribute("data-expanded", "");
  await expect(button).toHaveText("Выйти из полноэкранного режима");
  const screen = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  expect(await wrapper.boundingBox()).toEqual({ x: 0, y: 0, ...screen });
  await expect(page.locator("[data-watermark]")).toBeInViewport();
  await expect(button).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
  expect(await smallTargets(wrapper)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(wrapper).not.toHaveAttribute("data-expanded");
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  await expect(button).toHaveText("Во весь экран");
});
