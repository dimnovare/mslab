import type { Frame, Page, Request } from "@playwright/test";
import { clientEmail, signInAsClient, takeTerms } from "./account";
import { E2E_BUNNY } from "./bunny-values";
import { LOCK_WAIT_MS, removeClientRows } from "./fixtures";
import { backdateClock } from "./lessons";
import { insertPlayerLesson, openPlayerHarness, readyLesson, setProgress, storedProgress, type FakeShape } from "./player-harness";
import { smallTargets } from "./targets";
import { submitsForms, test, expect } from "./test";

// Phase 3a Task 8: the lesson player (components/account/LessonPlayer.tsx) in a real browser, on its own page (player-harness.ts:
// the lesson page that holds it comes with Task 9), with the lesson API's signed embed URL and e-mail, the fake Bunny's Player.js
// page in the iframe (fake-bunny.ts) and the real progress endpoint: the frame, the watermark over it, the reports up to done, only
// the player's origin heard, the last point sent on leaving, "Video ei lae. Proovi hiljem uuesti." when Bunny never answers, our
// fullscreen with the Fullscreen API and without it (an iPhone), with the watermark on the picture in every corner, upright and
// sideways; the resume point; and (Task 8b) an upright video (1080 × 1920 in the fake Bunny, stored by the app through the webhook
// and handed to the player by the lesson API): the frame has its shape, is capped in height and centred at normal size, and is the
// largest upright box that fits, centred, when enlarged, with the watermark on the picture each time; and (phase 2c) the seek lock: a
// jump forward is sent back to the furthest point watched, with the line under the player. Clients are sample addresses (`e2e-client-…@example.test`, never
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
async function student(page: Page, label: string, project: string, opts: { watchedSec?: number; shape?: FakeShape } = {}) {
  const email = clientEmail(label, project);
  made.add(email);
  await removeClientRows(email);
  const lesson = await insertPlayerLesson(email, { shape: opts.shape });
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

/** The fake player playing from `from` to `to`: Player.js timeupdates a second apart, as a playing video sends them (the seek lock takes back a jump of more than 3 s). */
async function playFrom(frame: Frame, from: number, to: number, duration = 125) {
  for (let s = Math.floor(from) + 1; s < to; s++) await postFromPlayer(frame, "timeupdate", { seconds: s, duration });
  await postFromPlayer(frame, "timeupdate", { seconds: to, duration });
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

type Box = { x: number; y: number; w: number; h: number };
const box = (r: { x: number; y: number; width: number; height: number }): Box => ({ x: r.x, y: r.y, w: r.width, h: r.height });

/** The player's boxes now: the wrapper's column, the stage, the frame, the iframe in it and the watermark (with the corner it is in). */
async function playerBoxes(page: Page) {
  const b = await page.evaluate(() => {
    const r = (el: Element) => el.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number };
    const frame = document.querySelector("[data-player-frame]")!;
    const wrapper = document.querySelector("[data-player]")!;
    const mark = document.querySelector("[data-watermark]")!;
    return {
      column: r(wrapper.parentElement!),
      wrapper: r(wrapper),
      stage: r(frame.parentElement!),
      frame: r(frame),
      iframe: r(frame.querySelector("iframe")!),
      mark: r(mark),
      corner: mark.getAttribute("data-corner")!,
    };
  });
  return { column: box(b.column), wrapper: box(b.wrapper), stage: box(b.stage), frame: box(b.frame), iframe: box(b.iframe), mark: box(b.mark), corner: b.corner };
}

/**
 * The frame is the video's shape (`aspect` = width / height) with the iframe exactly on it, and the watermark lies inside it, in each of
 * its four corners (the page's clock moves it on: page.clock must be installed). `check` adds what the screen state asks of the frame.
 */
async function expectPictureWithWatermark(page: Page, aspect: number, check: (b: Awaited<ReturnType<typeof playerBoxes>>, where: string) => void): Promise<void> {
  const corners = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const b = await playerBoxes(page);
    const { frame, stage, iframe, mark } = b;
    const where = `corner ${b.corner}: frame ${JSON.stringify(frame)}, stage ${JSON.stringify(stage)}, mark ${JSON.stringify(mark)}`;
    expect(Math.abs(frame.w / frame.h - aspect) / aspect, `${where}: the video's shape`).toBeLessThan(0.01);
    check(b, where);
    expect(iframe, where).toEqual(frame);
    const inside = mark.x >= frame.x && mark.y >= frame.y && mark.x + mark.w <= frame.x + frame.w + 0.5 && mark.y + mark.h <= frame.y + frame.h + 0.5;
    expect(inside, `${where}: the watermark on the picture`).toBe(true);
    corners.add(b.corner);
    await page.clock.fastForward(60_000);
  }
  expect([...corners].sort()).toEqual(["0", "1", "2", "3"]);
}

