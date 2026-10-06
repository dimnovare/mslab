// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LessonPlayer } from "@/components/account/LessonPlayer";
import { lessonTexts } from "@/components/account/texts";
import { getDict } from "@/i18n/locales";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ORIGIN = "https://player.mediadelivery.net";
const VIDEO = { embedUrl: `${ORIGIN}/embed/12345/v1?token=t&expires=1&autoplay=false`, durationSec: 100, resumeAt: 0, shape: null };
let container: HTMLDivElement;
let root: Root;
const posted: { method?: string; value?: unknown; context?: string; version?: string }[] = [];
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const onProgress = vi.fn();

/** The player's window (the iframe's contentWindow): what the page posts to it is kept in `posted`. */
const playerWindow = { postMessage: (m: unknown) => posted.push(JSON.parse(String(m))) };
/** A message from the player's iframe (a Player.js JSON string), from `origin` and the window `source`. */
const fromPlayer = (event: string, value?: unknown, origin = ORIGIN, source: unknown = playerWindow) =>
  act(async () => {
    window.dispatchEvent(new MessageEvent("message", { origin, source: source as Window, data: JSON.stringify({ context: "player.js", version: "0.0.11", event, value }) }));
  });
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const progressPosts = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/progress")).map(([, init]) => JSON.parse(String(init!.body)));

beforeEach(async () => {
  vi.useFakeTimers();
  // happy-dom must not try to load Bunny's page into the iframe (no child frame navigation: it sets the frame's address and loads
  // nothing; `disableIframePageLoading` would do the same but print an error for every iframe)
  const happy = (window as unknown as { happyDOM?: { settings: { navigation: { disableChildFrameNavigation: boolean } } } }).happyDOM;
  if (happy) happy.settings.navigation.disableChildFrameNavigation = true;
  fetchMock.mockReset().mockResolvedValue(Response.json({ ok: true, done: false, next: 8 }));
  vi.stubGlobal("fetch", fetchMock);
  posted.length = 0;
  Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", { configurable: true, get: () => playerWindow });
  onProgress.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(createElement(LessonPlayer, { slug: "veebikursus", lessonId: 7, title: "Esimene", video: VIDEO, watermark: "kati@example.test", done: false, t: lessonTexts(getDict("et")), onProgress })),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("the iframe: Bunny's signed URL, no fullscreen and no picture-in-picture allowed, the origin-only referrer, a title", () => {
  const frame = container.querySelector("iframe")!;
  expect(frame.getAttribute("src")).toBe(VIDEO.embedUrl);
  expect(frame.getAttribute("allow")).toBe("autoplay; encrypted-media");
  expect(frame.hasAttribute("allowfullscreen")).toBe(false);
  expect(frame.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
  expect(frame.getAttribute("title")).toBe("Video: Esimene");
});

test("on ready it asks for timeupdate, pause and ended; a message from another origin is ignored", async () => {
  await fromPlayer("ready", {}, "https://evil.example");
  expect(posted).toEqual([]);
  await fromPlayer("ready", {});
  expect(posted.map((m) => [m.method, m.value])).toEqual([["addEventListener", "timeupdate"], ["addEventListener", "pause"], ["addEventListener", "ended"]]);
  expect(posted[0]).toMatchObject({ context: "player.js", version: "0.0.11" });
});

test("progress: the furthest second every 15 s (only when it moved), and at pause and end; the answer reaches the page", async () => {
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 12.4, duration: 100 });
  await tick(15_000);
  expect(progressPosts()).toEqual([{ watchedSec: 12 }]);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/konto/kursus/veebikursus/7/progress");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "same-origin" });
  await tick(15_000);
  expect(progressPosts()).toHaveLength(1); // nothing new to say
  await fromPlayer("timeupdate", { seconds: 40, duration: 100 });
  await fromPlayer("timeupdate", { seconds: 20, duration: 100 }); // a jump back does not lower it
  await fromPlayer("pause");
  await tick(0);
  expect(progressPosts().at(-1)).toEqual({ watchedSec: 40 });
  fetchMock.mockResolvedValue(Response.json({ ok: true, done: true, next: 8 }));
  await fromPlayer("ended");
  await tick(0);
  expect(progressPosts().at(-1)).toEqual({ watchedSec: 100 });
  expect(onProgress).toHaveBeenLastCalledWith({ done: true, next: 8 });
});

test("pause and ended back to back: the second report waits for the first and is still sent", async () => {
  let release: (r: Response) => void = () => {};
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 50, duration: 100 });
  await fromPlayer("pause");
  await fromPlayer("ended");
  expect(progressPosts()).toEqual([{ watchedSec: 50 }]);
  release(Response.json({ ok: true, done: false, next: 8 }));
  await tick(0);
  expect(progressPosts()).toEqual([{ watchedSec: 50 }, { watchedSec: 100 }]);
});

