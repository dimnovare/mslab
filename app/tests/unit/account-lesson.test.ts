// @vitest-environment happy-dom
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LessonPage } from "@/components/account/LessonPage";
import { lessonTexts } from "@/components/account/texts";
import { getDict, type Locale } from "@/i18n/locales";
import type { LessonView } from "@/server/lesson-data";

// One lesson's page (components/account/LessonPage.tsx, phase 3a Task 9) in a browser-like document (happy-dom), with fetch
// answered here and the player replaced by a stand-in (its own test is lesson-player.test.ts): the titles, the video or "Video
// lisandub peagi", the text, the files, the one button ("Järgmine õppetund", or "Märgi tehtuks" for a text lesson that is not
// done) and the quiet way back; the lock, the terms and the 404 answers.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type PlayerProps = { video: { embedUrl: string }; done: boolean; onProgress(answer: { done: boolean; next: number | null }): void; onSessionEnd?(): void };
/** The props of the player stand-in at its last render, and how many times one was mounted. */
const player = vi.hoisted(() => ({ props: null as PlayerProps | null, mounts: 0 }));

vi.mock("@/components/account/LessonPlayer", async () => {
  const { createElement: h, useEffect } = await import("react");
  return {
    LessonPlayer: (p: PlayerProps) => {
      player.props = p;
      useEffect(() => {
        player.mounts++;
      }, []);
      return h("div", { "data-player-mock": p.video.embedUrl });
    },
  };
});

const EMBED = "https://player.mediadelivery.net/embed/1/abc?token=t&expires=1";

const view = (over: { lesson?: Partial<LessonView["lesson"]>; video?: LessonView["video"]; files?: LessonView["files"]; next?: number | null } = {}): LessonView => ({
  course: { slug: "veebikursus", title: { et: "Veebikursus" } },
  module: { title: { et: "Sissejuhatus", ru: "Введение" } },
  lesson: { id: 7, title: { et: "Esimene tund", ru: "Первый урок" }, body: { et: "Vaata video lõpuni.\n\nSiis jätka.", ru: "Досмотрите видео." }, done: false, textOnly: false, ...over.lesson },
  video: "video" in over ? (over.video ?? null) : { state: "ready", embedUrl: EMBED, expires: 1, resumeAt: 0, durationSec: 125, shape: null },
  files: over.files ?? [{ id: 31, name: "Juhend.pdf", size: 820 }],
  next: "next" in over ? (over.next ?? null) : 8,
  watermark: "kati@example.test",
});
/** A text lesson (kind "text"): no video, done with "Märgi tehtuks". */
const textLesson = (over: Parameters<typeof view>[0] = {}) => view({ video: null, ...over, lesson: { textOnly: true, ...over.lesson } });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const $ = (selector: string) => document.querySelector(selector);
const $$ = (selector: string) => [...document.querySelectorAll(selector)];
const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  });
const mount = async (locale: Locale = "et") => {
  await act(async () => root.render(createElement(LessonPage, { slug: "veebikursus", lessonId: 7, locale, t: lessonTexts(getDict(locale)) })));
  await settle();
};
const answer = (body: LessonView) => fetchMock.mockImplementation(async (_input, init) => (init?.method === "POST" ? json(500, {}) : json(200, body)));
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
const actions = () => $("[data-lesson-actions]")!;
const nextButton = () => $("[data-lesson-next]");
const markDone = () => $("[data-mark-done]") as HTMLButtonElement | null;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  player.props = null;
  player.mounts = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the static shell", () => {
  test("renders the waiting look only: nothing of the lesson, no player", () => {
    const html = renderToStaticMarkup(createElement(LessonPage, { slug: "veebikursus", lessonId: 7, locale: "et", t: lessonTexts(getDict("et")) }));
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toMatch(/data-lesson|data-player|Järgmine|Tagasi/);
  });
});