/**
 * Enlarged (our fullscreen or the window-filling wrapper): the frame is a box of the video's shape (16:9 unless said: the picture
 * Bunny shows in it), as large as fits in the space above the button and in its middle, the iframe exactly on it, the watermark on it
 * in every corner.
 */
const expectWatermarkOnPicture = (page: Page, aspect = 16 / 9) =>
  expectPictureWithWatermark(page, aspect, ({ frame, stage }, where) => {
    expect(Math.abs(frame.w - stage.w) <= 1 || Math.abs(frame.h - stage.h) <= 1, `${where}: as large as fits`).toBe(true);
    expect(frame.w <= stage.w + 1 && frame.h <= stage.h + 1, `${where}: within the stage`).toBe(true);
    expect(Math.abs(frame.x + frame.w / 2 - (stage.x + stage.w / 2)), `${where}: centred across`).toBeLessThanOrEqual(1);
    expect(Math.abs(frame.y + frame.h / 2 - (stage.y + stage.h / 2)), `${where}: centred down`).toBeLessThanOrEqual(1);
  });

/**
 * Normal size, a video that is not wide: its height is at most 80 % of the window's (and 720 px), the frame is in its column
 * (never wider) and centred in it, the watermark on the picture in every corner; nothing runs off the screen sideways.
 */
async function expectUprightInColumn(page: Page, aspect: number): Promise<void> {
  const viewport = page.viewportSize()!;
  await expectPictureWithWatermark(page, aspect, ({ frame, column }, where) => {
    expect(frame.h, `${where}: at most 80 % of the window's height`).toBeLessThanOrEqual(viewport.height * 0.8 + 0.5);
    expect(frame.h, `${where}: at most 720 px`).toBeLessThanOrEqual(720.5);
    expect(frame.w, `${where}: within the column`).toBeLessThanOrEqual(column.w + 0.5);
    expect(Math.abs(frame.x + frame.w / 2 - (column.x + column.w / 2)), `${where}: centred in the column`).toBeLessThanOrEqual(1);
    expect(frame.x >= 0 && frame.x + frame.w <= viewport.width + 0.5, `${where}: on the screen across`).toBe(true);
  });
  expect(await noOverflow(page)).toBe(true);
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
  await backdateClock(lesson.clientId, lesson.lessonId);
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
  await playFrom(fake, 0, 30.6);
  expect(await storedProgress(lesson.clientId, lesson.lessonId)).toEqual({ watchedSec: 0, done: false });
  await page.goto("/konto");
  await expect.poll(() => storedProgress(lesson.clientId, lesson.lessonId)).toEqual({ watchedSec: 30, done: false });
});

test("no word from Bunny (a token it refuses): 'Video ei lae. Proovi hiljem uuesti.' after 20 s, and nothing reported", async ({ page }, info) => {
  const { lesson, view } = await student(page, "noword", info.project.name);
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
  expect(await storedProgress(lesson.clientId, lesson.lessonId)).toEqual({ watchedSec: 0, done: false });
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
  await playFrom(fake, 40.8, 45.2);
  await postFromPlayer(fake, "pause");
  await expect.poll(() => storedProgress(lesson.clientId, lesson.lessonId)).toEqual({ watchedSec: 45, done: false });
  expect(reports).toEqual([{ watchedSec: 45 }]);
});

// ---- the video's shape (Task 8b): Maria may record upright on a phone, or mix shapes ----