test("the watermark: the e-mail over the video, hidden from screen readers, in another corner every 60 s", async () => {
  const mark = container.querySelector("[data-watermark]")!;
  expect(mark.textContent).toBe("kati@example.test");
  expect(mark.getAttribute("aria-hidden")).toBe("true");
  const first = mark.getAttribute("data-corner");
  await tick(60_000);
  expect(mark.getAttribute("data-corner")).not.toBe(first);
});

test("our fullscreen enlarges the wrapper (with the watermark); without the Fullscreen API it fills the window and Escape closes it", async () => {
  const wrapper = container.querySelector("[data-player]") as Omit<HTMLElement, "requestFullscreen"> & { requestFullscreen?: () => Promise<void> };
  const request = vi.fn(async () => {});
  wrapper.requestFullscreen = request;
  const button = container.querySelector("[data-fullscreen]") as HTMLButtonElement;
  expect(button.textContent).toBe("Täisekraan");
  await act(async () => button.click());
  expect(request).toHaveBeenCalledOnce();
  wrapper.requestFullscreen = undefined;
  await act(async () => button.click());
  expect(wrapper.hasAttribute("data-expanded")).toBe(true);
  expect(button.textContent).toBe("Välju täisekraanist");
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(wrapper.hasAttribute("data-expanded")).toBe(false);
});

test("no word from the player for 20 s: 'Video ei lae. Proovi hiljem uuesti.'", async () => {
  await tick(20_000);
  expect(container.querySelector("[data-player-error]")?.textContent).toBe("Video ei lae. Proovi hiljem uuesti.");
});

// ---- beyond the brief: the controller's notes for Task 8 (robust reports, leaving the page, the origin, text only) ----

type PlayerProps = Parameters<typeof LessonPlayer>[0];
const props = (changed: Partial<PlayerProps> = {}): PlayerProps => ({
  slug: "veebikursus",
  lessonId: 7,
  title: "Esimene",
  video: VIDEO,
  watermark: "kati@example.test",
  done: false,
  t: lessonTexts(getDict("et")),
  onProgress,
  ...changed,
});
/** Mounts a fresh player in place of the one beforeEach made (a new key: new state), with these props changed. */
const remount = (changed: Partial<PlayerProps>) => act(async () => root.render(createElement(LessonPlayer, { key: Math.random(), ...props(changed) })));
/** The same player (no key) with these props changed, as a page re-rendering it would. */
const rerender = (changed: Partial<PlayerProps>) => act(async () => root.render(createElement(LessonPlayer, props(changed))));
/** The tab hidden (document.visibilityState "hidden" and its event). */
const hideTab = async () => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  try {
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  } finally {
    delete (document as unknown as { visibilityState?: string }).visibilityState;
  }
};
const json = (body: unknown, status = 200) => async () => Response.json(body, { status });