describe("a video lesson", () => {
  test("not done: the module and lesson titles, the player, the text, the files, 'Järgmine õppetund' not yet open, and the way back", async () => {
    answer(view());
    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/konto/kursus/veebikursus/7");
    expect($("[data-lesson-page]")?.getAttribute("data-lesson-page")).toBe("7");
    expect($("[data-lesson-module]")?.textContent).toBe("Sissejuhatus");
    expect($("[data-lesson-page] h1")?.textContent).toBe("Esimene tund");
    expect($("[data-player-mock]")?.getAttribute("data-player-mock")).toBe(EMBED);
    expect(player.props?.done).toBe(false);
    expect($$("[data-lesson-text] p").map((p) => p.textContent)).toEqual(["Vaata video lõpuni.", "Siis jätka."]);

    const files = $("[data-lesson-files]")!;
    expect(files.querySelector("h2")?.textContent).toBe("Failid");
    const link = files.querySelector("a[data-lesson-file='31']")!;
    expect(link.getAttribute("href")).toBe("/api/konto/kursus/veebikursus/7/fail/31");
    expect(link.getAttribute("aria-label")).toBe("Lae alla: Juhend.pdf");
    expect(link.textContent).toBe("Lae alla");
    expect(files.textContent).toContain("Juhend.pdf");
    expect(files.textContent).toContain("1 kB");

    const next = nextButton()!;
    expect(next.tagName).not.toBe("A");
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(next.textContent).toBe("Järgmine õppetund");
    expect(actions().querySelector("[data-lesson-done]")).toBeNull();
    expect(markDone()).toBeNull(); // never on a video lesson
    const back = $("[data-lesson-back]")!;
    expect(back.tagName).toBe("A");
    expect(back.textContent).toBe("Tagasi koolitusele");
    expect(back.getAttribute("href")).toBe("/konto/kursus/veebikursus");
  });

  test("done: 'Õppetund tehtud ✓' as a status, and 'Järgmine õppetund' is a link to the next lesson", async () => {
    answer(view({ lesson: { done: true } }));
    await mount();
    const done = $("[data-lesson-done]")!;
    expect(done.textContent).toBe("Õppetund tehtud ✓");
    expect(done.parentElement?.getAttribute("role")).toBe("status"); // inside the status region
    expect(done.parentElement?.hasAttribute("data-lesson-status")).toBe(true);
    expect(player.props?.done).toBe(true);
    const next = nextButton()!;
    expect(next.tagName).toBe("A");
    expect(next.getAttribute("href")).toBe("/konto/kursus/veebikursus/8");
    expect(next.textContent).toBe("Järgmine õppetund");
    expect(next.getAttribute("aria-disabled")).toBeNull();
  });

  test("done and the last lesson (next: null): no 'Järgmine õppetund', only the way back", async () => {
    answer(view({ lesson: { done: true }, next: null }));
    await mount();
    expect($("[data-lesson-done]")?.textContent).toBe("Õppetund tehtud ✓");
    expect(nextButton()).toBeNull();
    expect($("[data-lesson-back]")?.textContent).toBe("Tagasi koolitusele");
  });

  test("not done and the last lesson: no button (nothing comes next), only the way back", async () => {
    answer(view({ next: null }));
    await mount();
    expect(nextButton()).toBeNull();
    expect($("[data-lesson-back]")).not.toBeNull();
  });

  test("the player's answer (watched to 90 %) shows done and opens 'Järgmine õppetund' without loading the lesson again (the video would reload)", async () => {
    answer(view());
    await mount();
    expect(player.mounts).toBe(1);
    // the status region is in the page before the lesson is done, empty; the done line comes into it
    const status = $("[data-lesson-actions] [role=status]")!;
    expect(status).not.toBeNull();
    expect(status.textContent).toBe("");
    await act(async () => player.props!.onProgress({ done: false, next: 8 }));
    expect($("[data-lesson-done]")).toBeNull();
    expect(nextButton()?.getAttribute("aria-disabled")).toBe("true");
    await act(async () => player.props!.onProgress({ done: true, next: 9 }));
    expect($("[data-lesson-done]")?.textContent).toBe("Õppetund tehtud ✓");
    expect($("[data-lesson-actions] [role=status]")).toBe(status); // the same region, now holding the line
    expect(status.textContent).toBe("Õppetund tehtud ✓");
    expect(document.activeElement).not.toBe($("[data-lesson-done]")); // she is watching: the focus stays where it was
    expect(nextButton()?.getAttribute("href")).toBe("/konto/kursus/veebikursus/9");
    expect(player.props?.done).toBe(true);
    // a later answer without a next lesson keeps the one the page knows
    await act(async () => player.props!.onProgress({ done: true, next: null }));
    expect(nextButton()?.getAttribute("href")).toBe("/konto/kursus/veebikursus/9");
    expect(fetchMock).toHaveBeenCalledTimes(1); // the lesson was not asked for again
    expect(player.mounts).toBe(1); // the same player: the video plays on
    expect($("[data-player-mock]")?.getAttribute("data-player-mock")).toBe(EMBED);
  });

  test("the session ended while she watches (a report answered 401): the page asks again and says another device signed in", async () => {
    let loads = 0;
    fetchMock.mockImplementation(async () => (++loads === 1 ? json(200, view()) : json(401, { ok: false, reason: "replaced" })));
    await mount();
    expect(player.props?.onSessionEnd).toBeTypeOf("function");
    await act(async () => player.props!.onSessionEnd!());
    await settle();
    expect(loads).toBe(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/konto/kursus/veebikursus/7");
    expect($("[data-account-state='replaced'] h1")?.textContent).toBe("Sinu konto avati teises seadmes");
    expect($("[data-lesson-page]")).toBeNull();
  });

  test("no lesson is asked for again when the tab comes back into view", async () => {
    answer(view());
    await mount();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("pageshow"));
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("no short text: no paragraphs; no files: no files section", async () => {
    answer(view({ lesson: { body: null }, files: [] }));
    await mount();
    expect($$("[data-lesson-text] p")).toHaveLength(0);
    expect($("[data-lesson-files]")).toBeNull();
  });

  test("a file's size in kB or MB", async () => {
    answer(view({ files: [{ id: 1, name: "a.pdf", size: 820_000 }, { id: 2, name: "b.pdf", size: 1_400_000 }] }));
    await mount();
    expect($("[data-lesson-files]")?.textContent).toContain("820 kB");
    expect($("[data-lesson-files]")?.textContent).toContain("1,4 MB");
  });
});

describe("a video lesson whose video is not ready ('soon')", () => {
  test("not done: 'Video lisandub peagi', no player, an empty button slot and only the quiet way back", async () => {
    answer(view({ video: { state: "soon" } }));
    await mount();
    expect($("[data-lesson-soon]")?.textContent).toBe("Video lisandub peagi");
    expect($("[data-player-mock]")).toBeNull();
    expect(markDone()).toBeNull();
    expect(nextButton()).toBeNull();
    expect($("[data-lesson-done]")).toBeNull();
    expect($$("[data-lesson-page] a, [data-lesson-page] button").map((e) => e.textContent)).toEqual(["Lae alla", "Tagasi koolitusele"]);
  });

  test("done before (the video is being set up again): 'Õppetund tehtud ✓' and the 'Järgmine õppetund' link", async () => {
    answer(view({ video: { state: "soon" }, lesson: { done: true } }));
    await mount();
    expect($("[data-lesson-soon]")?.textContent).toBe("Video lisandub peagi");
    expect($("[data-lesson-done]")?.textContent).toBe("Õppetund tehtud ✓");
    expect(nextButton()?.getAttribute("href")).toBe("/konto/kursus/veebikursus/8");
  });
});

describe("a text lesson", () => {
  test("not done: 'Märgi tehtuks' in the button's place, no 'Järgmine õppetund', no video", async () => {
    answer(textLesson());
    await mount();
    expect(markDone()?.textContent).toBe("Märgi tehtuks");
    expect(nextButton()).toBeNull();
    expect($("[data-player-mock]")).toBeNull();
    expect($("[data-lesson-soon]")).toBeNull();
  });

  test("'Märgi tehtuks' posts …/tehtud; the answer shows done, 'Järgmine õppetund' to the next lesson, and the focus moves to the done line", async () => {
    let reply: (r: Response) => void = () => {};
    fetchMock.mockImplementation((_input, init) => (init?.method === "POST" ? new Promise<Response>((r) => (reply = r)) : Promise.resolve(json(200, textLesson()))));
    await mount();
    await act(async () => {
      markDone()!.click();
      markDone()!.click(); // a second press while it runs sends nothing
    });
    expect(posts()).toHaveLength(1);
    expect(posts()[0][0]).toBe("/api/konto/kursus/veebikursus/7/tehtud");
    expect(posts()[0][1]).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(markDone()?.getAttribute("aria-disabled")).toBe("true");
    expect(markDone()?.textContent).toBe("Salvestan…");
    await act(async () => reply(json(200, { ok: true, done: true, next: 8 })));
    await settle();
    const done = $("[data-lesson-done]")!;
    expect(done.textContent).toBe("Õppetund tehtud ✓");
    expect(document.activeElement).toBe(done);
    expect(markDone()).toBeNull();
    expect(nextButton()?.tagName).toBe("A");
    expect(nextButton()?.getAttribute("href")).toBe("/konto/kursus/veebikursus/8");
    expect(fetchMock).toHaveBeenCalledTimes(2); // the lesson and the mark: nothing loaded again
  });

  test.each([
    ["a server error", () => Promise.resolve(json(500, { ok: false }))],
    ["no answer", () => Promise.reject(new TypeError("network"))],
    ["a 409", () => Promise.resolve(json(409, { ok: false, error: "video" }))],
  ])("%s: 'Ei õnnestunud salvestada. Proovi uuesti.' as an alert, the button stays and works again", async (_name, failure) => {
    fetchMock.mockImplementation((_input, init) => (init?.method === "POST" ? failure() : Promise.resolve(json(200, textLesson()))));
    await mount();
    await act(async () => markDone()!.click());
    await settle();
    const alert = $("[data-lesson-actions] [role=alert]")!;
    expect(alert.textContent).toBe("Ei õnnestunud salvestada. Proovi uuesti.");
    expect(markDone()?.textContent).toBe("Märgi tehtuks");
    expect(markDone()?.getAttribute("aria-disabled")).toBeNull();
    expect($("[data-lesson-done]")).toBeNull();

    fetchMock.mockImplementation(async (_input, init) => (init?.method === "POST" ? json(200, { ok: true, done: true, next: null }) : json(200, textLesson())));
    await act(async () => markDone()!.click());
    await settle();
    expect($("[data-lesson-done]")?.textContent).toBe("Õppetund tehtud ✓");
    expect($("[data-lesson-actions] [role=alert]")?.textContent ?? "").toBe("");
    expect(nextButton()?.getAttribute("href")).toBe("/konto/kursus/veebikursus/8"); // an answer without a next lesson keeps the page's
  });

  test("'Märgi tehtuks' answered 401 (another device signed in meanwhile): the page asks again and says so, not 'Proovi uuesti'", async () => {
    let loads = 0;
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === "POST") return json(401, { ok: false, reason: "replaced" });
      return ++loads === 1 ? json(200, textLesson()) : json(401, { ok: false, reason: "replaced" });
    });
    await mount();
    await act(async () => markDone()!.click());
    await settle();
    expect(posts()).toHaveLength(1);
    expect(loads).toBe(2); // the page's data asked for again
    expect($("[data-account-state='replaced'] h1")?.textContent).toBe("Sinu konto avati teises seadmes");
    expect(document.body.textContent).not.toContain("Ei õnnestunud salvestada");
  });

  test("'Märgi tehtuks' answered 401 when signed out: off to the login page", async () => {
    const replace = vi.spyOn(window.location, "replace").mockImplementation(() => {});
    let loads = 0;
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === "POST") return json(401, { ok: false, reason: "none" });
      return ++loads === 1 ? json(200, textLesson()) : json(401, { ok: false, reason: "none" });
    });
    await mount();
    await act(async () => markDone()!.click());
    await settle();
    expect(replace).toHaveBeenCalledWith("/konto/sisene#valja=1");
    expect($("[data-lesson-actions] [role=alert]")?.textContent ?? "").toBe("");
  });

  test("a text lesson already done: the done line and the 'Järgmine õppetund' link, no 'Märgi tehtuks'", async () => {
    answer(textLesson({ lesson: { done: true } }));
    await mount();
    expect($("[data-lesson-done]")?.textContent).toBe("Õppetund tehtud ✓");
    expect(markDone()).toBeNull();
    expect(nextButton()?.getAttribute("href")).toBe("/konto/kursus/veebikursus/8");
  });
});