/** A phone video held upright, stored by the fake Bunny as 1080 × 1920. */
const UPRIGHT: FakeShape = { width: 1080, height: 1920 };
const SIZES = { phone: { width: 390, height: 844 }, sideways: { width: 844, height: 390 }, desktop: { width: 1440, height: 900 } };

test("an upright video (1080 × 1920 from Bunny, through the webhook): the frame is upright, at most 80 % of the window high and centred in its column at 390 × 844 and 1440 × 900", async ({ page }, info) => {
  const { lesson, view } = await student(page, "upright", info.project.name, { shape: UPRIGHT });
  expect(view.video.shape).toEqual({ width: 1080, height: 1920 }); // what the app stored from Bunny's answer
  await page.clock.install();
  await openPlayerHarness(page, lesson, view);
  await subscribed(await fakeFrame(page));
  const wrapper = page.locator("[data-player]");
  await expect(wrapper).toHaveAttribute("data-upright", "");
  for (const size of [SIZES.phone, SIZES.desktop]) {
    await page.setViewportSize(size);
    await expectUprightInColumn(page, 1080 / 1920);
    // not smaller than it may be: as tall as the cap lets it be, or (a phone) as wide as its column
    const { frame, column } = await playerBoxes(page);
    const atCap = frame.h >= Math.min(size.height * 0.8, 720) - 1;
    expect(atCap || Math.abs(frame.w - column.w) <= 1, `${size.width} × ${size.height}: frame ${JSON.stringify(frame)}, column ${JSON.stringify(column)}`).toBe(true);
    expect(await smallTargets(wrapper)).toEqual([]);
  }
  // the fullscreen button is under the frame, within the frame's column
  const { frame, wrapper: w } = await playerBoxes(page);
  const button = (await page.locator("[data-fullscreen]").boundingBox())!;
  expect(button.y).toBeGreaterThanOrEqual(frame.y + frame.h - 1);
  expect(button.x >= w.x - 1 && button.x + button.width <= w.x + w.w + 1).toBe(true);
});

test("an upright video, our fullscreen: the largest upright box that fits the screen, in its middle, the watermark on the picture; the same button leaves it", async ({ page }, info) => {
  const { lesson, view } = await student(page, "upfull", info.project.name, { shape: UPRIGHT });
  await page.clock.install();
  await openPlayerHarness(page, lesson, view);
  await subscribed(await fakeFrame(page));
  const button = page.locator("[data-fullscreen]");
  await button.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.hasAttribute("data-player") ?? false)).toBe(true);
  expect(await page.evaluate(() => document.fullscreenElement!.contains(document.querySelector("[data-watermark]")))).toBe(true);
  await expectWatermarkOnPicture(page, 1080 / 1920);
  await button.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(button).toHaveText("Täisekraan");
  await expectUprightInColumn(page, 1080 / 1920); // back to the capped column
});

test("an upright video without the Fullscreen API (an iPhone): the wrapper covers the window, the frame is the largest upright box, upright and sideways", async ({ page }, info) => {
  const { lesson, view } = await student(page, "upcover", info.project.name, { shape: UPRIGHT });
  await page.addInitScript(() => {
    delete (Element.prototype as { requestFullscreen?: unknown }).requestFullscreen;
  });
  await page.clock.install();
  await openPlayerHarness(page, lesson, view);
  await subscribed(await fakeFrame(page));
  const wrapper = page.locator("[data-player]");
  const button = page.locator("[data-fullscreen]");
  await button.click();
  await expect(wrapper).toHaveAttribute("data-expanded", "");
  for (const size of [SIZES.phone, SIZES.sideways, SIZES.desktop]) {
    await page.setViewportSize(size);
    expect(await wrapper.boundingBox(), `${size.width} × ${size.height}: the wrapper covers the window`).toEqual({ x: 0, y: 0, ...size });
    await expect(button).toBeInViewport();
    await expectWatermarkOnPicture(page, 1080 / 1920);
  }
  await page.keyboard.press("Escape");
  await expect(wrapper).not.toHaveAttribute("data-expanded");
  await page.setViewportSize(SIZES.phone);
  await expectUprightInColumn(page, 1080 / 1920); // the capped column is back, not the window-filling box
});