test("a report the server cannot take now (429, 5xx) or that never arrives: the furthest second goes with the next 15 s report, no error shown, no retry in between", async () => {
  fetchMock.mockImplementation(json({ ok: true, done: false, next: 8 }));
  fetchMock.mockImplementationOnce(json({ ok: false, error: "rate" }, 429));
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 20, duration: 100 });
  await tick(15_000);
  expect(progressPosts()).toEqual([{ watchedSec: 20 }]);
  await fromPlayer("timeupdate", { seconds: 25, duration: 100 });
  await fromPlayer("pause"); // after a refusal the next try is the 15 s report, not this pause
  await fromPlayer("ended");
  await tick(0);
  expect(progressPosts()).toHaveLength(1);
  fetchMock.mockImplementationOnce(json({ ok: false, error: "server" }, 500));
  await tick(15_000);
  expect(progressPosts()).toEqual([{ watchedSec: 20 }, { watchedSec: 100 }]);
  fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));
  await tick(15_000);
  expect(progressPosts()).toHaveLength(3);
  await tick(15_000);
  expect(progressPosts()).toEqual([{ watchedSec: 20 }, { watchedSec: 100 }, { watchedSec: 100 }, { watchedSec: 100 }]);
  expect(onProgress).toHaveBeenCalledOnce(); // only the answer that came
  expect(onProgress).toHaveBeenCalledWith({ done: false, next: 8 });
  await tick(15_000);
  expect(progressPosts()).toHaveLength(4); // said; nothing new
  expect(container.querySelector("[data-player-error], [role=alert]")).toBeNull();
});

test("a report that fails while pause and end wait behind it: they go with the next 15 s report, not at once", async () => {
  let release: (r: Response) => void = () => {};
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 50, duration: 100 });
  await fromPlayer("pause");
  await fromPlayer("ended");
  release(Response.json({ ok: false, error: "rate" }, { status: 429 }));
  await tick(0);
  expect(progressPosts()).toEqual([{ watchedSec: 50 }]);
  await tick(15_000);
  expect(progressPosts()).toEqual([{ watchedSec: 50 }, { watchedSec: 100 }]);
});

test.each([
  [403, { ok: false, error: "locked", next: 3 }],
  [404, { ok: false }],
  [409, { ok: false, error: "video" }],
  [401, { ok: false, error: "none" }],
])("a lesson the server refuses for good (%i): no more reports at all", async (status, body) => {
  fetchMock.mockImplementationOnce(json(body, status));
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 20, duration: 100 });
  await tick(15_000);
  expect(progressPosts()).toHaveLength(1);
  await fromPlayer("timeupdate", { seconds: 60, duration: 100 });
  await fromPlayer("pause");
  await fromPlayer("ended");
  await tick(45_000);
  await act(async () => {
    window.dispatchEvent(new Event("pagehide"));
  });
  expect(progressPosts()).toHaveLength(1);
  expect(onProgress).not.toHaveBeenCalled();
  expect(container.querySelector("[data-player-error], [role=alert]")).toBeNull();
});

test("leaving the page (the tab hidden, or pagehide): the last point at once, with keepalive, once; nothing when there is nothing new", async () => {
  await fromPlayer("ready", {});
  await act(async () => {
    window.dispatchEvent(new Event("pagehide"));
  });
  expect(progressPosts()).toEqual([]);
  await fromPlayer("timeupdate", { seconds: 33.7, duration: 100 });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  try {
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("pagehide"));
    });
  } finally {
    delete (document as unknown as { visibilityState?: string }).visibilityState;
  }
  expect(progressPosts()).toEqual([{ watchedSec: 33 }]);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/konto/kursus/veebikursus/7/progress");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "same-origin", keepalive: true });
  await tick(15_000);
  expect(progressPosts()).toHaveLength(1); // the answer came: the 15 s report has nothing new
});

test("the player goes away inside the site (a link to the next lesson): its last point is sent with keepalive", async () => {
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 48, duration: 100 });
  await act(async () => root.render(createElement("p")));
  expect(progressPosts()).toEqual([{ watchedSec: 48 }]);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ keepalive: true });
});

test("a lesson already done reports nothing; one resumed reports only past the saved second", async () => {
  await remount({ done: true });
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 80, duration: 100 });
  await fromPlayer("ended");
  await tick(15_000);
  expect(progressPosts()).toEqual([]);
  await remount({ video: { ...VIDEO, resumeAt: 42 } });
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 42.6, duration: 100 });
  await tick(15_000);
  expect(progressPosts()).toEqual([]);
  await fromPlayer("timeupdate", { seconds: 43, duration: 100 });
  await tick(15_000);
  expect(progressPosts()).toEqual([{ watchedSec: 43 }]);
});