describe("refusals", () => {
  test("a locked lesson (403 locked): the lock sentence and 'Jätka' to the lesson that is open", async () => {
    fetchMock.mockResolvedValue(json(403, { ok: false, error: "locked", next: 5 }));
    await mount();
    const state = $("[data-account-state='locked']")!;
    expect(state.querySelector("h1")?.textContent).toBe("Avaneb, kui eelmine õppetund on tehtud.");
    expect([...state.querySelectorAll("a, button")].map((e) => e.textContent)).toEqual(["Jätka"]);
    expect(state.querySelector("a")?.getAttribute("href")).toBe("/konto/kursus/veebikursus/5");
    expect($("[data-account-state='error']")).toBeNull();
  });

  test("a locked lesson with no open lesson left (next: null): 'Tagasi koolitusele' to the course page", async () => {
    fetchMock.mockResolvedValue(json(403, { ok: false, error: "locked", next: null }));
    await mount();
    const state = $("[data-account-state='locked']")!;
    expect([...state.querySelectorAll("a")].map((e) => [e.textContent, e.getAttribute("href")])).toEqual([["Tagasi koolitusele", "/konto/kursus/veebikursus"]]);
  });

  test("terms not accepted (403 terms): off to the course page, where the notice is; the waiting look meanwhile", async () => {
    const replace = vi.spyOn(window.location, "replace").mockImplementation(() => {});
    fetchMock.mockImplementation(async () => json(403, { ok: false, error: "terms" }));
    await mount();
    expect(replace).toHaveBeenCalledWith("/konto/kursus/veebikursus");
    expect($("[aria-busy='true']")).not.toBeNull();
    expect($("[data-lesson-page]")).toBeNull();
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount("ru");
    expect(replace).toHaveBeenLastCalledWith("/ru/konto/kursus/veebikursus");
  });

  test("an unknown lesson (the API's 404): 'Seda õppetundi ei leitud.' with 'Tagasi koolitusele'", async () => {
    fetchMock.mockResolvedValue(json(404, { ok: false }));
    await mount();
    const state = $("[data-account-state='notFound']")!;
    expect(state.querySelector("h1")?.textContent).toBe("Seda õppetundi ei leitud.");
    expect([...state.querySelectorAll("a")].map((e) => [e.textContent, e.getAttribute("href")])).toEqual([["Tagasi koolitusele", "/konto/kursus/veebikursus"]]);
  });

  test("a server error is the load error with its retry button", async () => {
    fetchMock.mockResolvedValue(json(500, { ok: false }));
    await mount();
    expect($("[data-account-state='error']")?.textContent).toContain("Ei õnnestunud laadida.");
  });
});