test("a 4:3 video (a mixed course): at normal size it fills the column like a wide one; enlarged it is its own 4:3 box", async ({ page }, info) => {
  const { lesson, view } = await student(page, "fourthree", info.project.name, { shape: { width: 1440, height: 1080 } });
  expect(view.video.shape).toEqual({ width: 1440, height: 1080 });
  await page.clock.install();
  await openPlayerHarness(page, lesson, view);
  await subscribed(await fakeFrame(page));
  await expect(page.locator("[data-player]")).not.toHaveAttribute("data-upright");
  for (const size of [SIZES.phone, SIZES.desktop]) {
    await page.setViewportSize(size);
    const { frame, column } = await playerBoxes(page);
    expect(Math.abs(frame.w - column.w), `${size.width} × ${size.height}: fills the column`).toBeLessThanOrEqual(1);
    expect(Math.abs(frame.w / frame.h - 4 / 3)).toBeLessThan(0.01);
  }
  await page.locator("[data-fullscreen]").click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.hasAttribute("data-player") ?? false)).toBe(true);
  await expectWatermarkOnPicture(page, 4 / 3);
});

test("a video stored with a quarter turn (1920 × 1080, rotation 90: a phone held upright) is handed to the player as 1080 × 1920", async ({ page }, info) => {
  const { view } = await student(page, "turned", info.project.name, { shape: { width: 1920, height: 1080, rotation: 90 } });
  expect(view.video.shape).toEqual({ width: 1080, height: 1920 });
});

test("the seek lock: a jump forward is taken back to the furthest point watched (setCurrentTime), with the line under the player; rewinding is free", async ({ page }, info) => {
  const { lesson, view } = await student(page, "seek", info.project.name);
  const reports = progressReports(page, lesson.lessonId);
  await openPlayerHarness(page, lesson, view);
  const fake = await fakeFrame(page);
  await subscribed(fake);
  await playFrom(fake, 0, 6);
  const pictureBefore = (await playerBoxes(page)).frame;
  await postFromPlayer(fake, "timeupdate", { seconds: 90, duration: 125 }); // the slider dragged far ahead
  await expect.poll(() => fake.evaluate(() => (window as unknown as { __seeks?: number[] }).__seeks ?? [])).toEqual([6]);
  const note = page.locator("[data-seek-note]");
  await expect(note).toHaveText("Edasi saab kerida kuni kohani, kuhu oled jõudnud.");
  expect((await playerBoxes(page)).frame, "the picture does not move as the line comes").toEqual(pictureBefore); // only what is under it makes room
  await postFromPlayer(fake, "timeupdate", { seconds: 2, duration: 125 }); // back: free
  await postFromPlayer(fake, "pause");
  await expect.poll(() => storedProgress(lesson.clientId, lesson.lessonId)).toEqual({ watchedSec: 6, done: false });
  expect(reports).toEqual([{ watchedSec: 6 }]);
  await expect(note).toHaveText("", { timeout: 8_000 }); // gone after 6 s
  expect(await noOverflow(page)).toBe(true);
});

/** What the line must not move while the student drags the slider: the player's boxes and the fullscreen button's (the mark's corner too). */
async function layoutOf(page: Page) {
  const { wrapper, stage, frame, iframe, mark, corner } = await playerBoxes(page);
  return { wrapper, stage, frame, iframe, mark, corner, button: box((await page.locator("[data-fullscreen]").boundingBox())!) };
}

type Layout = Awaited<ReturnType<typeof layoutOf>>;

/** The largest difference, in pixels, between two layouts' boxes (Infinity when the mark is in another corner). */
function layoutDistance(a: Layout, b: Layout): number {
  if (a.corner !== b.corner) return Infinity;
  let most = 0;
  for (const part of ["wrapper", "stage", "frame", "iframe", "mark", "button"] as const)
    for (const side of ["x", "y", "w", "h"] as const) most = Math.max(most, Math.abs(a[part][side] - b[part][side]));
  return most;
}

/**
 * The layout once it has stopped changing by itself, so that only the line can move anything between two readings: the pointer is
 * taken off the button (its hover lift, translateY(-2px) over 0.2 s, would be in the button's box, and a click's :active scale before
 * it), the fonts are loaded (the watermark's Manrope 600 may still be landing, and it sizes the mark), every transition has ended, and
 * two readings 50 ms apart are the same. Under load each of these can still be going on a second after the click that enlarged it.
 */