test("messages of other shapes from the player's origin change nothing", async () => {
  await act(async () => {
    for (const data of ["hello", "{bad json", JSON.stringify({ context: "player.js" }), JSON.stringify({ context: "other", event: "ready" }), { context: "player.js", event: 7 }, null])
      window.dispatchEvent(new MessageEvent("message", { origin: ORIGIN, source: playerWindow as unknown as Window, data }));
  });
  await fromPlayer("timeupdate", { seconds: "x", duration: 100 });
  await fromPlayer("timeupdate", null);
  await fromPlayer("somethingElse", { seconds: 90 });
  await tick(15_000);
  expect(posted).toEqual([]);
  expect(progressPosts()).toEqual([]);
});

test("the watermark is text, whatever the address holds", async () => {
  await remount({ watermark: '<img src=x onerror="alert(1)">@example.test' });
  const mark = container.querySelector("[data-watermark]")!;
  expect(mark.textContent).toBe('<img src=x onerror="alert(1)">@example.test');
  expect(mark.querySelector("img")).toBeNull();
});

test("in the browser's own fullscreen the button says 'Välju täisekraanist' and leaves it", async () => {
  const wrapper = container.querySelector("[data-player]")!;
  const exit = vi.fn(async () => {});
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => wrapper });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
  try {
    await act(async () => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    const button = container.querySelector("[data-fullscreen]") as HTMLButtonElement;
    expect(button.textContent).toBe("Välju täisekraanist");
    await act(async () => button.click());
    expect(exit).toHaveBeenCalledOnce();
  } finally {
    delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement;
    delete (document as unknown as { exitFullscreen?: unknown }).exitFullscreen;
  }
});

test("a video that does not load has no fullscreen button; a student already in fullscreen keeps the way out; a late 'ready' brings it back", async () => {
  await tick(20_000);
  expect(container.querySelector("[data-player-error]")).not.toBeNull();
  expect(container.querySelector("[data-fullscreen]")).toBeNull();
  await remount({});
  (container.querySelector("[data-player]") as unknown as { requestFullscreen?: unknown }).requestFullscreen = undefined;
  await act(async () => (container.querySelector("[data-fullscreen]") as HTMLButtonElement).click());
  await tick(20_000);
  expect(container.querySelector("[data-player-error]")).not.toBeNull();
  expect(container.querySelector("[data-fullscreen]")?.textContent).toBe("Välju täisekraanist");
  await act(async () => (container.querySelector("[data-fullscreen]") as HTMLButtonElement).click());
  expect(container.querySelector("[data-player]")!.hasAttribute("data-expanded")).toBe(false);
  expect(container.querySelector("[data-fullscreen]")).toBeNull();
  await fromPlayer("ready", {});
  expect(container.querySelector("[data-player-error]")).toBeNull();
  expect(container.querySelector("[data-fullscreen]")?.textContent).toBe("Täisekraan");
});

// ---- fix round 1 (review) ----

test("only the player's own window is heard: its origin from another window (another frame, the page itself) is ignored", async () => {
  await fromPlayer("ready", {}, ORIGIN, window);
  await fromPlayer("ready", {}, ORIGIN, null);
  await fromPlayer("ready", {}, ORIGIN, { postMessage: () => {} });
  expect(posted).toEqual([]);
  await fromPlayer("ready", {});
  expect(posted).toHaveLength(3);
  await fromPlayer("timeupdate", { seconds: 90, duration: 100 }, ORIGIN, window);
  await fromPlayer("ended", undefined, ORIGIN, window);
  await tick(15_000);
  expect(progressPosts()).toEqual([]);
});

test.each([408, 503])("%i is 'try later' too: the point waits for the next 15 s report", async (status) => {
  fetchMock.mockImplementation(json({ ok: true, done: false, next: 8 }));
  fetchMock.mockImplementationOnce(json({ ok: false }, status));
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 20, duration: 100 });
  await tick(15_000);
  await fromPlayer("pause");
  expect(progressPosts()).toEqual([{ watchedSec: 20 }]);
  await tick(15_000);
  expect(progressPosts()).toEqual([{ watchedSec: 20 }, { watchedSec: 20 }]);
  expect(onProgress).toHaveBeenCalledOnce();
});

