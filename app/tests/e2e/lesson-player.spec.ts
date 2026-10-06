import type { Frame, Page, Request } from "@playwright/test";
import { clientEmail, signInAsClient, takeTerms } from "./account";
import { E2E_BUNNY } from "./bunny-values";
import { LOCK_WAIT_MS, removeClientRows } from "./fixtures";
import { insertPlayerLesson, openPlayerHarness, readyLesson, setProgress, storedProgress } from "./player-harness";
import { smallTargets } from "./targets";
import { submitsForms, test, expect } from "./test";

// Phase 3a Task 8: the lesson player (components/account/LessonPlayer.tsx) in a real browser, on its own page (player-harness.ts:
// the lesson page that holds it comes with Task 9), with the lesson API's signed embed URL and e-mail, the fake Bunny's Player.js
// page in the iframe (fake-bunny.ts) and the real progress endpoint: the frame, the watermark over it, the reports up to done, only
// the player's origin heard, the last point sent on leaving, "Video ei lae. Proovi hiljem uuesti." when Bunny never answers, our
// fullscreen with the Fullscreen API and without it (an iPhone), with the watermark on the picture in every corner, upright and
// sideways; the resume point. Clients are sample addresses (`e2e-client-…@example.test`, never
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
async function student(page: Page, label: string, project: string, opts: { watchedSec?: number } = {}) {
  const email = clientEmail(label, project);
  made.add(email);
  await removeClientRows(email);
  const lesson = await insertPlayerLesson(email);
  if (opts.watchedSec !== undefined) await setProgress(lesson.clientId, lesson.lessonId, opts.watchedSec);
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

type Box = { x: number; y: number; w: number; h: number };
const box = (r: { x: number; y: number; width: number; height: number }): Box => ({ x: r.x, y: r.y, w: r.width, h: r.height });

/**
 * Enlarged (our fullscreen or the window-filling wrapper): the frame is a 16:9 box (the picture Bunny shows in it), as large as fits
 * in the space above the button and in its middle, the iframe exactly on it, and the watermark inside it, in each of its four corners
 * (the page's clock moves it on: page.clock must be installed).
 */
async function expectWatermarkOnPicture(page: Page): Promise<void> {
  const corners = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const b = await page.evaluate(() => {
      const r = (el: Element) => el.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number };
      const frame = document.querySelector("[data-player-frame]")!;
      const mark = document.querySelector("[data-watermark]")!;
      return { frame: r(frame), stage: r(frame.parentElement!), iframe: r(frame.querySelector("iframe")!), mark: r(mark), corner: mark.getAttribute("data-corner")! };
    });
    const [frame, stage, iframe, mark] = [box(b.frame), box(b.stage), box(b.iframe), box(b.mark)];
    const where = `corner ${b.corner}: frame ${JSON.stringify(frame)}, stage ${JSON.stringify(stage)}, mark ${JSON.stringify(mark)}`;
    expect(Math.abs(frame.w / frame.h - 16 / 9), where).toBeLessThan(0.01);
    expect(Math.abs(frame.w - stage.w) <= 1 || Math.abs(frame.h - stage.h) <= 1, `${where}: as large as fits`).toBe(true);
    expect(Math.abs(frame.x + frame.w / 2 - (stage.x + stage.w / 2)), `${where}: centred across`).toBeLessThanOrEqual(1);
    expect(Math.abs(frame.y + frame.h / 2 - (stage.y + stage.h / 2)), `${where}: centred down`).toBeLessThanOrEqual(1);
    expect(iframe, where).toEqual(frame);
    const inside = mark.x >= frame.x && mark.y >= frame.y && mark.x + mark.w <= frame.x + frame.w + 0.5 && mark.y + mark.h <= frame.y + frame.h + 0.5;
    expect(inside, `${where}: the watermark on the picture`).toBe(true);
    corners.add(b.corner);
    await page.clock.fastForward(60_000);
  }
  expect([...corners].sort()).toEqual(["0", "1", "2", "3"]);
}

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

