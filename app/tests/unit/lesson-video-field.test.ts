// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AdminVideo } from "@/server/lesson-videos";

// The lesson drawer's video field (LessonVideoField.tsx) in a browser-like document: every state's words and buttons, the poll every
// 5 s while Bunny processes (paused while the tab is hidden, every 30 s after 10 minutes), and an upload through tus-js-client (replaced here by FakeUpload, which records what it was given).

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const actions = vi.hoisted(() => ({ createLessonVideo: vi.fn(), checkLessonVideo: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn());
const uploads = vi.hoisted(() => [] as { file: File; options: Record<string, unknown> & { [k: string]: unknown }; start: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> }[]);

vi.mock("@/server/actions/admin-lessons", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("tus-js-client", () => ({
  Upload: class FakeUpload {
    start = vi.fn();
    abort = vi.fn(async () => {});
    constructor(file: File, options: Record<string, unknown>) {
      uploads.push({ file, options, start: this.start, abort: this.abort });
    }
  },
}));

import { LessonVideoField } from "@/components/admin/LessonVideoField";

const WAITING = "Õpilased näevad „Video lisandub peagi“ ja järgmine õppetund jääb lukku, kuni video on valmis.";
const TICKET = { videoId: "v", libraryId: "424242", expires: 99, signature: "sig", endpoint: "https://tus.example/tusupload", title: "K · L" };
const video = (status: AdminVideo["status"], over: Partial<AdminVideo> = {}): AdminVideo => ({ status, durationSec: null, replacing: false, ...over });

let container: HTMLDivElement;
let root: Root;
const $ = (selector: string) => document.querySelector(selector);
const text = () => container.textContent ?? "";
const field = () => $("[data-lesson-video]") as HTMLElement;
const input = () => $("[data-lesson-video] input[type='file']") as HTMLInputElement | null;
const label = () => (input() ? (input()!.labels?.[0]?.textContent ?? "") : null);
const alert = () => $("[data-lesson-video] [role='alert']")?.textContent ?? null;
/** Lets promises and React settle (real timers). */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  });
const mount = async (v: AdminVideo, bunnyReady = true) => {
  await act(async () => root.render(createElement(LessonVideoField, { lessonId: 7, bunnyReady, video: v })));
};
/** Picks `file` in the field's file input, as a browser does (the change event). */
const pick = async (file: File) => {
  const el = input();
  expect(el, "the file input").not.toBeNull();
  Object.defineProperty(el, "files", { value: [file], configurable: true });
  await act(async () => el!.dispatchEvent(new Event("change", { bubbles: true })));
};
/** The tab's visibility, as a browser reports it: the property and the event. */
const visibility = async (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
};
const mp4 = () => new File([new Uint8Array(10)], "tund.mp4", { type: "video/mp4" });

beforeEach(() => {
  actions.createLessonVideo.mockReset();
  actions.checkLessonVideo.mockReset();
  refresh.mockReset();
  uploads.length = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  delete (document as unknown as Record<string, unknown>).visibilityState; // back to the document's own (visible)
});

describe("what the field says", () => {
  test("Bunny not set up: “Video seadistamata” and its hint, nothing else (no file input, no question to the server)", async () => {
    await mount(video("none"), false);
    await settle();
    expect($("[data-lesson-video] [role='status']")?.textContent).toBe("Video seadistamata");
    expect(text()).toContain("Videoteenuse seaded puuduvad — anna arendajale teada.");
    expect(input()).toBeNull();
    expect(text()).not.toContain(WAITING);
    expect(actions.checkLessonVideo).not.toHaveBeenCalled();
  });

  test("no video yet: “Vali video”, the hint, and what students see meanwhile", async () => {
    await mount(video("none"));
    await settle();
    expect(label()).toBe("Vali video");
    expect(input()?.accept).toBe("video/*");
    expect(text()).toContain("Video laaditakse otse videoteenusesse. Hoia leht lahti, kuni üleslaadimine on lõppenud.");
    expect($("[data-video-waiting]")?.textContent).toBe(WAITING);
    expect(field().getAttribute("data-lesson-video")).toBe("none");
    expect(actions.checkLessonVideo).not.toHaveBeenCalled();
  });

  test("the waiting hint shows while students have nothing to watch: none, uploading, processing, failed; not when ready, nor while the old video plays", async () => {
    actions.checkLessonVideo.mockResolvedValue({ ok: false, error: "server" });
    for (const [v, waiting] of [
      [video("none"), true],
      [video("uploading"), true],
      [video("processing"), true],
      [video("failed"), true],
      [video("ready", { durationSec: 754 }), false],
      [video("uploading", { durationSec: 300, replacing: true }), false],
      [video("processing", { durationSec: 300, replacing: true }), false],
      [video("failed", { durationSec: 300, replacing: true }), false],
    ] as const) {
      await act(async () => root.unmount());
      root = createRoot(container);
      await mount(v);
      await settle();
      expect(Boolean($("[data-video-waiting]")), `${v.status}${v.replacing ? " replacing" : ""}`).toBe(waiting);
    }
  });

  test("ready: “Valmis · 12:34”, “Asenda video” and that the old video stays until the new one is ready", async () => {
    await mount(video("ready", { durationSec: 754 }));
    await settle();
    expect($("[data-lesson-video] [role='status']")?.textContent).toBe("Valmis · 12:34");
    expect(label()).toBe("Asenda video");
    expect(text()).toContain("Vana video jääb õpilastele nähtavaks, kuni uus on valmis.");
    expect(text()).not.toContain(WAITING);
    expect(actions.checkLessonVideo).not.toHaveBeenCalled();
  });

  test("failed: “Töötlemine ebaõnnestus” and “Lae uuesti üles”; with an old video still playing, the replace hint too", async () => {
    await mount(video("failed"));
    await settle();
    expect(text()).toContain("Töötlemine ebaõnnestus");
    expect(label()).toBe("Lae uuesti üles");
    expect(text()).not.toContain("Vana video jääb");
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount(video("failed", { durationSec: 300, replacing: true }));
    await settle();
    expect(text()).toContain("Vana video jääb õpilastele nähtavaks, kuni uus on valmis.");
  });

  test("uploading with no upload in this page: “Üleslaadimine katkes” and “Proovi uuesti”; Bunny is asked once", async () => {
    actions.checkLessonVideo.mockResolvedValue({ ok: true, video: video("uploading") });
    await mount(video("uploading"));
    await settle();
    expect(text()).toContain("Üleslaadimine katkes");
    expect(label()).toBe("Proovi uuesti");
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(1);
    expect(actions.checkLessonVideo).toHaveBeenCalledWith(7);
    expect(refresh).not.toHaveBeenCalled();
  });

  test("“Üleslaadimine katkes” is in the error tone like “Töötlemine ebaõnnestus”; “Töötlemisel…” is the quiet hint tone", async () => {
    actions.checkLessonVideo.mockResolvedValue({ ok: false, error: "server" });
    const tone = async (v: AdminVideo) => {
      await act(async () => root.unmount());
      root = createRoot(container);
      await mount(v);
      await settle();
      return $("[data-lesson-video] [data-video-status]")?.className;
    };
    const interrupted = await tone(video("uploading"));
    const failed = await tone(video("failed"));
    const processing = await tone(video("processing"));
    const ready = await tone(video("ready", { durationSec: 754 }));
    expect(interrupted).toBeTruthy();
    expect(interrupted).toBe(failed);
    expect(new Set([interrupted, processing, ready]).size).toBe(3);
  });

  test("an interrupted upload that did arrive at Bunny meanwhile turns into Töötlemisel… on the first answer, and the list follows", async () => {
    actions.checkLessonVideo.mockResolvedValue({ ok: true, video: video("processing") });
    await mount(video("uploading"));
    await settle();
    expect($("[data-lesson-video] [role='status']")?.textContent).toBe("Töötlemisel…");
    expect(input()).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("the poll", () => {
  test("processing: asked on mount and every 5 s; ready shows “Valmis · 2:05”, then the poll stops and the page is refreshed once", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    actions.checkLessonVideo.mockResolvedValue({ ok: true, video: video("processing") });
    await mount(video("processing"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect($("[data-lesson-video] [role='status']")?.textContent).toBe("Töötlemisel…");
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(4999));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();

    actions.checkLessonVideo.mockResolvedValue({ ok: true, video: video("ready", { durationSec: 125 }) });
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(3);
    expect($("[data-lesson-video] [role='status']")?.textContent).toBe("Valmis · 2:05");
    expect(field().getAttribute("data-lesson-video")).toBe("ready");
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(3);
  });

  test("a failed poll is ignored: the next one tries again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    actions.checkLessonVideo.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ ok: false, error: "server" }).mockResolvedValue({ ok: true, video: video("failed") });
    await mount(video("processing"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect($("[data-lesson-video] [role='status']")?.textContent).toBe("Töötlemisel…");
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect($("[data-lesson-video] [role='status']")?.textContent).toBe("Töötlemisel…");
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(3);
    expect(text()).toContain("Töötlemine ebaõnnestus");
    expect(alert()).toBeNull();
  });

  const FAKE = ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] as const;

  test("a hidden tab is not asked about: the poll pauses, asks at once when the tab is shown again, and goes on every 5 s", async () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    actions.checkLessonVideo.mockResolvedValue({ ok: true, video: video("processing") });
    await mount(video("processing"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(1); // on opening
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    await visibility("hidden"); // 3 s into the wait: the timer is dropped
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(1);
    await visibility("visible");
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(2); // at once
    await act(async () => vi.advanceTimersByTimeAsync(4999));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(4);
  });

  test("a tab that is hidden when the field opens waits for being shown (the first read on opening is the only one)", async () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    await visibility("hidden");
    actions.checkLessonVideo.mockResolvedValue({ ok: true, video: video("processing") });
    await mount(video("processing"));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(1);
    await visibility("visible");
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(3);
  });

  test("hiding and showing the tab while a read is on its way starts no second poll", async () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    let release: (v: unknown) => void = () => {};
    actions.checkLessonVideo.mockResolvedValueOnce({ ok: true, video: video("processing") }); // on opening
    actions.checkLessonVideo.mockReturnValueOnce(new Promise((resolve) => (release = resolve))); // the first tick: slow
    actions.checkLessonVideo.mockResolvedValue({ ok: true, video: video("processing") });
    await mount(video("processing"));
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(2);
    await visibility("hidden");
    await visibility("visible"); // the read is still on its way: no new one
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(2);
    await act(async () => release({ ok: true, video: video("processing") }));
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(4); // one chain, not two
  });

  test("after 10 minutes of processing the poll backs off from 5 s to 30 s", async () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    actions.checkLessonVideo.mockResolvedValue({ ok: true, video: video("processing") });
    await mount(video("processing"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(1 + 120); // on opening, then every 5 s for 10 minutes
    await act(async () => vi.advanceTimersByTimeAsync(29_999));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(121);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(122);
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(132); // every 30 s from there
  });

  test("a hidden tab is asked once on being shown after the 10 minutes, and goes on every 30 s", async () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    actions.checkLessonVideo.mockResolvedValue({ ok: true, video: video("processing") });
    await mount(video("processing"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await visibility("hidden");
    await act(async () => vi.advanceTimersByTimeAsync(15 * 60_000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(1);
    await visibility("visible");
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(29_999));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(3);
  });

  test("showing the tab after the video went ready (or the field is gone) asks nothing", async () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    actions.checkLessonVideo.mockResolvedValue({ ok: true, video: video("ready", { durationSec: 125 }) });
    await mount(video("processing"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(field().getAttribute("data-lesson-video")).toBe("ready");
    await visibility("hidden");
    await visibility("visible");
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    root = createRoot(container);
    await visibility("hidden");
    await visibility("visible");
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(1);
  });

  test("the poll stops when the field goes away (the drawer closed)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    actions.checkLessonVideo.mockResolvedValue({ ok: true, video: video("processing") });
    await mount(video("processing"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(1);
  });
});

describe("an upload", () => {
  test("a picked video: a signed ticket, then tus straight to Bunny with the ticket's headers and both metadata fields; progress; Töötlemisel… when sent", async () => {
    actions.createLessonVideo.mockResolvedValue({ ok: true, ticket: TICKET });
    actions.checkLessonVideo.mockResolvedValue({ ok: true, video: video("processing") });
    await mount(video("none"));
    const file = mp4();
    await pick(file);
    await settle();
    expect(actions.createLessonVideo).toHaveBeenCalledWith(7);
    expect(uploads).toHaveLength(1);
    const [u] = uploads;
    expect(u.file).toBe(file);
    expect(u.options).toMatchObject({
      endpoint: "https://tus.example/tusupload",
      retryDelays: [0, 3000, 5000, 10000, 20000, 60000],
      storeFingerprintForResuming: false,
      headers: { AuthorizationSignature: "sig", AuthorizationExpire: "99", VideoId: "v", LibraryId: "424242" },
      metadata: { filetype: "video/mp4", title: "K · L" },
    });
    expect(u.start).toHaveBeenCalledTimes(1);
    expect(input()).toBeNull(); // no second pick while one is on its way
    expect($("[data-video-waiting]")?.textContent).toBe(WAITING);

    await act(async () => (u.options.onProgress as (a: number, b: number) => void)(5, 10));
    expect(text()).toContain("Laen üles… 50 %");
    expect(($("[data-lesson-video] progress") as HTMLProgressElement).value).toBe(50);
    expect(actions.checkLessonVideo).not.toHaveBeenCalled(); // no poll during the upload

    await act(async () => (u.options.onSuccess as () => void)());
    await settle();
    expect($("[data-lesson-video] [role='status']")?.textContent).toBe("Töötlemisel…");
    expect($("[data-lesson-video] progress")).toBeNull();
    expect(actions.checkLessonVideo).toHaveBeenCalledWith(7);
  });

  test("sent, but Bunny has not registered it yet (still status 0): it stays Töötlemisel… and the poll goes on", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    actions.createLessonVideo.mockResolvedValue({ ok: true, ticket: TICKET });
    actions.checkLessonVideo.mockResolvedValue({ ok: true, video: video("uploading") });
    await mount(video("none"));
    await pick(mp4());
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await act(async () => (uploads[0].options.onSuccess as () => void)());
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(actions.checkLessonVideo).toHaveBeenCalledTimes(1);
    expect($("[data-lesson-video] [role='status']")?.textContent).toBe("Töötlemisel…");
    expect(text()).not.toContain("Üleslaadimine katkes");
    actions.checkLessonVideo.mockResolvedValue({ ok: true, video: video("ready", { durationSec: 125 }) });
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect($("[data-lesson-video] [role='status']")?.textContent).toBe("Valmis · 2:05");
  });

  test("“Asenda video”: during the upload the old video still plays, so no waiting hint; the replace hint says so", async () => {
    actions.createLessonVideo.mockResolvedValue({ ok: true, ticket: TICKET });
    await mount(video("ready", { durationSec: 754 }));
    await pick(mp4());
    await settle();
    expect(uploads).toHaveLength(1);
    expect($("[data-video-waiting]")).toBeNull();
  });

  test("a file that is not a video (or an empty one): “Vali videofail.” and nothing is asked", async () => {
    await mount(video("none"));
    await pick(new File(["tere"], "tund.txt", { type: "text/plain" }));
    await settle();
    expect(alert()).toBe("Vali videofail.");
    await pick(new File([], "tühi.mp4", { type: "video/mp4" }));
    await settle();
    expect(alert()).toBe("Vali videofail.");
    expect(actions.createLessonVideo).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
    expect(label()).toBe("Vali video"); // she can pick again
  });

  test("the server refusing the ticket, or the upload failing: “Video üleslaadimine ei õnnestunud. Proovi uuesti.” as an alert", async () => {
    actions.createLessonVideo.mockResolvedValue({ ok: false, error: "server" });
    await mount(video("none"));
    await pick(mp4());
    await settle();
    expect(alert()).toBe("Video üleslaadimine ei õnnestunud. Proovi uuesti.");
    expect(uploads).toHaveLength(0);
    expect(label()).toBe("Vali video");

    actions.createLessonVideo.mockResolvedValue({ ok: true, ticket: TICKET });
    await pick(mp4());
    await settle();
    expect(alert()).toBeNull();
    await act(async () => (uploads[0].options.onError as (e: Error) => void)(new Error("x")));
    expect(alert()).toBe("Video üleslaadimine ei õnnestunud. Proovi uuesti.");
    // the lesson is "uploading" on the server now: picking again is “Proovi uuesti”
    expect(label()).toBe("Proovi uuesti");
  });

  test("the server saying Bunny is not set up shows “Video seadistamata”; a lesson gone meanwhile says so", async () => {
    actions.createLessonVideo.mockResolvedValue({ ok: false, error: "notFound" });
    await mount(video("none"));
    await pick(mp4());
    await settle();
    expect(alert()).toBe("Seda ei leitud. Laadi leht uuesti.");
    actions.createLessonVideo.mockResolvedValue({ ok: false, error: "setup" });
    await pick(mp4());
    await settle();
    expect($("[data-lesson-video] [role='status']")?.textContent).toBe("Video seadistamata");
    expect(input()).toBeNull();
  });

  test("while it uploads, leaving the page is warned about, and closing the field stops the upload", async () => {
    actions.createLessonVideo.mockResolvedValue({ ok: true, ticket: TICKET });
    await mount(video("none"));
    await pick(mp4());
    await settle();
    const leave = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);
    await act(async () => root.unmount());
    root = createRoot(container);
    expect(uploads[0].abort).toHaveBeenCalledTimes(1);
    const later = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });
});