test("once the player is gone, nothing it started reaches the page and no queued report goes out (only the leaving one)", async () => {
  let release: (r: Response) => void = () => {};
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 50, duration: 100 });
  await fromPlayer("pause"); // on its way
  await fromPlayer("timeupdate", { seconds: 60, duration: 100 });
  await fromPlayer("pause"); // waits behind it
  await act(async () => root.render(createElement("p")));
  expect(progressPosts()).toEqual([{ watchedSec: 50 }, { watchedSec: 60 }]); // the second is the leaving one
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ keepalive: true });
  release(Response.json({ ok: true, done: true, next: 8 }));
  await tick(45_000);
  expect(progressPosts()).toHaveLength(2);
  expect(onProgress).not.toHaveBeenCalled();
});

test("another lesson in the same place (the page does not key the player): it starts afresh; the first one's last point goes to the first lesson", async () => {
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 50, duration: 100 });
  const second = { embedUrl: `${ORIGIN}/embed/12345/v2?token=u&expires=1&autoplay=false`, durationSec: 200, resumeAt: 0, shape: null };
  await rerender({ lessonId: 8, title: "Teine", video: second });
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/konto/kursus/veebikursus/7/progress"]);
  expect(progressPosts()).toEqual([{ watchedSec: 50 }]);
  expect(container.querySelector("iframe")?.getAttribute("src")).toBe(second.embedUrl);
  expect(container.querySelector("iframe")?.getAttribute("title")).toBe("Video: Teine");
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 10, duration: 200 }); // below the first lesson's 50: the new one starts from its own 0
  await tick(15_000);
  expect(fetchMock.mock.calls.at(-1)![0]).toBe("/api/konto/kursus/veebikursus/8/progress");
  expect(progressPosts().at(-1)).toEqual({ watchedSec: 10 });
});

test("while the leaving report is on its way, the 15 s report and a pause do not send the same second again; if it fails, the 15 s report does", async () => {
  let release: (r: Response) => void = () => {};
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 30, duration: 100 });
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
  await hideTab();
  expect(progressPosts()).toEqual([{ watchedSec: 30 }]);
  await fromPlayer("pause");
  await tick(15_000);
  await hideTab();
  expect(progressPosts()).toHaveLength(1);
  release(Response.json({ ok: false, error: "server" }, { status: 503 }));
  await tick(15_000);
  expect(progressPosts()).toEqual([{ watchedSec: 30 }, { watchedSec: 30 }]);
  expect(fetchMock.mock.calls[1][1]).not.toHaveProperty("keepalive");
});

test("the lesson becomes done while the player is open (the page learns it): the same player plays on and reports nothing more", async () => {
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 30, duration: 100 });
  const frame = container.querySelector("iframe");
  await rerender({ done: true });
  expect(container.querySelector("iframe")).toBe(frame);
  await fromPlayer("timeupdate", { seconds: 70, duration: 100 });
  await fromPlayer("pause");
  await tick(30_000);
  await act(async () => {
    window.dispatchEvent(new Event("pagehide"));
  });
  expect(progressPosts()).toEqual([]);
});

test("the window-filling wrapper keeps the focus inside; closing it, or leaving the browser's fullscreen, gives the focus back to the button", async () => {
  const outside = document.createElement("button");
  document.body.append(outside);
  try {
    const wrapper = container.querySelector("[data-player]") as unknown as { requestFullscreen?: unknown; hasAttribute(name: string): boolean };
    wrapper.requestFullscreen = undefined;
    const button = container.querySelector("[data-fullscreen]") as HTMLButtonElement;
    await act(async () => button.click());
    expect(wrapper.hasAttribute("data-expanded")).toBe(true);
    await act(async () => outside.focus());
    expect(document.activeElement).toBe(button);
    await act(async () => button.blur());
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(wrapper.hasAttribute("data-expanded")).toBe(false);
    expect(document.activeElement).toBe(button);
    await act(async () => outside.focus());
    expect(document.activeElement).toBe(outside); // closed: no trap any more
    // the browser's own fullscreen, left by the browser (Escape there)
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => wrapper });
    await act(async () => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
    await act(async () => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(document.activeElement).toBe(button);
  } finally {
    outside.remove();
    delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement;
  }
});