test("only the player's frame is heard (its origin and its window); leaving the page sends the last point (fetch keepalive), and the server takes it", async ({ page }, info) => {
  const { lesson, view } = await student(page, "leave", info.project.name);
  await openPlayerHarness(page, lesson, view);
  const fake = await fakeFrame(page);
  await subscribed(fake);
  // the page itself posing as the player (the end of the video): another origin and another window, not heard
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
  await expect(page.locator("[data-player-frame] [role=status]")).toHaveText("Video ei lae. Proovi hiljem uuesti."); // the live region
  await expect(error).toBeInViewport();
  await expect(page.locator("[data-fullscreen]")).toHaveCount(0); // no "Täisekraan" for a video that does not load
  expect(await storedProgress(lesson.clientId, lesson.lessonId)).toBeNull();
});

test("our fullscreen: the wrapper fills the screen with the picture in its middle and the watermark on it; the same button leaves it", async ({ page }, info) => {
  const { lesson, view } = await student(page, "full", info.project.name);
  await page.clock.install();
  await openPlayerHarness(page, lesson, view);
  await subscribed(await fakeFrame(page));
  const button = page.locator("[data-fullscreen]");
  await expect(button).toHaveText("Täisekraan");
  await button.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.hasAttribute("data-player") ?? false)).toBe(true);
  expect(await page.evaluate(() => document.fullscreenElement!.contains(document.querySelector("[data-watermark]")))).toBe(true);
  await expect(button).toHaveText("Välju täisekraanist");
  await expectWatermarkOnPicture(page);
  await button.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(button).toHaveText("Täisekraan");
  await expect(button).toBeFocused();
});

test("without the Fullscreen API (an iPhone): the wrapper covers the window, the watermark on the picture upright and sideways, the focus kept inside, Escape closes it", async ({ page }, info) => {
  const { lesson, view } = await student(page, "cover", info.project.name);
  await page.addInitScript(() => {
    delete (Element.prototype as { requestFullscreen?: unknown }).requestFullscreen;
  });
  await page.clock.install();
  await openPlayerHarness(page, lesson, view, { locale: "ru" });
  await subscribed(await fakeFrame(page));
  // a link of the page outside the player (the lesson page has some)
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = "#elsewhere";
    a.textContent = "elsewhere";
    a.setAttribute("data-outside", "");
    document.body.append(a);
  });
  const wrapper = page.locator("[data-player]");
  const button = page.locator("[data-fullscreen]");
  await expect(page.locator("[data-player] iframe")).toHaveAttribute("title", "Видео: Первый урок");
  await expect(button).toHaveText("Во весь экран");
  await button.click();
  await expect(wrapper).toHaveAttribute("data-expanded", "");
  await expect(button).toHaveText("Выйти из полноэкранного режима");
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    expect(await wrapper.boundingBox()).toEqual({ x: 0, y: 0, ...size });
    await expect(button).toBeInViewport();
    await expectWatermarkOnPicture(page);
  }
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
  expect(await smallTargets(wrapper)).toEqual([]);
  // Tab from the button would go to the link outside: the focus stays in the player
  await button.focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.querySelector("[data-player]")!.contains(document.activeElement))).toBe(true);
  await page.locator("[data-outside]").focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(wrapper).not.toHaveAttribute("data-expanded");
  await expect(button).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  await expect(button).toHaveText("Во весь экран");
});

test("resume: the frame starts at the saved second (t=40) and the reports begin past it", async ({ page }, info) => {
  const { lesson, view } = await student(page, "resume", info.project.name, { watchedSec: 40 });
  expect(view.video.resumeAt).toBe(40);
  expect(new URL(view.video.embedUrl).searchParams.get("t")).toBe("40");
  const reports = progressReports(page, lesson.lessonId);
  await openPlayerHarness(page, lesson, view);
  await expect(page.locator("[data-player] iframe")).toHaveAttribute("src", /[?&]t=40(&|$)/);
  await expect(page.frameLocator("[data-player] iframe").locator("[data-fake-time]")).toHaveText("40"); // the fake starts there
  const fake = await fakeFrame(page);
  await subscribed(fake);
  // within the saved second: nothing to say; past it: reported (the messages are handled in order)
  await postFromPlayer(fake, "timeupdate", { seconds: 40.8, duration: 125 });
  await postFromPlayer(fake, "pause");
  await postFromPlayer(fake, "timeupdate", { seconds: 45.2, duration: 125 });
  await postFromPlayer(fake, "pause");
  await expect.poll(() => storedProgress(lesson.clientId, lesson.lessonId)).toEqual({ watchedSec: 45, done: false });
  expect(reports).toEqual([{ watchedSec: 45 }]);
});