async function settledLayout(page: Page, pointer: { x: number; y: number }): Promise<Layout> {
  await page.mouse.move(pointer.x, pointer.y);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
  });
  let last = await layoutOf(page);
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(50);
    const next = await layoutOf(page);
    if (layoutDistance(next, last) < 0.01) return next;
    last = next;
  }
  throw new Error(`e2e: the player's layout does not settle: ${JSON.stringify(last)}`);
}

/** The same layout, to within half a pixel. */
function expectSameLayout(actual: Layout, expected: Layout, message: string): void {
  for (const part of ["wrapper", "stage", "frame", "iframe", "mark", "button"] as const)
    for (const side of ["x", "y", "w", "h"] as const)
      expect(Math.abs(actual[part][side] - expected[part][side]), `${message}: ${part}.${side} is ${JSON.stringify(actual[part])}, was ${JSON.stringify(expected[part])}`).toBeLessThanOrEqual(0.5);
  expect(actual.corner, message).toBe(expected.corner);
}

// fix round 1: an enlarged player (the browser's fullscreen, or the wrapper over the window) is as high as the screen, so a picture that
// the screen's height limits (a phone on its side) would shrink when a line that took room from the stage comes and grow back after
// 6 s, under the pointer that is dragging Bunny's slider. The line is out of the flow there: nothing moves as it comes and goes.
// (The window cannot be resized while the browser is in fullscreen, so each size is its own test.)
for (const mode of ["fullscreen", "cover"] as const) {
  for (const size of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    const how = mode === "cover" ? "no Fullscreen API" : "the browser's fullscreen";
    test(`the seek line leaves the picture alone, enlarged (${how}) at ${size.width} × ${size.height}: the frame, the stage and the button stay where they are as the line comes and goes`, async ({ page }, info) => {
      const { lesson, view } = await student(page, `seekbox-${mode}-${size.width}`, info.project.name);
      if (mode === "cover")
        await page.addInitScript(() => {
          delete (Element.prototype as { requestFullscreen?: unknown }).requestFullscreen;
        });
      await page.clock.install();
      await page.setViewportSize(size);
      await openPlayerHarness(page, lesson, view);
      const fake = await fakeFrame(page);
      await subscribed(fake);
      await page.locator("[data-fullscreen]").click();
      if (mode === "cover") await expect(page.locator("[data-player]")).toHaveAttribute("data-expanded", "");
      else await expect.poll(() => page.evaluate(() => document.fullscreenElement?.hasAttribute("data-player") ?? false)).toBe(true);
      const note = page.locator("[data-seek-note]");
      await expect(note).toHaveText("");
      await playFrom(fake, 0, 6);
      const pointer = { x: size.width / 2, y: size.height / 2 }; // over the picture, as when she drags the slider
      const before = await settledLayout(page, pointer);
      await postFromPlayer(fake, "timeupdate", { seconds: 90, duration: 125 }); // the slider dragged far ahead
      await expect(note).toHaveText("Edasi saab kerida kuni kohani, kuhu oled jõudnud.");
      const shown = await settledLayout(page, pointer);
      expectSameLayout(shown, before, "nothing moves as the line comes");
      // the line itself: on the screen and inside the player, clear of the button, taking no clicks
      const line = box((await note.boundingBox())!);
      expect(line.x >= 0 && line.x + line.w <= size.width + 0.5 && line.y >= 0, `the line is on the screen ${JSON.stringify(line)}`).toBe(true);
      expect(line.x >= shown.wrapper.x - 0.5 && line.x + line.w <= shown.wrapper.x + shown.wrapper.w + 0.5, "the line is inside the player").toBe(true);
      expect(line.y + line.h <= shown.button.y + 0.5, "the line is clear of the button").toBe(true);
      expect(await note.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe("none");
      await page.clock.fastForward(6_000);
      await expect(note).toHaveText("");
      expectSameLayout(await settledLayout(page, pointer), before, "nothing moves as the line goes");
    });
  }
}