describe("Russian", () => {
  test("the titles, 'Следующий урок', 'Скачать' and 'Назад к курсу' with the /ru addresses", async () => {
    answer(view({ lesson: { done: true } }));
    await mount("ru");
    expect($("[data-lesson-module]")?.textContent).toBe("Введение");
    expect($("[data-lesson-page] h1")?.textContent).toBe("Первый урок");
    expect($$("[data-lesson-text] p").map((p) => p.textContent)).toEqual(["Досмотрите видео."]);
    expect(nextButton()?.textContent).toBe("Следующий урок");
    expect(nextButton()?.getAttribute("href")).toBe("/ru/konto/kursus/veebikursus/8");
    expect($("[data-lesson-file]")?.textContent).toBe("Скачать");
    expect($("[data-lesson-file]")?.getAttribute("aria-label")).toBe("Скачать: Juhend.pdf");
    expect($("[data-lesson-file]")?.getAttribute("href")).toBe("/api/konto/kursus/veebikursus/7/fail/31"); // the API has no locale
    expect($("[data-lesson-files]")?.textContent).toContain("1 КБ");
    expect($("[data-lesson-done]")?.textContent).toBe("Урок пройден ✓");
    expect($("[data-lesson-back]")?.getAttribute("href")).toBe("/ru/konto/kursus/veebikursus");
  });

  test("a locked lesson: 'Откроется, когда предыдущий урок будет пройден.' and 'Продолжить'", async () => {
    fetchMock.mockResolvedValue(json(403, { ok: false, error: "locked", next: 5 }));
    await mount("ru");
    const state = $("[data-account-state='locked']")!;
    expect(state.querySelector("h1")?.textContent).toBe("Откроется, когда предыдущий урок будет пройден.");
    expect(state.querySelector("a")?.textContent).toBe("Продолжить");
    expect(state.querySelector("a")?.getAttribute("href")).toBe("/ru/konto/kursus/veebikursus/5");
  });
});