test("the error's live region is in the page from the start, empty; the sentence comes into it", async () => {
  const live = container.querySelector("[data-player-frame] [role=status]")!;
  expect(live.textContent).toBe("");
  await tick(20_000);
  expect(container.querySelector("[data-player-frame] [role=status]")).toBe(live);
  expect(live.textContent).toBe("Video ei lae. Proovi hiljem uuesti.");
});

test("Russian: the button and the error in Russian", async () => {
  await remount({ t: lessonTexts(getDict("ru")) });
  expect(container.querySelector("[data-fullscreen]")?.textContent).toBe("Во весь экран");
  expect(container.querySelector("iframe")?.getAttribute("title")).toBe("Видео: Esimene");
  await tick(20_000);
  expect(container.querySelector("[data-player-error]")?.textContent).toBe("Видео не загружается. Попробуйте позже.");
});

// ---- the video's shape (Task 8b): the frame takes the video's aspect; unknown means 16:9 ----

/** What the wrapper says about the frame's shape: the CSS number `--aspect` (the frame and the enlarged box read it) and `data-upright`. */
const shapeOf = () => {
  const wrapper = container.querySelector("[data-player]") as HTMLElement;
  return { aspect: Number(wrapper.style.getPropertyValue("--aspect")), upright: wrapper.hasAttribute("data-upright") };
};

test("no shape known (null): a 16:9 frame, not upright", () => {
  expect(shapeOf()).toEqual({ aspect: 16 / 9, upright: false });
});

test("the frame gets the video's own aspect, width / height; upright and square videos are marked for the height cap", async () => {
  for (const [width, height, upright] of [[1920, 1080, false], [1080, 1920, true], [1440, 1080, false], [1080, 1080, true], [1080, 1350, true], [3840, 1080, false]] as const) {
    await remount({ video: { ...VIDEO, shape: { width, height } } });
    expect(shapeOf(), `${width} × ${height}`).toEqual({ aspect: width / height, upright });
  }
  await remount({ video: { ...VIDEO, shape: { width: 1080, height: 1920 } } });
  expect((container.querySelector("[data-player]") as HTMLElement).style.getPropertyValue("--aspect")).toBe("0.5625");
});

test("a shape that cannot be one (0, one side, not a number, a fraction, too big) is no shape: 16:9", async () => {
  for (const shape of [{ width: 0, height: 0 }, { width: 1080, height: 0 }, { width: NaN, height: 1920 }, { width: 1080.5, height: 1920 }, { width: 1080, height: 20_000 }, { width: -1080, height: 1920 }]) {
    await remount({ video: { ...VIDEO, shape } });
    expect(shapeOf(), JSON.stringify(shape)).toEqual({ aspect: 16 / 9, upright: false });
  }
});

test("another lesson in the same place with another shape: the frame follows it (the player starts afresh with the new video)", async () => {
  await remount({ video: { ...VIDEO, shape: { width: 1080, height: 1920 } } });
  expect(shapeOf().upright).toBe(true);
  const other = { embedUrl: `${ORIGIN}/embed/12345/v9?token=u&expires=1&autoplay=false`, durationSec: 60, resumeAt: 0, shape: { width: 1920, height: 1080 } };
  await rerender({ lessonId: 9, title: "Üheksas", video: other });
  expect(shapeOf()).toEqual({ aspect: 16 / 9, upright: false });
  const again = { ...other, embedUrl: `${ORIGIN}/embed/12345/v10?token=u&expires=1&autoplay=false`, shape: { width: 1080, height: 1920 } };
  await rerender({ lessonId: 10, title: "Kümnes", video: again });
  expect(shapeOf()).toEqual({ aspect: 9 / 16, upright: true });
});

test("the shape changes nothing else: the same iframe, the watermark inside the frame, one fullscreen button", async () => {
  await remount({ video: { ...VIDEO, shape: { width: 1080, height: 1920 } } });
  const frame = container.querySelector("[data-player-frame]")!;
  expect(frame.querySelector("iframe")?.getAttribute("src")).toBe(VIDEO.embedUrl);
  expect(frame.querySelector("[data-watermark]")?.textContent).toBe("kati@example.test");
  expect(container.querySelectorAll("[data-fullscreen]")).toHaveLength(1);
});
